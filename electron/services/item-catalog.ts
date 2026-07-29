import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { app } from 'electron'

export type CatalogItem = {
  name: string
  uniqueName: string
  setName: string | null
  partName: string | null
  ducats: number | null
  vaulted: boolean | null
  normalized: string
}

type CatalogCache = {
  version?: number
  fetchedAt: string
  items: CatalogItem[]
}

/** Bump when component display-name composition changes. */
const ITEM_CACHE_VERSION = 2

let catalog: CatalogItem[] = []
let bySet = new Map<string, CatalogItem[]>()
let byNormalized = new Map<string, CatalogItem>()
let ready: Promise<void> | null = null

const PART_SUFFIXES = [
  'Neuroptics',
  'Chassis',
  'Systems',
  'Blueprint',
  'Barrel',
  'Receiver',
  'Stock',
  'Blade',
  'Handle',
  'Hilt',
  'Link',
  'Head',
  'Grip',
  'String',
  'Lower Limb',
  'Upper Limb',
  'Boot',
  'Gauntlet',
  'Ornament',
  'Cerebrum',
  'Carapace',
  'Pouch',
  'Stars',
  'Harness',
  'Wings',
  'Band',
  'Buckle',
  'Chain',
]

const SHORT_PART_NAMES = new Set(PART_SUFFIXES.map((s) => s.toUpperCase()))

function cachePath() {
  return path.join(app.getPath('userData'), 'cache', 'item-catalog.json')
}

export function normalizeItemName(name: string): string {
  return name
    .toUpperCase()
    // Common Warframe OCR / UI glitches before stripping punctuation
    .replace(/@/g, 'BL')
    .replace(/\bTEUROPTICS\b/g, 'NEUROPTICS')
    .replace(/\bNEUROPTICS?\b/g, 'NEUROPTICS')
    .replace(/\bCHASS[I1]S\b/g, 'CHASSIS')
    .replace(/\bSYSTE[MN]S\b/g, 'SYSTEMS')
    .replace(/\bBLUEPR[I1]NT\b/g, 'BLUEPRINT')
    .replace(/\bPR[I1]ME\b/g, 'PRIME')
    .replace(/['’]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSetAndPart(name: string): { setName: string | null; partName: string | null } {
  const trimmed = name.trim()
  if (!/prime/i.test(trimmed)) return { setName: null, partName: null }

  for (const suffix of PART_SUFFIXES) {
    const re = new RegExp(`^(.*\\bPrime)\\s+${suffix}$`, 'i')
    const m = trimmed.match(re)
    if (m) return { setName: m[1].trim(), partName: suffix }
  }

  // Full set item / blueprint-less prime weapon name
  if (/\bPrime$/i.test(trimmed)) {
    return { setName: trimmed, partName: 'Item' }
  }

  const primeIdx = trimmed.toLowerCase().indexOf('prime')
  if (primeIdx >= 0) {
    const setName = trimmed.slice(0, primeIdx + 5).trim()
    const partName = trimmed.slice(primeIdx + 5).trim() || 'Item'
    return { setName, partName }
  }

  return { setName: null, partName: null }
}

function httpsGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const get = (target: string, redirects = 0) => {
      https
        .get(target, { headers: { Accept: 'application/json', 'User-Agent': 'EverythingWarframe' } }, (res) => {
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
            reject(new Error(`Catalog fetch failed (${res.statusCode})`))
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
        })
        .on('error', reject)
    }
    get(url)
  })
}

function rebuildIndexes(items: CatalogItem[]) {
  catalog = items
  bySet = new Map()
  byNormalized = new Map()
  for (const item of items) {
    byNormalized.set(item.normalized, item)
    if (!item.setName) continue
    const list = bySet.get(item.setName) || []
    list.push(item)
    bySet.set(item.setName, list)
  }
}

