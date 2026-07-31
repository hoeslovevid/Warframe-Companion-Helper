/**
 * warframe.market session via browser JWT cookie (no password stored).
 * Uses API v2 (v1 profile/orders are deprecated).
 * Token is kept with Electron safeStorage when available.
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import type { WfmContract, WfmOrder, WfmSession } from '../../shared/types'

const API_V1 = 'https://api.warframe.market/v1'
const API_V2 = 'https://api.warframe.market/v2'

export type { WfmContract, WfmOrder, WfmSession }

type StoredBlob = {
  v: 1
  /** Electron safeStorage ciphertext as base64, or plaintext when encryption unavailable. */
  enc: boolean
  data: string
}

type ItemMeta = { name: string; slug: string }

let memoryJwt: string | null = null
let cachedProfile: {
  ingameName: string
  platform: string
  reputation: number
  status: string
} | null = null
let itemMetaById: Map<string, ItemMeta> | null = null
let itemMetaPromise: Promise<Map<string, ItemMeta>> | null = null

function tokenPath() {
  return path.join(app.getPath('userData'), 'wfm-jwt.bin')
}

export function normalizeWfmJwt(raw: string): string {
  let t = String(raw || '').trim().replace(/^["']|["']$/g, '')
  try {
    // Browser cookie UI sometimes copies a URL-encoded value.
    if (/%[0-9A-Fa-f]{2}/.test(t)) t = decodeURIComponent(t)
  } catch {
    // keep raw
  }
  // Users sometimes paste "JWT eyJ..." or the full cookie string.
  t = t.replace(/^JWT\s+/i, '')
  t = t.replace(/^Bearer\s+/i, '')
  if (/^JWT=/i.test(t)) t = t.replace(/^JWT=/i, '')
  // Cookie dumps: JWT=...; Path=/; ...
  const cookieMatch = t.match(/(?:^|[;\s])JWT=([^;]+)/i)
  if (cookieMatch?.[1]) {
    t = cookieMatch[1].trim()
    try {
      if (/%[0-9A-Fa-f]{2}/.test(t)) t = decodeURIComponent(t)
    } catch {
      // keep
    }
    t = t.replace(/^JWT\s+/i, '')
  }
  return t.trim()
}

function looksLikeJwt(token: string): boolean {
  // Compact JWT: header.payload.sig (base64url; allow optional padding)
  return /^[A-Za-z0-9_-]+=*\.[A-Za-z0-9_-]+=*\.[A-Za-z0-9_-]+=*$/.test(token)
}

function writeToken(token: string) {
  const file = tokenPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let blob: StoredBlob
  if (safeStorage.isEncryptionAvailable()) {
    blob = {
      v: 1,
      enc: true,
      data: safeStorage.encryptString(token).toString('base64'),
    }
  } else {
    blob = { v: 1, enc: false, data: token }
  }
  fs.writeFileSync(file, JSON.stringify(blob), { encoding: 'utf8', mode: 0o600 })
}

function readToken(): string | null {
  if (memoryJwt) return memoryJwt
  try {
    const file = tokenPath()
    if (!fs.existsSync(file)) return null
    const raw = fs.readFileSync(file, 'utf8')
    const blob = JSON.parse(raw) as StoredBlob
    if (!blob?.data) return null
    if (blob.enc) {
      if (!safeStorage.isEncryptionAvailable()) return null
      return safeStorage.decryptString(Buffer.from(blob.data, 'base64'))
    }
    return blob.data
  } catch {
    return null
  }
}

export function clearWfmJwt(): WfmSession {
  memoryJwt = null
  cachedProfile = null
  try {
    const file = tokenPath()
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch {
    // ignore
  }
  return {
    linked: false,
    ingameName: null,
    platform: null,
    reputation: null,
    status: null,
    error: null,
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Platform: 'pc',
    Language: 'en',
    // v2 expects Bearer (v1 "JWT …" profile routes are deprecated)
    Authorization: `Bearer ${token}`,
    // Mirror the browser cookie so either auth path works
    Cookie: `JWT=${token}`,
    'User-Agent': 'EverythingWarframe/market',
  }
}

function apiErrorMessage(status: number, body: string): string {
  try {
    const json = JSON.parse(body) as {
      error?: string | Record<string, string[] | string>
    }
    if (typeof json.error === 'string' && json.error) {
      if (/deprecated/i.test(json.error)) {
        return 'warframe.market API changed — update Everything Warframe'
      }
      return json.error
    }
    if (json.error && typeof json.error === 'object') {
      const parts: string[] = []
      for (const v of Object.values(json.error)) {
        if (Array.isArray(v)) parts.push(...v.map(String))
        else if (v) parts.push(String(v))
      }
      if (parts.length) {
        const joined = parts.join(', ')
        if (/jwt\.(invalid|unauthorized)/i.test(joined) || /unauthorized/i.test(joined)) {
          return 'JWT rejected — paste a fresh cookie from warframe.market'
        }
        return joined
      }
    }
  } catch {
    // fall through
  }
  if (status === 401 || status === 403) {
    return 'JWT rejected — paste a fresh cookie from warframe.market'
  }
  return `warframe.market request failed (${status})`
}

async function fetchProfile(token: string): Promise<{
  ingameName: string
  platform: string
  reputation: number
  status: string
}> {
  const res = await fetch(`${API_V2}/me`, {
    headers: authHeaders(token),
  })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(apiErrorMessage(res.status, body))
  }
  const json = JSON.parse(body) as {
    data?: {
      ingameName?: string
      ingame_name?: string
      platform?: string
      reputation?: number
      status?: string
    }
  }
  const p = json.data
  const ingameName = p?.ingameName || p?.ingame_name
  if (!ingameName) {
    throw new Error('Profile response missing ingame name — check the JWT')
  }
  return {
    ingameName,
    platform: p?.platform || 'pc',
    reputation: Number(p?.reputation) || 0,
    status: p?.status || 'offline',
  }
}

async function ensureItemMeta(): Promise<Map<string, ItemMeta>> {
  if (itemMetaById) return itemMetaById
  if (itemMetaPromise) return itemMetaPromise
  itemMetaPromise = (async () => {
    const map = new Map<string, ItemMeta>()
    try {
      const res = await fetch(`${API_V2}/items`, {
        headers: {
          Accept: 'application/json',
          Platform: 'pc',
          Language: 'en',
          'User-Agent': 'EverythingWarframe/market',
        },
      })
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{
            id?: string
            slug?: string
            i18n?: Record<string, { name?: string }>
          }>
        }
        for (const item of json.data || []) {
          if (!item.id || !item.slug) continue
          const name =
            item.i18n?.en?.name ||
            item.slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          map.set(item.id, { name, slug: item.slug })
        }
      }
    } catch {
      // leave empty; orders still show item ids
    }
    itemMetaById = map
    return map
  })()
  try {
    return await itemMetaPromise
  } finally {
    itemMetaPromise = null
  }
}

