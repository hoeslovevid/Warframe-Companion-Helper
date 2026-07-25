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
  normalized: string
}

type CatalogCache = {
  fetchedAt: string
  items: CatalogItem[]
}

let catalog: CatalogItem[] = []
let bySet = new Map<string, CatalogItem[]>()
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

function cachePath() {
  return path.join(app.getPath('userData'), 'cache', 'item-catalog.json')
}

export function normalizeItemName(name: string): string {
  return name
    .toUpperCase()
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
        .get(target, { headers: { Accept: 'application/json', 'User-Agent': 'VoidLens' } }, (res) => {
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
  for (const item of items) {
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

  const pushItem = (name: string, uniqueName: string, ducats: number | null) => {
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
      normalized: key,
    })
  }

  for (const parent of parents) {
    const parentName = String(parent.name || '')
    const parentUnique = String(parent.uniqueName || parentName)
    if (!parentName) continue

    if (/prime/i.test(parentName)) {
      pushItem(parentName, parentUnique, null)
    }

    const components = parent.components
    if (!Array.isArray(components)) continue
    for (const comp of components) {
      if (!comp || typeof comp !== 'object') continue
      const c = comp as Record<string, unknown>
      const cName = String(c.name || '')
      if (!cName || !/prime/i.test(cName)) continue
      const cUnique = String(c.uniqueName || `${parentUnique}:${cName}`)
      const ducats = typeof c.ducats === 'number' ? c.ducats : null
      pushItem(cName, cUnique, ducats)
    }
  }

  // Common non-prime relic rewards
  for (const extra of ['Forma Blueprint', 'Orokin Catalyst Blueprint', 'Orokin Reactor Blueprint']) {
    pushItem(extra, extra, null)
  }

  rebuildIndexes(items)
  fs.mkdirSync(path.dirname(cachePath()), { recursive: true })
  const payload: CatalogCache = { fetchedAt: new Date().toISOString(), items }
  fs.writeFileSync(cachePath(), JSON.stringify(payload), 'utf8')
  console.info(`[VoidLens] Item catalog ready (${items.length} entries)`)
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

export function matchCatalogItem(ocrText: string): { item: CatalogItem; score: number } | null {
  const needle = normalizeItemName(ocrText)
  if (!needle || needle.length < 3) return null

  let best: CatalogItem | null = null
  let bestScore = Infinity

  for (const item of catalog) {
    if (item.normalized === needle) return { item, score: 0 }
    if (item.normalized.includes(needle) || needle.includes(item.normalized)) {
      const score = Math.abs(item.normalized.length - needle.length)
      if (score < bestScore) {
        best = item
        bestScore = score
      }
      continue
    }
    // Only run expensive distance for similar length strings
    if (Math.abs(item.normalized.length - needle.length) > 8) continue
    const dist = levenshtein(needle, item.normalized)
    const threshold = Math.max(2, Math.floor(needle.length * 0.25))
    if (dist <= threshold && dist < bestScore) {
      best = item
      bestScore = dist
    }
  }

  return best ? { item: best, score: bestScore } : null
}

export function getSetParts(setName: string | null): CatalogItem[] {
  if (!setName) return []
  return bySet.get(setName) || []
}