function loadCache(): boolean {
  try {
    const file = cachePath()
    if (!fs.existsSync(file)) return false
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CatalogCache
    const age = Date.now() - new Date(parsed.fetchedAt).getTime()
    if (!parsed.items?.length) return false
    if (parsed.version !== ITEM_CACHE_VERSION) return false
    // Migrate older caches missing vaulted
    for (const item of parsed.items) {
      if (item.vaulted === undefined) (item as CatalogItem).vaulted = null
    }
    rebuildIndexes(parsed.items)
    // Refresh weekly in background if stale
    if (age > 7 * 24 * 60 * 60 * 1000) {
      void fetchAndCache().catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

async function fetchAndCache(): Promise<void> {
  // Primed gear is enough for relic rewards; pull main equipment endpoints
  const [warframes, weapons, sentinels] = await Promise.all([
    httpsGetJson('https://api.warframestat.us/warframes') as Promise<Array<Record<string, unknown>>>,
    httpsGetJson('https://api.warframestat.us/weapons') as Promise<Array<Record<string, unknown>>>,
    httpsGetJson('https://api.warframestat.us/sentinels').catch(() => []) as Promise<
      Array<Record<string, unknown>>
    >,
  ])

  const parents = [...warframes, ...weapons, ...sentinels]
  const items: CatalogItem[] = []
  const seen = new Set<string>()

  const pushItem = (
    name: string,
    uniqueName: string,
    ducats: number | null,
    vaulted: boolean | null = null,
  ) => {
    const key = normalizeItemName(name)
    if (!key || seen.has(key)) return
    seen.add(key)
    const { setName, partName } = parseSetAndPart(name)
    items.push({
      name,
      uniqueName,
      setName,
      partName,
      ducats,
      vaulted,
      normalized: key,
    })
  }

  for (const parent of parents) {
    const parentName = String(parent.name || '')
    const parentUnique = String(parent.uniqueName || parentName)
    if (!parentName) continue
    const parentVaulted = typeof parent.vaulted === 'boolean' ? parent.vaulted : null
    const parentIsPrime = /prime/i.test(parentName)

    if (parentIsPrime) {
      pushItem(parentName, parentUnique, null, parentVaulted)
    }

    const components = parent.components
    if (!Array.isArray(components)) continue
    for (const comp of components) {
      if (!comp || typeof comp !== 'object') continue
      const c = comp as Record<string, unknown>
      const cName = String(c.name || '').trim()
      if (!cName) continue
      const cUnique = String(c.uniqueName || `${parentUnique}:${cName}`)
      const ducats = typeof c.ducats === 'number' ? c.ducats : null
      const cVaulted = typeof c.vaulted === 'boolean' ? c.vaulted : parentVaulted

      // warframestat uses short part labels ("Barrel", "Chassis"); relic drops use
      // full names ("Akstiletto Prime Barrel", "Trinity Prime Chassis Blueprint").
      let displayName = cName
      if (!/prime/i.test(cName) && parentIsPrime) {
        const isShortPart = SHORT_PART_NAMES.has(cName.toUpperCase())
        const isRecipePath = /\/(Recipes|WeaponParts)\//i.test(cUnique)
        if (!isShortPart && !isRecipePath) continue
        displayName = /^blueprint$/i.test(cName) ? `${parentName} Blueprint` : `${parentName} ${cName}`
      } else if (!/prime/i.test(cName)) {
        continue
      }

      pushItem(displayName, cUnique, ducats, cVaulted)

      // Relic tables often append "Blueprint" to warframe part names.
      if (
        parentIsPrime &&
        !/\bblueprint\b/i.test(displayName) &&
        /(Neuroptics|Chassis|Systems)$/i.test(displayName)
      ) {
        pushItem(`${displayName} Blueprint`, cUnique, ducats, cVaulted)
      }
    }
  }

  // Common non-prime relic rewards (Forma OCR often drops "Blueprint")
  for (const extra of [
    'Forma Blueprint',
    'Forma',
    'Orokin Catalyst Blueprint',
    'Orokin Reactor Blueprint',
  ]) {
    pushItem(extra, extra, null, false)
  }

  rebuildIndexes(items)
  fs.mkdirSync(path.dirname(cachePath()), { recursive: true })
  const payload: CatalogCache = {
    version: ITEM_CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    items,
  }
  fs.writeFileSync(cachePath(), JSON.stringify(payload), 'utf8')
  console.info(`[Everything Warframe] Item catalog ready (${items.length} entries)`)
}

export function ensureItemCatalog(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      if (!loadCache()) {
        await fetchAndCache()
      }
    })()
  }
  return ready
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) row[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = cur
    }
  }
  return row[b.length]
}