async function resolveItemMeta(itemId: string): Promise<ItemMeta> {
  const cached = await ensureItemMeta()
  const hit = cached.get(itemId)
  if (hit) return hit
  try {
    const res = await fetch(`${API_V2}/item/${encodeURIComponent(itemId)}`, {
      headers: {
        Accept: 'application/json',
        Platform: 'pc',
        Language: 'en',
        'User-Agent': 'EverythingWarframe/market',
      },
    })
    if (res.ok) {
      const json = (await res.json()) as {
        data?: {
          slug?: string
          i18n?: Record<string, { name?: string }>
        }
      }
      const slug = json.data?.slug
      if (slug) {
        const name =
          json.data?.i18n?.en?.name ||
          slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        const meta = { name, slug }
        cached.set(itemId, meta)
        return meta
      }
    }
  } catch {
    // ignore
  }
  return { name: `Item ${itemId.slice(0, 8)}…`, slug: '' }
}

export async function getWfmSession(): Promise<WfmSession> {
  const token = readToken()
  if (!token) {
    return {
      linked: false,
      ingameName: null,
      platform: null,
      reputation: null,
      status: null,
      error: null,
    }
  }
  try {
    if (!cachedProfile) {
      cachedProfile = await fetchProfile(token)
      memoryJwt = token
    }
    return {
      linked: true,
      ingameName: cachedProfile.ingameName,
      platform: cachedProfile.platform,
      reputation: cachedProfile.reputation,
      status: cachedProfile.status,
      error: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Session invalid'
    clearWfmJwt()
    return {
      linked: false,
      ingameName: null,
      platform: null,
      reputation: null,
      status: null,
      error: message,
    }
  }
}

export async function setWfmJwt(raw: string): Promise<WfmSession> {
  const token = normalizeWfmJwt(raw)
  if (!token || token.length < 20) {
    return {
      linked: false,
      ingameName: null,
      platform: null,
      reputation: null,
      status: null,
      error: 'Paste the JWT cookie value from warframe.market',
    }
  }
  if (!looksLikeJwt(token)) {
    return {
      linked: false,
      ingameName: null,
      platform: null,
      reputation: null,
      status: null,
      error: 'That does not look like a JWT (expected three base64 segments)',
    }
  }
  try {
    const profile = await fetchProfile(token)
    writeToken(token)
    memoryJwt = token
    cachedProfile = profile
    return {
      linked: true,
      ingameName: profile.ingameName,
      platform: profile.platform,
      reputation: profile.reputation,
      status: profile.status,
      error: null,
    }
  } catch (err) {
    return {
      linked: false,
      ingameName: null,
      platform: null,
      reputation: null,
      status: null,
      error: err instanceof Error ? err.message : 'Could not verify JWT',
    }
  }
}

export async function fetchWfmMyOrders(): Promise<{
  orders: WfmOrder[]
  error: string | null
}> {
  const token = readToken()
  if (!token) return { orders: [], error: 'Not signed in' }
  try {
    const res = await fetch(`${API_V2}/orders/my`, {
      headers: authHeaders(token),
    })
    const body = await res.text()
    if (res.status === 401 || res.status === 403) {
      clearWfmJwt()
      return { orders: [], error: apiErrorMessage(res.status, body) }
    }
    if (!res.ok) {
      return { orders: [], error: apiErrorMessage(res.status, body) }
    }
    const json = JSON.parse(body) as {
      data?: Array<Record<string, unknown>>
    }
    const raw = json.data || []
    await ensureItemMeta()

    const orders: WfmOrder[] = []
    for (const o of raw) {
      const id = String(o.id || '')
      if (!id) continue
      const itemId = String(o.itemId || o.item_id || '')
      const meta = itemId ? await resolveItemMeta(itemId) : { name: 'Unknown item', slug: '' }
      const typeRaw = String(o.type || o.order_type || 'sell').toLowerCase()
      const orderType = typeRaw === 'buy' ? 'buy' : 'sell'
      orders.push({
        id,
        orderType,
        platinum: Number(o.platinum) || 0,
        quantity: Number(o.quantity) || 1,
        visible: o.visible !== false,
        itemName: meta.name,
        itemUrlName: meta.slug || null,
        lastUpdate:
          typeof o.updatedAt === 'string'
            ? o.updatedAt
            : typeof o.updated_at === 'string'
              ? o.updated_at
              : null,
      })
    }
    orders.sort((a, b) => {
      if (a.orderType !== b.orderType) return a.orderType === 'sell' ? -1 : 1
      return a.itemName.localeCompare(b.itemName)
    })
    return { orders, error: null }
  } catch (err) {
    return {
      orders: [],
      error: err instanceof Error ? err.message : 'Failed to load orders',
    }
  }
}

export async function deleteWfmOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const token = readToken()
  if (!token) return { ok: false, error: 'Not signed in' }
  const id = String(orderId || '').trim()
  if (!id) return { ok: false, error: 'Missing order id' }
  try {
    const res = await fetch(`${API_V2}/order/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })
    const body = await res.text()
    if (res.status === 401 || res.status === 403) {
      clearWfmJwt()
      return { ok: false, error: apiErrorMessage(res.status, body) }
    }
    if (!res.ok) {
      return { ok: false, error: apiErrorMessage(res.status, body) }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete failed' }
  }
}

export async function updateWfmOrder(
  input: import('../../shared/types').WfmUpdateOrderInput,
): Promise<{ ok: boolean; error?: string; order?: WfmOrder }> {
  const token = readToken()
  if (!token) return { ok: false, error: 'Not signed in' }
  const id = String(input.orderId || '').trim()
  if (!id) return { ok: false, error: 'Missing order id' }

  const payload: Record<string, unknown> = {}
  if (input.platinum != null) {
    const platinum = Math.floor(Number(input.platinum))
    if (!Number.isFinite(platinum) || platinum < 1) {
      return { ok: false, error: 'Platinum must be at least 1' }
    }
    payload.platinum = platinum
  }
  if (input.quantity != null) {
    const quantity = Math.floor(Number(input.quantity))
    if (!Number.isFinite(quantity) || quantity < 1) {
      return { ok: false, error: 'Quantity must be at least 1' }
    }
    payload.quantity = quantity
  }
  if (typeof input.visible === 'boolean') payload.visible = input.visible
  if (!Object.keys(payload).length) return { ok: false, error: 'Nothing to update' }

  try {
    const res = await fetch(`${API_V2}/order/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    if (res.status === 401 || res.status === 403) {
      clearWfmJwt()
      return { ok: false, error: apiErrorMessage(res.status, text) }
    }
    if (!res.ok) return { ok: false, error: apiErrorMessage(res.status, text) }

    let order: WfmOrder | undefined
    try {
      const json = JSON.parse(text) as { data?: Record<string, unknown> }
      const d = json.data || {}
      if (d.id) {
        const itemId = String(d.itemId || d.item_id || '')
        const meta = itemId
          ? await resolveItemMeta(itemId)
          : { name: 'Unknown item', slug: '' }
        order = {
          id: String(d.id),
          orderType: String(d.type || '').toLowerCase() === 'buy' ? 'buy' : 'sell',
          platinum: Number(d.platinum) || Number(payload.platinum) || 0,
          quantity: Number(d.quantity) || Number(payload.quantity) || 1,
          visible: d.visible !== false,
          itemName: meta.name,
          itemUrlName: meta.slug || null,
          lastUpdate: typeof d.updatedAt === 'string' ? d.updatedAt : null,
        }
      }
    } catch {
      // ok without parsed body
    }
    return { ok: true, order }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Update failed' }
  }
}

function titleCaseSlug(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function attrLabel(urlName: string): string {
  return titleCaseSlug(urlName)
}

function formatContract(raw: Record<string, unknown>): WfmContract | null {
  const id = String(raw.id || '')
  if (!id) return null
  const item = (raw.item || {}) as Record<string, unknown>
  const type = String(item.type || '').toLowerCase()
  let kind: WfmContract['kind'] = 'unknown'
  if (type === 'riven' || type === 'lich' || type === 'sister') kind = type

  const weapon = item.weapon_url_name ? titleCaseSlug(String(item.weapon_url_name)) : null
  let title = 'Contract'
  let detail: string | null = null

  if (kind === 'riven') {
    const rivenName = item.name ? String(item.name) : ''
    title = [weapon, rivenName].filter(Boolean).join(' ') || 'Riven'
    const attrs = Array.isArray(item.attributes) ? item.attributes : []
    const parts: string[] = []
    for (const a of attrs) {
      if (!a || typeof a !== 'object') continue
      const row = a as { url_name?: string; value?: number; positive?: boolean }
      if (!row.url_name) continue
      const sign = row.positive === false ? '−' : '+'
      const val = typeof row.value === 'number' ? row.value : ''
      parts.push(`${sign}${attrLabel(row.url_name)}${val !== '' ? ` ${val}` : ''}`)
    }
    const rank = item.mod_rank != null ? `R${item.mod_rank}` : null
    const rolls = item.re_rolls != null ? `${item.re_rolls} rolls` : null
    detail = [rank, rolls, parts.join(', ')].filter(Boolean).join(' · ') || null
  } else if (kind === 'lich' || kind === 'sister') {
    title = `${kind === 'lich' ? 'Kuva Lich' : 'Sister'} · ${weapon || 'Unknown'}`
    const bits = [
      item.element ? titleCaseSlug(String(item.element)) : null,
      item.damage != null ? `${item.damage}%` : null,
      item.having_ephemera ? 'Ephemera' : null,
      item.quirk ? titleCaseSlug(String(item.quirk)) : null,
    ].filter(Boolean)
    detail = bits.length ? bits.join(' · ') : null
  } else {
    title = weapon || titleCaseSlug(type || 'unknown')
  }

  const startingPrice = Number(raw.starting_price) || 0
  const buyout =
    raw.buyout_price == null || raw.buyout_price === ''
      ? null
      : Number(raw.buyout_price)
  const topBid =
    raw.top_bid == null || raw.top_bid === '' ? null : Number(raw.top_bid)

  return {
    id,
    kind,
    title,
    detail,
    startingPrice,
    buyoutPrice: Number.isFinite(buyout as number) ? (buyout as number) : null,
    topBid: Number.isFinite(topBid as number) ? (topBid as number) : null,
    isDirectSell: raw.is_direct_sell === true || raw.isDirectSell === true,
    visible: raw.visible !== false,
    closed: raw.closed === true,
    marketUrl: `https://warframe.market/auction/${id}`,
    lastUpdate:
      typeof raw.updated === 'string'
        ? raw.updated
        : typeof raw.updatedAt === 'string'
          ? raw.updatedAt
          : null,
  }
}

function parseAuctionList(payload: unknown): WfmContract[] {
  let raw: unknown[] = []
  if (Array.isArray(payload)) raw = payload
  else if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.auctions)) raw = obj.auctions
    else if (Array.isArray(obj.data)) raw = obj.data
    else if (obj.payload && typeof obj.payload === 'object') {
      const p = obj.payload as Record<string, unknown>
      if (Array.isArray(p.auctions)) raw = p.auctions
    }
  }
  const out: WfmContract[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const c = formatContract(row as Record<string, unknown>)
    if (c && !c.closed) out.push(c)
  }
  out.sort((a, b) => a.title.localeCompare(b.title))
  return out
}

