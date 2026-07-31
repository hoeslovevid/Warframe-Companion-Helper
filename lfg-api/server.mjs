/**
 * Everything Warframe — LFG hub API (zero deps).
 * Run: node lfg-api/server.mjs
 * Env: PORT=17864  LFG_DATA=./lfg-data.json  LFG_ORIGIN=*
 *
 * Deploy on Railway / Render / Fly and point the app's LFG Hub URL at it
 * so all clients share one matchmaking board.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || process.env.LFG_PORT || 17864)
const DATA_FILE = process.env.LFG_DATA || path.join(__dirname, 'lfg-data.json')
const MAX_LISTINGS = 200
const DEFAULT_TTL_MS = 15 * 60_000
const MAX_TTL_MS = 120 * 60_000
const MIN_TTL_MS = 5 * 60_000
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 40

/** @typedef {{
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
 * }} Listing */

/** @type {Map<string, Listing>} */
const listings = new Map()
/** @type {Map<string, number[]>} */
const rateHits = new Map()

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    const arr = Array.isArray(raw?.listings) ? raw.listings : []
    for (const row of arr) {
      if (row?.id) listings.set(row.id, row)
    }
  } catch {
    // ignore
  }
}

function save() {
  try {
    const listingsArr = [...listings.values()]
    fs.writeFileSync(DATA_FILE, JSON.stringify({ listings: listingsArr }, null, 0), 'utf8')
  } catch {
    // ignore
  }
}

function purgeExpired() {
  const now = Date.now()
  let changed = false
  for (const [id, row] of listings) {
    if (Date.parse(row.expiresAt) <= now) {
      listings.delete(id)
      changed = true
    }
  }
  if (changed) save()
}

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

load()
purgeExpired()
setInterval(purgeExpired, 30_000)

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
      purgeExpired()
      send(res, 200, {
        ok: true,
        service: 'everything-warframe-lfg',
        listings: listings.size,
        now: new Date().toISOString(),
      })
      return
    }

    if (req.method === 'GET' && pathname === '/listings') {
      purgeExpired()
      const region = (url.searchParams.get('region') || '').toLowerCase()
      const platform = (url.searchParams.get('platform') || '').toLowerCase()
      const activity = (url.searchParams.get('activity') || '').toLowerCase()
      const q = (url.searchParams.get('q') || '').toLowerCase()
      let rows = [...listings.values()]
      if (region && region !== 'all') rows = rows.filter((r) => r.region === region)
      if (platform && platform !== 'all') {
        rows = rows.filter((r) => r.platform === platform || platform === 'crossplay')
      }
      if (activity && activity !== 'all') rows = rows.filter((r) => r.activity === activity)
      if (q) {
        rows = rows.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.relicKey || '').toLowerCase().includes(q) ||
            r.hostIgn.toLowerCase().includes(q) ||
            (r.notes || '').toLowerCase().includes(q),
        )
      }
      rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
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
      // Drop oldest if over cap
      if (listings.size >= MAX_LISTINGS) {
        const oldest = [...listings.values()].sort(
          (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
        )[0]
        if (oldest) listings.delete(oldest.id)
      }
      listings.set(id, row)
      save()
      send(res, 201, { listing: publicListing(row), hostToken })
      return
    }

    const joinMatch = pathname.match(/^\/listings\/([^/]+)\/join$/)
    if (req.method === 'POST' && joinMatch) {
      const row = listings.get(joinMatch[1])
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
      save()
      send(res, 200, { listing: publicListing(row) })
      return
    }

    const leaveMatch = pathname.match(/^\/listings\/([^/]+)\/leave$/)
    if (req.method === 'POST' && leaveMatch) {
      const row = listings.get(leaveMatch[1])
      if (!row) {
        send(res, 404, { error: 'Listing not found' })
        return
      }
      const body = await readBody(req)
      const clientId = cleanStr(body.clientId, 64)
      const before = row.members.length
      row.members = row.members.filter((m) => m.clientId !== clientId)
      if (!row.members.length || !row.members.some((m) => m.isHost)) {
        listings.delete(row.id)
      }
      if (row.members.length !== before) save()
      send(res, 200, { ok: true })
      return
    }

    const delMatch = pathname.match(/^\/listings\/([^/]+)$/)
    if (req.method === 'DELETE' && delMatch) {
      const row = listings.get(delMatch[1])
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
      listings.delete(row.id)
      save()
      send(res, 200, { ok: true })
      return
    }

    send(res, 404, { error: 'Not found' })
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : 'Server error' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.info(`[LFG] Everything Warframe LFG hub on http://0.0.0.0:${PORT}`)
  console.info(`[LFG] Data file: ${DATA_FILE}`)
})