const SKIP_WORDS = new Set([
  'OWNED',
  'CRAFTED',
  'UNRANKED',
  'MASTERED',
  'THE',
  'AND',
  'FOR',
])

function tokens(s: string): string[] {
  return s.split(' ').filter((w) => w.length >= 2 && !SKIP_WORDS.has(w))
}

/** Fuzzy single-token match (typos / truncated OCR prefixes). */
function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true
  if (a.length >= 5 && b.length >= 5) {
    const dist = levenshtein(a, b)
    const maxLen = Math.max(a.length, b.length)
    if (dist <= (maxLen >= 8 ? 2 : 1)) return true
    // Distinctive suffixes: NEUROPTICS ↔ RUROPTICS / TEAROPTICS
    if (a.length >= 6 && b.includes(a.slice(-5))) return true
    if (b.length >= 6 && a.includes(b.slice(-5))) return true
  }
  return false
}

/**
 * Match OCR reward text to the catalog.
 * `score` is confidence in [0, 1] (1 = exact). Downstream thresholds use this ratio.
 */
export function matchCatalogItem(ocrText: string): { item: CatalogItem; score: number } | null {
  const needle = normalizeItemName(ocrText)
  if (!needle || needle.length < 3) return null
  const needleToks = tokens(needle)
  if (!needleToks.length) return null

  let best: CatalogItem | null = null
  let bestScore = 0

  for (const item of catalog) {
    if (item.normalized === needle) return { item, score: 1 }

    const itemToks = tokens(item.normalized)
    if (!itemToks.length) continue

    // Containment of the full normalized string
    let score = 0
    if (item.normalized.includes(needle) || needle.includes(item.normalized)) {
      const shorter = Math.min(item.normalized.length, needle.length)
      const longer = Math.max(item.normalized.length, needle.length)
      score = Math.max(score, shorter / longer)
    }

    // Token-set coverage (order-independent — "Chassis Mirage" vs "Mirage Chassis")
    let matched = 0
    for (const it of itemToks) {
      if (needleToks.some((nt) => tokenMatches(it, nt))) matched++
    }
    const tokenScore = matched / Math.max(itemToks.length, needleToks.length)
    // Prefer explaining catalog words when OCR is short/noisy
    const catalogCoverage = matched / itemToks.length
    score = Math.max(score, tokenScore, catalogCoverage * 0.95)

    // Full-string Levenshtein ratio for near-misses of similar length
    if (Math.abs(item.normalized.length - needle.length) <= 10) {
      const dist = levenshtein(needle, item.normalized)
      const maxLen = Math.max(item.normalized.length, needle.length)
      const ratio = 1 - dist / maxLen
      if (ratio >= 0.7) score = Math.max(score, ratio)
    }

    if (score < 0.42) continue
    if (
      score > bestScore + 1e-6 ||
      (Math.abs(score - bestScore) < 1e-6 && best && item.name.length > best.name.length)
    ) {
      best = item
      bestScore = score
    }
  }

  return best ? { item: best, score: Math.min(1, bestScore) } : null
}

export function getSetParts(setName: string | null): CatalogItem[] {
  if (!setName) return []
  return bySet.get(setName) || []
}

/** Exact (normalized) name lookup, with/without trailing Blueprint. */
export function findCatalogItemByName(name: string): CatalogItem | null {
  const needle = normalizeItemName(name)
  if (!needle) return null
  const direct = byNormalized.get(needle)
  if (direct) return direct
  if (/\bBLUEPRINT\b/.test(needle)) {
    return byNormalized.get(normalizeItemName(name.replace(/\s+Blueprint$/i, ''))) || null
  }
  return byNormalized.get(normalizeItemName(`${name} Blueprint`)) || null
}