async function authGetJson(
  url: string,
  token: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const headerSets: Record<string, string>[] = [
    authHeaders(token),
    {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Platform: 'pc',
      Language: 'en',
      Authorization: `JWT ${token}`,
      Cookie: `JWT=${token}`,
      'User-Agent': 'EverythingWarframe/market',
    },
  ]
  let last = { ok: false, status: 0, body: '' }
  for (const headers of headerSets) {
    const res = await fetch(url, { headers })
    const body = await res.text()
    last = { ok: res.ok, status: res.status, body }
    if (res.ok) return last
    // Don't burn through tokens on hard auth failures for the second style
    if (res.status !== 401 && res.status !== 403) return last
  }
  return last
}

export async function fetchWfmMyContracts(): Promise<{
  contracts: WfmContract[]
  error: string | null
}> {
  const token = readToken()
  if (!token) return { contracts: [], error: 'Not signed in' }

  // Prefer authenticated "my auctions" endpoints; fall back to public profile list.
  const authUrls = [
    `${API_V2}/auctions/my`,
    `${API_V2}/contracts/my`,
    `${API_V2}/contracts`,
    `${API_V1}/profile/auctions`,
  ]
  for (const url of authUrls) {
    try {
      const res = await authGetJson(url, token)
      if (res.status === 404) continue
      if (res.ok) {
        try {
          const json = JSON.parse(res.body) as unknown
          return { contracts: parseAuctionList(json), error: null }
        } catch {
          return { contracts: [], error: 'Could not parse contracts response' }
        }
      }
      if (res.status === 401 || res.status === 403) {
        // try next / public fallback — don't clear JWT yet (v1/v2 auth style differs)
        continue
      }
    } catch {
      // try next
    }
  }

  const name = cachedProfile?.ingameName
  if (name) {
    try {
      const res = await fetch(
        `${API_V1}/profile/${encodeURIComponent(name)}/auctions`,
        {
          headers: {
            Accept: 'application/json',
            Platform: 'pc',
            Language: 'en',
            'User-Agent': 'EverythingWarframe/market',
          },
        },
      )
      const body = await res.text()
      if (res.ok) {
        const json = JSON.parse(body) as unknown
        return { contracts: parseAuctionList(json), error: null }
      }
      return { contracts: [], error: apiErrorMessage(res.status, body) }
    } catch (err) {
      return {
        contracts: [],
        error: err instanceof Error ? err.message : 'Failed to load contracts',
      }
    }
  }

  return {
    contracts: [],
    error: 'Could not load contracts — try refreshing after linking again',
  }
}

