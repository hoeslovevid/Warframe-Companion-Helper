/**
 * Persist credits / ducats / platinum snapshots after inventory sync.
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { EconomySnapshot, EconomyTrendResult } from '../../shared/types'
import { peekInventoryIndex } from './inventory'

const MAX_SNAPSHOTS = 60
/** Don't spam identical snapshots closer than this. */
const MIN_GAP_MS = 10 * 60_000

function filePath() {
  return path.join(app.getPath('userData'), 'economy-snapshots.json')
}

function loadRaw(): EconomySnapshot[] {
  try {
    const file = filePath()
    if (!fs.existsSync(file)) return []
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { snapshots?: EconomySnapshot[] }
    return Array.isArray(raw.snapshots) ? raw.snapshots : []
  } catch {
    return []
  }
}

function saveRaw(snapshots: EconomySnapshot[]) {
  try {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true })
    fs.writeFileSync(filePath(), JSON.stringify({ snapshots }, null, 0), 'utf8')
  } catch {
    // ignore
  }
}

function readCurrencies(index: Record<string, number>): Omit<EconomySnapshot, 'at'> {
  let credits = Math.max(0, Math.floor(index.RegularCredits || 0))
  let platinum = Math.max(0, Math.floor(index.PremiumCredits || 0))
  let ducats = Math.max(0, Math.floor(index.Ducats || 0))
  if (!ducats) {
    for (const [k, v] of Object.entries(index)) {
      if (/ducatcurrency/i.test(k) || /\/ducats?$/i.test(k)) {
        ducats += Math.max(0, Math.floor(v))
      }
    }
  }
  return { credits, ducats, platinum }
}

export function recordEconomySnapshotFromIndex(index?: Record<string, number>): EconomySnapshot | null {
  const idx = index || peekInventoryIndex()
  if (!Object.keys(idx).length) return null
  const cur = readCurrencies(idx)
  const at = new Date().toISOString()
  const snap: EconomySnapshot = { at, ...cur }
  const prev = loadRaw()
  const last = prev[0]
  if (last) {
    const age = Date.parse(at) - Date.parse(last.at)
    if (
      age < MIN_GAP_MS &&
      last.credits === snap.credits &&
      last.ducats === snap.ducats &&
      last.platinum === snap.platinum
    ) {
      return last
    }
  }
  const next = [snap, ...prev].slice(0, MAX_SNAPSHOTS)
  saveRaw(next)
  return snap
}

export function getEconomyTrend(): EconomyTrendResult {
  const snapshots = loadRaw()
  const latest = snapshots[0] || null
  const oldest = snapshots.length > 1 ? snapshots[snapshots.length - 1] : null
  const delta =
    latest && oldest
      ? {
          credits: latest.credits - oldest.credits,
          ducats: latest.ducats - oldest.ducats,
          platinum: latest.platinum - oldest.platinum,
        }
      : null
  return { snapshots, latest, delta }
}
