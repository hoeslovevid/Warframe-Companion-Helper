/**
 * Local WFInfo-style platinum averages (warframestat.us/wfinfo/prices).
 * Lookups are offline after the first refresh — no live warframe.market calls
 * during a relic scan (matches wfinfo-ng speed).
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { normalizeItemName } from './item-catalog'

type PriceRow = { name: string; custom_avg?: number; avg_price?: number }

type PriceCacheFile = {
  fetchedAt: number
  byNormalized: Record<string, number>
}

const TTL_MS = 12 * 60 * 60_000
let byNormalized = new Map<string, number>()
let fetchedAt = 0
let loading: Promise<void> | null = null

function cachePath() {
  return path.join(app.getPath('userData'), 'cache', 'wfinfo-prices.json')
}

function loadDisk() {
  try {
    const file = cachePath()
    if (!fs.existsSync(file)) return
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as PriceCacheFile
    if (!raw?.byNormalized) return
    byNormalized = new Map(Object.entries(raw.byNormalized))
    fetchedAt = raw.fetchedAt || 0
  } catch {
    // ignore
  }
}

function saveDisk() {
  try {
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true })
    const obj: PriceCacheFile = {
      fetchedAt,
      byNormalized: Object.fromEntries(byNormalized.entries()),
    }
    fs.writeFileSync(cachePath(), JSON.stringify(obj), 'utf8')
  } catch (err) {
    console.warn('[Everything Warframe] Failed to write WFInfo price cache', cachePath(), err)
  }
}

async function fetchRemote(): Promise<void> {
  const res = await fetch('https://api.warframestat.us/wfinfo/prices', {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`wfinfo prices ${res.status}`)
  const list = (await res.json()) as PriceRow[]
  const next = new Map<string, number>()
  for (const row of list) {
    if (!row?.name) continue
    const plat = Number(row.custom_avg ?? row.avg_price)
    if (!Number.isFinite(plat) || plat < 0) continue
    next.set(normalizeItemName(row.name), plat)
    // Also index without trailing Blueprint for OCR variants
    const noBp = row.name.replace(/\s+Blueprint$/i, '').trim()
    if (noBp !== row.name) next.set(normalizeItemName(noBp), plat)
  }
  // Forma Blueprint — wfinfo-ng uses ~35/3 platinum equivalent
  if (!next.has(normalizeItemName('Forma Blueprint'))) {
    next.set(normalizeItemName('Forma Blueprint'), 35 / 3)
  }
  byNormalized = next
  fetchedAt = Date.now()
  saveDisk()
  console.info(`[Everything Warframe] WFInfo price DB loaded (${next.size} items)`)
}

/** Ensure local price DB is warm (disk first, network if stale/missing). */
export async function ensureWfinfoPrices(force = false): Promise<void> {
  if (!byNormalized.size) loadDisk()
  if (!force && byNormalized.size && Date.now() - fetchedAt < TTL_MS) return
  if (loading) return loading
  loading = (async () => {
    try {
      await fetchRemote()
    } catch (err) {
      console.warn(
        '[Everything Warframe] WFInfo price refresh failed — using disk/cache',
        err instanceof Error ? err.message : err,
      )
      if (!byNormalized.size) loadDisk()
    } finally {
      loading = null
    }
  })()
  return loading
}

/** True when at least one local price is available (disk or memory). */
export function isWfinfoPricesReady(): boolean {
  if (!byNormalized.size) loadDisk()
  return byNormalized.size > 0
}

/** Instant local platinum average for a catalog/OCR display name. */
export function lookupWfinfoPlatinum(name: string): number | null {
  if (!name) return null
  if (!byNormalized.size) loadDisk()
  const key = normalizeItemName(name)
  const hit = byNormalized.get(key)
  if (hit != null) return Math.round(hit * 10) / 10
  // Try with/without Blueprint
  if (/blueprint$/i.test(name)) {
    const alt = byNormalized.get(normalizeItemName(name.replace(/\s+Blueprint$/i, '')))
    if (alt != null) return Math.round(alt * 10) / 10
  } else {
    const alt = byNormalized.get(normalizeItemName(`${name} Blueprint`))
    if (alt != null) return Math.round(alt * 10) / 10
  }
  return null
}

/** Batch local lookups (no network). */
export function lookupWfinfoPrices(
  names: string[],
): Map<string, { platinum: number; volume: number }> {
  const out = new Map<string, { platinum: number; volume: number }>()
  for (const name of names) {
    const plat = lookupWfinfoPlatinum(name)
    if (plat == null) continue
    // volume unknown for WFInfo averages — use 0 so UI can omit "sells"
    out.set(name, { platinum: Math.round(plat), volume: 0 })
  }
  return out
}