export async function deleteWfmContract(
  contractId: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = readToken()
  if (!token) return { ok: false, error: 'Not signed in' }
  const id = String(contractId || '').trim()
  if (!id) return { ok: false, error: 'Missing contract id' }

  const attempts: Array<{ url: string; method: string; body?: string }> = [
    { url: `${API_V2}/auction/${encodeURIComponent(id)}`, method: 'DELETE' },
    { url: `${API_V2}/contract/${encodeURIComponent(id)}`, method: 'DELETE' },
    {
      url: `${API_V1}/auctions/entry/${encodeURIComponent(id)}`,
      method: 'PUT',
      body: JSON.stringify({ visible: false }),
    },
  ]

  let lastError = 'Cancel failed'
  for (const attempt of attempts) {
    for (const headers of [
      authHeaders(token),
      {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Platform: 'pc',
        Language: 'en',
        Authorization: `JWT ${token}`,
        Cookie: `JWT=${token}`,
        'User-Agent': 'EverythingWarframe/market',
      },
    ]) {
      try {
        const res = await fetch(attempt.url, {
          method: attempt.method,
          headers,
          body: attempt.body,
        })
        const body = await res.text()
        if (res.ok) return { ok: true }
        if (res.status === 404 || res.status === 405) {
          lastError = apiErrorMessage(res.status, body)
          break
        }
        lastError = apiErrorMessage(res.status, body)
        if (res.status !== 401 && res.status !== 403) {
          return { ok: false, error: lastError }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Cancel failed'
      }
    }
  }
  return { ok: false, error: lastError }
}

type CatalogItem = { id: string; slug: string; name: string }

let itemCatalog: CatalogItem[] | null = null
let itemCatalogPromise: Promise<CatalogItem[]> | null = null

async function loadItemCatalog(): Promise<CatalogItem[]> {
  if (itemCatalog) return itemCatalog
  if (itemCatalogPromise) return itemCatalogPromise
  itemCatalogPromise = (async () => {
    const list: CatalogItem[] = []
    try {
      const res = await fetch(`${API_V2}/items`, {
        headers: {
          Accept: 'application/json',
          Platform: 'pc',
          Language: 'en',
          'User-Agent': 'EverythingWarframe/market',
        },
      })
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{
            id?: string
            slug?: string
            i18n?: Record<string, { name?: string }>
          }>
        }
        for (const item of json.data || []) {
          if (!item.id || !item.slug) continue
          list.push({
            id: item.id,
            slug: item.slug,
            name: item.i18n?.en?.name || item.slug.replace(/_/g, ' '),
          })
        }
      }
    } catch {
      // empty
    }
    itemCatalog = list
    return list
  })()
  try {
    return await itemCatalogPromise
  } finally {
    itemCatalogPromise = null
  }
}

