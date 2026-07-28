/**
 * Relic drop catalog from WFCD warframe-items (uniqueName ↔ rewards).
 * Used by Relic Planner + Foundry drop sources.
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { app } from 'electron'
import { normalizeItemName } from './item-catalog'

const RELICS_URL =
  'https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Relics.json'

export type RelicRewardRef = {
  name: string
  uniqueName: string | null
  rarity: string
  chance: number | null
}

export type RelicCatalogEntry = {
  /** Base display e.g. "Axi A1" (no Intact/Exceptional…). */
  key: string
  name: string
  uniqueName: string
  tier: string
  refinement: string
  vaulted: boolean | null
  rewards: RelicRewardRef[]
}

type CacheFile = {
  fetchedAt: string
  relics: RelicCatalogEntry[]
}

let relics: RelicCatalogEntry[] = []
/** Intact (or first) entry per base key. */
let byKey = new Map<string, RelicCatalogEntry>()
let byUnique = new Map<string, RelicCatalogEntry>()
/** Normalized reward name → relic keys that drop it. */
let dropsByReward = new Map<string, string[]>()
let ready: Promise<void> | null = null

function cachePath() {
  return path.join(app.getPath('userData'), 'cache', 'relic-catalog.json')
}

function httpsGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const get = (target: string, redirects = 0) => {
      https
        .get(
          target,
          { headers: { Accept: 'application/json', 'User-Agent': 'EverythingWarframe' } },
          (res) => {
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
              reject(new Error(`Relic catalog fetch failed (${res.statusCode})`))
              res.resume()
              return
            }
            const chunks: Buffer[] = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
              try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
              } catch (err) {
                reject(err)
              }
            })
          },
        )
        .on('error', reject)
    }
    get(url)
  })
}

const REFINEMENTS = ['Intact', 'Exceptional', 'Flawless', 'Radiant'] as const

export function stripRelicRefinement(name: string): { key: string; refinement: string } {
  const trimmed = name.trim()
  for (const r of REFINEMENTS) {
    const suffix = ` ${r}`
    if (trimmed.endsWith(suffix)) {
      return { key: trimmed.slice(0, -suffix.length).trim(), refinement: r }
    }
  }
  return { key: trimmed, refinement: 'Intact' }
}

function tierFromKey(key: string): string {
  const first = key.split(/\s+/)[0] || ''
  return /^(Lith|Meso|Neo|Axi|Requiem)$/i.test(first) ? first : 'Other'
}

function rebuildIndexes(next: RelicCatalogEntry[]) {
  relics = next
  byKey = new Map()
  byUnique = new Map()
  dropsByReward = new Map()

  for (const entry of next) {
    byUnique.set(entry.uniqueName, entry)
    const base = entry.uniqueName.split('/').pop()
    if (base) byUnique.set(base, entry)

    const existing = byKey.get(entry.key)
    if (!existing || entry.refinement === 'Intact') {
      byKey.set(entry.key, entry)
    }

    for (const reward of entry.rewards) {
      const norm = normalizeItemName(reward.name)
      if (!norm) continue
      const list = dropsByReward.get(norm) || []
      if (!list.includes(entry.key)) list.push(entry.key)
      dropsByReward.set(norm, list)
    }
  }
}

function loadCache(): boolean {
  try {
    const file = cachePath()
    if (!fs.existsSync(file)) return false
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CacheFile
    if (!parsed.relics?.length) return false
    rebuildIndexes(parsed.relics)
    const age = Date.now() - new Date(parsed.fetchedAt).getTime()
    if (age > 7 * 24 * 60 * 60 * 1000) {
      void fetchAndCache().catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

type RawRelic = {
  uniqueName?: string
  name?: string
  vaulted?: boolean
  rewards?: Array<{
    rarity?: string
    chance?: number
    item?: { name?: string; uniqueName?: string }
  }>
}

async function fetchAndCache(): Promise<void> {
  const raw = (await httpsGetJson(RELICS_URL)) as RawRelic[]
  if (!Array.isArray(raw)) throw new Error('Relic catalog: unexpected payload')

  const out: RelicCatalogEntry[] = []
  for (const row of raw) {
    const uniqueName = String(row.uniqueName || '').trim()
    const fullName = String(row.name || '').trim()
    if (!uniqueName || !fullName) continue
    const { key, refinement } = stripRelicRefinement(fullName)
    if (!key) continue
    const rewards: RelicRewardRef[] = []
    for (const r of row.rewards || []) {
      const name = String(r.item?.name || '').trim()
      if (!name) continue
      rewards.push({
        name,
        uniqueName: r.item?.uniqueName ? String(r.item.uniqueName) : null,
        rarity: String(r.rarity || 'Unknown'),
        chance: typeof r.chance === 'number' ? r.chance : null,
      })
    }
    out.push({
      key,
      name: fullName,
      uniqueName,
      tier: tierFromKey(key),
      refinement,
      vaulted: typeof row.vaulted === 'boolean' ? row.vaulted : null,
      rewards,
    })
  }

  out.sort((a, b) => a.key.localeCompare(b.key) || a.refinement.localeCompare(b.refinement))
  rebuildIndexes(out)
  fs.mkdirSync(path.dirname(cachePath()), { recursive: true })
  const payload: CacheFile = { fetchedAt: new Date().toISOString(), relics: out }
  fs.writeFileSync(cachePath(), JSON.stringify(payload), 'utf8')
  console.info(`[Everything Warframe] Relic catalog ready (${byKey.size} relics, ${out.length} variants)`)
}

export function ensureRelicCatalog(opts?: { force?: boolean }): Promise<void> {
  if (opts?.force) ready = null
  if (!ready) {
    ready = (async () => {
      if (opts?.force || !loadCache()) {
        await fetchAndCache()
      }
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

export function getRelicKeys(): string[] {
  return [...byKey.keys()]
}

export function getRelicByKey(key: string): RelicCatalogEntry | null {
  return byKey.get(key) || null
}

export function getRelicByUnique(uniqueName: string): RelicCatalogEntry | null {
  if (!uniqueName) return null
  return byUnique.get(uniqueName) || byUnique.get(uniqueName.split('/').pop() || '') || null
}

export function getDropSourcesForItem(nameOrUnique: string): Array<{
  key: string
  tier: string
  rarity: string
  chance: number | null
  vaulted: boolean | null
}> {
  const norm = normalizeItemName(nameOrUnique)
  const keys = dropsByReward.get(norm) || []
  // Also try without "Blueprint" suffix
  const alt = normalizeItemName(nameOrUnique.replace(/\s+Blueprint$/i, ''))
  const merged = new Set([...keys, ...(dropsByReward.get(alt) || [])])
  const out: Array<{
    key: string
    tier: string
    rarity: string
    chance: number | null
    vaulted: boolean | null
  }> = []
  for (const key of merged) {
    const relic = byKey.get(key)
    if (!relic) continue
    const reward =
      relic.rewards.find((r) => normalizeItemName(r.name) === norm) ||
      relic.rewards.find((r) => normalizeItemName(r.name) === alt)
    out.push({
      key,
      tier: relic.tier,
      rarity: reward?.rarity || 'Unknown',
      chance: reward?.chance ?? null,
      vaulted: relic.vaulted,
    })
  }
  out.sort((a, b) => a.key.localeCompare(b.key))
  return out
}

export function listIntactRelics(): RelicCatalogEntry[] {
  return [...byKey.values()]
}
