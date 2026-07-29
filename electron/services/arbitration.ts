/**
 * Arbitration schedule from browse.wf (community hour table) + WFCD solNodes for names.
 * Official warframestat /arbitration is often a SolNode000 placeholder.
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { app } from 'electron'
import type { ArbitrationInfo, ArbitrationSlot } from '../../shared/types'

const ARBYS_URL = 'https://browse.wf/arbys.txt'
const SOL_NODES_URL =
  'https://raw.githubusercontent.com/WFCD/warframe-worldstate-data/master/data/solNodes.json'

type SolNode = { value?: string; enemy?: string; type?: string }
type ScheduleRow = { startSec: number; nodeKey: string }

let schedule: ScheduleRow[] = []
let solNodes: Record<string, SolNode> = {}
let scheduleReady: Promise<void> | null = null
let nodesReady: Promise<void> | null = null

function cacheDir() {
  return path.join(app.getPath('userData'), 'cache')
}

function httpsGetText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const get = (target: string, redirects = 0) => {
      https
        .get(target, { headers: { Accept: '*/*', 'User-Agent': 'EverythingWarframe' } }, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirects < 5
          ) {
            res.resume()
            get(res.headers.location, redirects + 1)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Arbitration fetch failed (${res.statusCode})`))
            res.resume()
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        })
        .on('error', reject)
    }
    get(url)
  })
}

function etaFromMs(ms: number): string {
  if (ms <= 0) return 'now'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function parseSchedule(text: string): ScheduleRow[] {
  const out: ScheduleRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const comma = trimmed.indexOf(',')
    if (comma < 0) continue
    const startSec = Number(trimmed.slice(0, comma))
    const nodeKey = trimmed.slice(comma + 1).trim()
    if (!Number.isFinite(startSec) || !nodeKey) continue
    out.push({ startSec, nodeKey })
  }
  return out
}

function loadCachedSchedule(): boolean {
  try {
    const file = path.join(cacheDir(), 'arbys-schedule.txt')
    if (!fs.existsSync(file)) return false
    const age = Date.now() - fs.statSync(file).mtimeMs
    schedule = parseSchedule(fs.readFileSync(file, 'utf8'))
    if (!schedule.length) return false
    if (age > 24 * 60 * 60 * 1000) {
      void refreshSchedule().catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

async function refreshSchedule(): Promise<void> {
  const text = await httpsGetText(ARBYS_URL)
  const next = parseSchedule(text)
  if (!next.length) throw new Error('Empty arbitration schedule')
  schedule = next
  fs.mkdirSync(cacheDir(), { recursive: true })
  fs.writeFileSync(path.join(cacheDir(), 'arbys-schedule.txt'), text, 'utf8')
  console.info(`[Everything Warframe] Arbitration schedule ready (${schedule.length} hours)`)
}

function loadCachedNodes(): boolean {
  try {
    const file = path.join(cacheDir(), 'sol-nodes.json')
    if (!fs.existsSync(file)) return false
    const age = Date.now() - fs.statSync(file).mtimeMs
    solNodes = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, SolNode>
    if (!Object.keys(solNodes).length) return false
    if (age > 7 * 24 * 60 * 60 * 1000) {
      void refreshNodes().catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

async function refreshNodes(): Promise<void> {
  const text = await httpsGetText(SOL_NODES_URL)
  const next = JSON.parse(text) as Record<string, SolNode>
  if (!Object.keys(next).length) throw new Error('Empty solNodes')
  solNodes = next
  fs.mkdirSync(cacheDir(), { recursive: true })
  fs.writeFileSync(path.join(cacheDir(), 'sol-nodes.json'), text, 'utf8')
}

export function ensureArbitrationData(opts?: { force?: boolean }): Promise<void> {
  if (opts?.force) {
    scheduleReady = null
    nodesReady = null
  }
  if (!scheduleReady) {
    scheduleReady = (async () => {
      if (opts?.force || !loadCachedSchedule()) await refreshSchedule()
    })().catch((err) => {
      scheduleReady = null
      throw err
    })
  }
  if (!nodesReady) {
    nodesReady = (async () => {
      if (opts?.force || !loadCachedNodes()) await refreshNodes()
    })().catch((err) => {
      nodesReady = null
      throw err
    })
  }
  return Promise.all([scheduleReady, nodesReady]).then(() => undefined)
}

/** Last schedule row with startSec <= nowSec */
function findCurrentIndex(nowSec: number): number {
  let lo = 0
  let hi = schedule.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (schedule[mid]!.startSec <= nowSec) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

function toSlot(row: ScheduleRow, endSec: number, nowMs: number): ArbitrationSlot {
  const meta = solNodes[row.nodeKey] || {}
  const activationMs = row.startSec * 1000
  const expiryMs = endSec * 1000
  return {
    node: meta.value || row.nodeKey,
    nodeKey: row.nodeKey,
    type: meta.type || 'Unknown',
    enemy: meta.enemy || 'Unknown',
    activation: new Date(activationMs).toISOString(),
    expiry: new Date(expiryMs).toISOString(),
    eta: etaFromMs(expiryMs - nowMs),
  }
}

export async function getArbitrationInfo(upcomingCount = 8): Promise<ArbitrationInfo | null> {
  try {
    await ensureArbitrationData()
  } catch (err) {
    console.warn('[Everything Warframe] Arbitration schedule unavailable', err)
    return null
  }
  if (!schedule.length) return null

  const nowMs = Date.now()
  const nowSec = Math.floor(nowMs / 1000)
  const idx = findCurrentIndex(nowSec)
  if (idx < 0) return null

  const currentRow = schedule[idx]!
  const nextRow = schedule[idx + 1]
  const endSec = nextRow?.startSec ?? currentRow.startSec + 3600
  const current = toSlot(currentRow, endSec, nowMs)

  const upcoming: ArbitrationSlot[] = []
  for (let i = 1; i <= upcomingCount; i++) {
    const row = schedule[idx + i]
    if (!row) break
    const following = schedule[idx + i + 1]
    const rowEnd = following?.startSec ?? row.startSec + 3600
    const slot = toSlot(row, rowEnd, nowMs)
    upcoming.push({
      ...slot,
      // For upcoming, eta = time until it starts
      eta: etaFromMs(row.startSec * 1000 - nowMs),
    })
  }

  return {
    ...current,
    upcoming,
  }
}