export async function searchWfmItems(query: string): Promise<
  import('../../shared/types').WfmItemHint[]
> {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (q.length < 2) return []
  const catalog = await loadItemCatalog()
  const hits: import('../../shared/types').WfmItemHint[] = []
  for (const item of catalog) {
    if (item.slug.includes(q.replace(/\s+/g, '_')) || item.name.toLowerCase().includes(q)) {
      hits.push(item)
      if (hits.length >= 20) break
    }
  }
  return hits
}

async function resolveItemId(input: {
  itemId?: string
  itemSlugOrName?: string
}): Promise<{ id: string; slug: string; name: string } | null> {
  if (input.itemId && /^[a-f0-9]{24}$/i.test(input.itemId)) {
    const catalog = await loadItemCatalog()
    const hit = catalog.find((c) => c.id === input.itemId)
    return hit || { id: input.itemId, slug: '', name: input.itemId }
  }
  const raw = String(input.itemSlugOrName || '').trim()
  if (!raw) return null
  const slug = raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  const catalog = await loadItemCatalog()
  const exact = catalog.find((c) => c.slug === slug)
  if (exact) return exact
  const byName = catalog.find((c) => c.name.toLowerCase() === raw.toLowerCase())
  if (byName) return byName
  const partial = catalog.find(
    (c) => c.slug.includes(slug) || c.name.toLowerCase().includes(raw.toLowerCase()),
  )
  return partial || null
}

