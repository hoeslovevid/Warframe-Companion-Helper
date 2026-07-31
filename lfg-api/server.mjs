/**
 * Everything Warframe — LFG hub API.
 * Run: node lfg-api/server.mjs
 * Env: PORT=17864  LFG_DATA=/data/lfg.sqlite  LFG_DATA_DIR=/data  LFG_ORIGIN=*
 *
 * Persist listings on a Railway volume (SQLite). JSON fallback for local Electron.
 */
import http from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { openStore, resolveDataPath } from './store.mjs'

const PORT = Number(process.env.PORT || process.env.LFG_PORT || 17864)
const MAX_LISTINGS = 500
const DEFAULT_TTL_MS = 15 * 60_000
const MAX_TTL_MS = 120 * 60_000
const MIN_TTL_MS = 5 * 60_000
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 40

/**
 * @typedef {{
 *  id: string
 *  createdAt: string
 *  expiresAt: string
 *  hostIgn: string
 *  hostToken: string
 *  platform: string
 *  region: string
 *  language: string
 *  activity: string
 *  title: string
 *  notes: string
 *  relicKey: string | null
 *  refinement: string | null
 *  shareType: string | null
 *  steelPath: boolean
 *  missionHint: string | null
 *  slotsTotal: number
 *  members: Array<{ ign: string, clientId: string, joinedAt: string, isHost: boolean }>
 * }} Listing
 */

/** @type {Map<string, number[]>} */
const rateHits = new Map()

/** @type {import('./store.mjs').LfgStore | null} */
let store = null

function publicListing(row) {
  const { hostToken, ...rest } = row
  return {
    ...rest,
    slotsOpen: Math.max(0, row.slotsTotal - row.members.length),
    whisper: buildWhisper(row),
    inviteHint: `/invite ${row.hostIgn}`,
  }
}

function buildWhisper(row) {
  const bits = [`LFG ${row.title}`.trim()]
  if (row.relicKey) bits.push(row.relicKey)
  if (row.shareType) bits.push(row.shareType)
  if (row.steelPath) bits.push('SP')
  if (row.missionHint) bits.push(row.missionHint)
  bits.push(`${row.members.length}/${row.slotsTotal}`)
  bits.push(row.platform.toUpperCase())
  bits.push(row.region.toUpperCase())
  return `/w ${row.hostIgn} ${bits.join(' · ')}`.replace(/\s+/g, ' ').trim()
}

function rateOk(ip) {
  const now = Date.now()
  const prev = (rateHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (prev.length >= RATE_MAX) {
    rateHits.set(ip, prev)
    return false
  }
  prev.push(now)
  rateHits.set(ip, prev)
  return true
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function send(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.LFG_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-LFG-Token',
    'Cache-Control': 'no-store',
  })
  res.end(json)
}

