/**
 * warframe.market session via browser JWT cookie (no password stored).
 * Token is kept with Electron safeStorage when available.
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import type { WfmOrder, WfmSession } from '../../shared/types'

const API = 'https://api.warframe.market/v1'

export type { WfmOrder, WfmSession }

type StoredBlob = {
  v: 1
  /** Electron safeStorage ciphertext as base64, or plaintext when encryption unavailable. */
  enc: boolean
  data: string
}

let memoryJwt: string | null = null
let cachedProfile: {
  ingameName: string
  platform: string
  reputation: number
  status: string
} | null = null

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
  if (cookieMatch?.[1]) t = cookieMatch[1].trim()
  return t.trim()
}

function looksLikeJwt(token: string): boolean {
  // Compact JWT: header.payload.sig
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
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
    // v1 devices / cookie-style clients use "JWT <token>"
    Authorization: `JWT ${token}`,
  }
}

async function fetchProfile(token: string): Promise<{
  ingameName: string
  platform: string
  reputation: number
  status: string
}> {
  const res = await fetch(`${API}/profile`, {
    headers: authHeaders(token),
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error('JWT rejected — paste a fresh cookie from warframe.market')
  }
  if (!res.ok) {
    throw new Error(`warframe.market profile failed (${res.status})`)
  }
  const json = (await res.json()) as {
    payload?: {
      profile?: {
        ingame_name?: string
        platform?: string
        reputation?: number
        status?: string
      }
    }
  }
  const p = json.payload?.profile
  if (!p?.ingame_name) {
    throw new Error('Profile response missing ingame name — check the JWT')
  }
  return {
    ingameName: p.ingame_name,
    platform: p.platform || 'pc',
    reputation: Number(p.reputation) || 0,
    status: p.status || 'offline',
  }
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

function orderItemName(order: Record<string, unknown>): { name: string; urlName: string | null } {
  const item = order.item as
    | { en?: { item_name?: string }; url_name?: string; item_name?: string }
    | undefined
  if (item?.en?.item_name) {
    return { name: item.en.item_name, urlName: item.url_name || null }
  }
  if (typeof item?.item_name === 'string') {
    return { name: item.item_name, urlName: item.url_name || null }
  }
  if (typeof item?.url_name === 'string') {
    return {
      name: item.url_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      urlName: item.url_name,
    }
  }
  return { name: 'Unknown item', urlName: null }
}

export async function fetchWfmMyOrders(): Promise<{
  orders: WfmOrder[]
  error: string | null
}> {
  const token = readToken()
  if (!token) return { orders: [], error: 'Not signed in' }
  try {
    const res = await fetch(`${API}/profile/orders`, {
      headers: authHeaders(token),
    })
    if (res.status === 401 || res.status === 403) {
      clearWfmJwt()
      return { orders: [], error: 'JWT expired — paste a fresh cookie' }
    }
    if (!res.ok) {
      return { orders: [], error: `Orders request failed (${res.status})` }
    }
    const json = (await res.json()) as {
      payload?: { sell_orders?: unknown[]; buy_orders?: unknown[]; orders?: unknown[] }
    }
    const payload = json.payload || {}
    const raw = [
      ...(payload.sell_orders || []),
      ...(payload.buy_orders || []),
      ...(payload.orders || []),
    ] as Array<Record<string, unknown>>

    const seen = new Set<string>()
    const orders: WfmOrder[] = []
    for (const o of raw) {
      const id = String(o.id || '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      const { name, urlName } = orderItemName(o)
      const orderType = o.order_type === 'buy' ? 'buy' : 'sell'
      orders.push({
        id,
        orderType,
        platinum: Number(o.platinum) || 0,
        quantity: Number(o.quantity) || 1,
        visible: o.visible !== false,
        itemName: name,
        itemUrlName: urlName,
        lastUpdate: typeof o.last_update === 'string' ? o.last_update : null,
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
    const res = await fetch(`${API}/profile/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })
    if (res.status === 401 || res.status === 403) {
      clearWfmJwt()
      return { ok: false, error: 'JWT expired — paste a fresh cookie' }
    }
    if (!res.ok) {
      return { ok: false, error: `Delete failed (${res.status})` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete failed' }
  }
}

/** Remove stored JWT during uninstall / clear data. */
export function wipeWfmJwtFile() {
  clearWfmJwt()
}