export async function createWfmOrder(
  input: import('../../shared/types').WfmCreateOrderInput,
): Promise<{ ok: boolean; error?: string; order?: import('../../shared/types').WfmOrder }> {
  const token = readToken()
  if (!token) return { ok: false, error: 'Not signed in' }
  const platinum = Math.floor(Number(input.platinum))
  const quantity = Math.floor(Number(input.quantity) || 1)
  if (!Number.isFinite(platinum) || platinum < 1) {
    return { ok: false, error: 'Platinum must be at least 1' }
  }
  if (!Number.isFinite(quantity) || quantity < 1) {
    return { ok: false, error: 'Quantity must be at least 1' }
  }
  const item = await resolveItemId(input)
  if (!item) return { ok: false, error: 'Could not find that item on warframe.market' }

  const body: Record<string, unknown> = {
    itemId: item.id,
    type: input.orderType === 'buy' ? 'buy' : 'sell',
    platinum,
    quantity,
    visible: input.visible !== false,
  }
  if (input.rank != null && Number.isFinite(Number(input.rank))) {
    body.rank = Math.floor(Number(input.rank))
  }

  try {
    const res = await fetch(`${API_V2}/order`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, error: apiErrorMessage(res.status, text) }
    let order: import('../../shared/types').WfmOrder | undefined
    try {
      const json = JSON.parse(text) as { data?: Record<string, unknown> }
      const d = json.data || {}
      order = {
        id: String(d.id || ''),
        orderType: d.type === 'buy' ? 'buy' : 'sell',
        platinum: Number(d.platinum) || platinum,
        quantity: Number(d.quantity) || quantity,
        visible: d.visible !== false,
        itemName: item.name,
        itemUrlName: item.slug || null,
        lastUpdate: typeof d.updatedAt === 'string' ? d.updatedAt : null,
      }
    } catch {
      // ok without parsed order
    }
    return { ok: true, order }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Create order failed' }
  }
}