function cleanStr(v, max = 80) {
  return String(v || '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, max)
}

function enforceCap() {
  while (store.count() >= MAX_LISTINGS) {
    const oldest = store.list({}).sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )[0]
    if (!oldest) break
    store.remove(oldest.id)
  }
}

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || 'local'
  if (req.method === 'OPTIONS') {
    send(res, 204, {})
    return
  }
  if (!rateOk(ip)) {
    send(res, 429, { error: 'Too many requests' })
    return
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'

    if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
      store.purgeExpired()
      send(res, 200, {
        ok: true,
        service: 'everything-warframe-lfg',
        listings: store.count(),
        store: store.kind,
        dataPath: store.path,
        now: new Date().toISOString(),
      })
      return
    }

    if (req.method === 'GET' && pathname === '/listings') {
      store.purgeExpired()
      const rows = store.list({
        region: url.searchParams.get('region') || '',
        platform: url.searchParams.get('platform') || '',
        activity: url.searchParams.get('activity') || '',
        q: url.searchParams.get('q') || '',
      })
      send(res, 200, { listings: rows.map(publicListing) })
      return
    }

    if (req.method === 'POST' && pathname === '/listings') {
      const body = await readBody(req)
      const hostIgn = cleanStr(body.hostIgn || body.ign, 24)
      const clientId = cleanStr(body.clientId, 64)
      if (!hostIgn || hostIgn.length < 2) {
        send(res, 400, { error: 'In-game name required' })
        return
      }
      if (!clientId) {
        send(res, 400, { error: 'clientId required' })
        return
      }
      const ttl = Math.min(
        MAX_TTL_MS,
        Math.max(MIN_TTL_MS, Number(body.ttlMs) || DEFAULT_TTL_MS),
      )
      const slotsTotal = Math.min(4, Math.max(2, Math.floor(Number(body.slotsTotal) || 4)))
      const now = Date.now()
      const id = randomUUID()
      const hostToken = randomBytes(18).toString('hex')
      /** @type {Listing} */
      const row = {
        id,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttl).toISOString(),
        hostIgn,
        hostToken,
        platform: cleanStr(body.platform || 'pc', 16).toLowerCase() || 'pc',
        region: cleanStr(body.region || 'na', 8).toLowerCase() || 'na',
        language: cleanStr(body.language || 'en', 8).toLowerCase() || 'en',
        activity: cleanStr(body.activity || 'custom', 24).toLowerCase() || 'custom',
        title: cleanStr(body.title || 'LFG', 100) || 'LFG',
        notes: cleanStr(body.notes || '', 160),
        relicKey: body.relicKey ? cleanStr(body.relicKey, 40) : null,
        refinement: body.refinement ? cleanStr(body.refinement, 20).toLowerCase() : null,
        shareType: body.shareType ? cleanStr(body.shareType, 20).toLowerCase() : null,
        steelPath: Boolean(body.steelPath),
        missionHint: body.missionHint ? cleanStr(body.missionHint, 60) : null,
        slotsTotal,
        members: [
          {
            ign: hostIgn,
            clientId,
            joinedAt: new Date(now).toISOString(),
            isHost: true,
          },
        ],
      }
      store.purgeExpired()
      enforceCap()
      store.upsert(row)
      send(res, 201, { listing: publicListing(row), hostToken })
      return
    }

    const joinMatch = pathname.match(/^\/listings\/([^/]+)\/join$/)
    if (req.method === 'POST' && joinMatch) {
      const row = store.get(joinMatch[1])
      if (!row || Date.parse(row.expiresAt) <= Date.now()) {
        send(res, 404, { error: 'Listing not found or expired' })
        return
      }
      const body = await readBody(req)
      const ign = cleanStr(body.ign || body.hostIgn, 24)
      const clientId = cleanStr(body.clientId, 64)
      if (!ign || !clientId) {
        send(res, 400, { error: 'ign and clientId required' })
        return
      }
      if (row.members.some((m) => m.clientId === clientId)) {
        send(res, 200, { listing: publicListing(row), alreadyJoined: true })
        return
      }
      if (row.members.length >= row.slotsTotal) {
        send(res, 409, { error: 'Squad full' })
        return
      }
      row.members.push({
        ign,
        clientId,
        joinedAt: new Date().toISOString(),
        isHost: false,
      })
      store.upsert(row)
      send(res, 200, { listing: publicListing(row) })
      return
    }

    const leaveMatch = pathname.match(/^\/listings\/([^/]+)\/leave$/)
    if (req.method === 'POST' && leaveMatch) {
      const row = store.get(leaveMatch[1])
      if (!row) {
        send(res, 404, { error: 'Listing not found' })
        return
      }
      const body = await readBody(req)
      const clientId = cleanStr(body.clientId, 64)
      const before = row.members.length
      row.members = row.members.filter((m) => m.clientId !== clientId)
      if (!row.members.length || !row.members.some((m) => m.isHost)) {
        store.remove(row.id)
      } else if (row.members.length !== before) {
        store.upsert(row)
      }
      send(res, 200, { ok: true })
      return
    }

    const delMatch = pathname.match(/^\/listings\/([^/]+)$/)
    if (req.method === 'DELETE' && delMatch) {
      const row = store.get(delMatch[1])
      if (!row) {
        send(res, 404, { error: 'Listing not found' })
        return
      }
      const token =
        cleanStr(req.headers['x-lfg-token'], 80) ||
        cleanStr((await readBody(req).catch(() => ({}))).hostToken, 80)
      if (token !== row.hostToken) {
        send(res, 403, { error: 'Host token required' })
        return
      }
      store.remove(row.id)
      send(res, 200, { ok: true })
      return
    }

    send(res, 404, { error: 'Not found' })
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : 'Server error' })
  }
})

async function main() {
  const dataPath = resolveDataPath()
  store = await openStore(dataPath)
  store.purgeExpired()
  setInterval(() => store?.purgeExpired(), 30_000)

  server.listen(PORT, '0.0.0.0', () => {
    console.info(`[LFG] Everything Warframe LFG hub on http://0.0.0.0:${PORT}`)
    console.info(`[LFG] Store: ${store.kind} @ ${store.path}`)
  })
}

main().catch((err) => {
  console.error('[LFG] Failed to start:', err)
  process.exit(1)
})