function parseAttributesText(text: string): Array<{
  url_name: string
  value: number
  positive: boolean
}> {
  const out: Array<{ url_name: string; value: number; positive: boolean }> = []
  for (const line of String(text || '').split(/\n|;/)) {
    const t = line.trim()
    if (!t) continue
    const m = t.match(/^([+\-−])?\s*([a-z0-9_]+)\s+(-?\d+(?:\.\d+)?)\s*$/i)
    if (!m) continue
    const positive = m[1] !== '-' && m[1] !== '−'
    out.push({
      url_name: m[2].toLowerCase(),
      value: Number(m[3]),
      positive,
    })
  }
  return out
}

export async function createWfmContract(
  input: import('../../shared/types').WfmCreateContractInput,
): Promise<{
  ok: boolean
  error?: string
  contract?: import('../../shared/types').WfmContract
}> {
  const token = readToken()
  if (!token) return { ok: false, error: 'Not signed in' }
  const weapon = String(input.weaponUrlName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!weapon) return { ok: false, error: 'Weapon url name is required' }
  const starting = Math.floor(Number(input.startingPrice))
  if (!Number.isFinite(starting) || starting < 1) {
    return { ok: false, error: 'Starting price must be at least 1' }
  }
  const buyout =
    input.buyoutPrice == null || input.buyoutPrice === ('' as unknown)
      ? null
      : Math.floor(Number(input.buyoutPrice))
  const isDirect = input.isDirectSell !== false

  let item: Record<string, unknown>
  if (input.kind === 'riven') {
    const attrs = parseAttributesText(input.attributesText || '')
    if (!attrs.length) {
      return {
        ok: false,
        error: 'Add riven stats as lines like "+critical_chance 187.2"',
      }
    }
    item = {
      type: 'riven',
      weapon_url_name: weapon,
      name: String(input.rivenName || 'riven').trim() || 'riven',
      mod_rank: Math.floor(Number(input.modRank) || 0),
      re_rolls: Math.floor(Number(input.reRolls) || 0),
      polarity: String(input.polarity || 'madurai').toLowerCase(),
      mastery_level: Math.floor(Number(input.masteryLevel) || 8),
      attributes: attrs,
    }
  } else if (input.kind === 'lich' || input.kind === 'sister') {
    item = {
      type: input.kind,
      weapon_url_name: weapon,
      element: String(input.element || 'heat').toLowerCase(),
      damage: Math.floor(Number(input.damage) || 0),
      having_ephemera: Boolean(input.havingEphemera),
    }
    if (input.kind === 'sister' && input.quirk) {
      item.quirk = String(input.quirk)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
    }
  } else {
    return { ok: false, error: 'Unknown contract kind' }
  }

  const payload = {
    note: String(input.note || ''),
    starting_price: starting,
    buyout_price: buyout,
    minimal_reputation: 0,
    is_direct_sell: isDirect,
    visible: input.visible !== false,
    item,
  }

  const attempts: Array<{ url: string; headers: Record<string, string>; body: string }> = [
    {
      url: `${API_V2}/auction`,
      headers: authHeaders(token),
      body: JSON.stringify({
        note: payload.note,
        startingPrice: starting,
        buyoutPrice: buyout,
        minimalReputation: 0,
        isDirectSell: isDirect,
        visible: payload.visible,
        item:
          input.kind === 'riven'
            ? {
                type: 'riven',
                weaponUrlName: weapon,
                name: item.name,
                modRank: item.mod_rank,
                reRolls: item.re_rolls,
                polarity: item.polarity,
                masteryLevel: item.mastery_level,
                attributes: (item.attributes as Array<{ url_name: string; value: number; positive: boolean }>).map(
                  (a) => ({
                    urlName: a.url_name,
                    value: a.value,
                    positive: a.positive,
                  }),
                ),
              }
            : {
                type: input.kind,
                weaponUrlName: weapon,
                element: item.element,
                damage: item.damage,
                havingEphemera: item.having_ephemera,
                quirk: item.quirk,
              },
      }),
    },
    {
      url: `${API_V1}/auctions/create`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Platform: 'pc',
        Language: 'en',
        Authorization: `JWT ${token}`,
        Cookie: `JWT=${token}`,
        'User-Agent': 'EverythingWarframe/market',
      },
      body: JSON.stringify(payload),
    },
  ]

  let lastError = 'Create contract failed'
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: 'POST',
        headers: attempt.headers,
        body: attempt.body,
      })
      const text = await res.text()
      if (!res.ok) {
        lastError = apiErrorMessage(res.status, text)
        if (res.status === 404 || res.status === 405) continue
        if (res.status === 401 || res.status === 403) continue
        return { ok: false, error: lastError }
      }
      let contract: import('../../shared/types').WfmContract | undefined
      try {
        const json = JSON.parse(text) as {
          data?: Record<string, unknown>
          payload?: { auction?: Record<string, unknown> }
        }
        const raw = json.data || json.payload?.auction
        if (raw) contract = formatContract(raw) || undefined
      } catch {
        // ignore
      }
      return { ok: true, contract }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Create contract failed'
    }
  }
  return { ok: false, error: lastError }
}

/** Remove stored JWT during uninstall / clear data. */
export function wipeWfmJwtFile() {
  clearWfmJwt()
}
