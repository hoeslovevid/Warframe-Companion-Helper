import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { app } from 'electron'
import type { FoundryCategory, RecipeComponent, RecipeItem } from '../../shared/types'

/** Bump when RecipeItem shape changes so stale userData caches refetch. */
const RECIPE_CACHE_VERSION = 3

const WFCD_JSON = (file: string) =>
  `https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/${file}`

type RecipeCache = {
  version?: number
  fetchedAt: string
  items: RecipeItem[]
}

function parseImageName(raw: Record<string, unknown>): string | null {
  const name = String(raw.imageName || '').trim()
  return name || null
}

let items: RecipeItem[] = []
let byUnique = new Map<string, RecipeItem>()
let ready: Promise<void> | null = null

function cachePath() {
  return path.join(app.getPath('userData'), 'cache', 'recipe-catalog.json')
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
            reject(new Error(`Recipe catalog fetch failed (${res.statusCode})`))
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

function mapCategory(source: 'warframe' | 'weapon' | 'sentinel', raw: Record<string, unknown>): FoundryCategory {
  if (source === 'warframe') return 'warframe'
  if (source === 'sentinel') return 'companion'
  const cat = String(raw.category || raw.type || '').toLowerCase()
  if (cat.includes('primary') || cat.includes('rifle') || cat.includes('shotgun') || cat.includes('bow')) {
    return 'primary'
  }
  if (cat.includes('secondary') || cat.includes('pistol')) return 'secondary'
  if (cat.includes('melee')) return 'melee'
  if (cat.includes('sentinel') || cat.includes('companion') || cat.includes('pet')) return 'companion'
  if (cat.includes('arch')) return 'archwing'
  return 'other'
}

function parseComponents(raw: unknown, depth = 0): RecipeComponent[] {
  if (!Array.isArray(raw) || depth > 6) return []
  const out: RecipeComponent[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const c = entry as Record<string, unknown>
    const name = String(c.name || '').trim()
    const uniqueName = String(c.uniqueName || name).trim()
    if (!name && !uniqueName) continue
    const itemCount = Math.max(1, Number(c.itemCount ?? c.ItemCount ?? 1) || 1)
    const nested = parseComponents(c.components, depth + 1)
    out.push({
      name: name || uniqueName.split('/').pop() || uniqueName,
      uniqueName,
      itemCount,
      imageName: parseImageName(c),
      components: nested.length ? nested : undefined,
    })
  }
  return out
}

function rebuildIndexes(next: RecipeItem[]) {
  items = next
  byUnique = new Map()
  for (const item of next) {
    byUnique.set(item.uniqueName, item)
    const base = item.uniqueName.split('/').pop()
    if (base && !byUnique.has(base)) byUnique.set(base, item)
  }
}

function loadCache(): boolean {
  try {
    const file = cachePath()
    if (!fs.existsSync(file)) return false
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as RecipeCache
    if (!parsed.items?.length) return false
    if (parsed.version !== RECIPE_CACHE_VERSION) {
      return false
    }
    rebuildIndexes(parsed.items)
    const age = Date.now() - new Date(parsed.fetchedAt).getTime()
    if (age > 7 * 24 * 60 * 60 * 1000) {
      void fetchAndCache().catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

function ingestParent(
  raw: Record<string, unknown>,
  source: 'warframe' | 'weapon' | 'sentinel',
  out: RecipeItem[],
  seen: Set<string>,
) {
  const name = String(raw.name || '').trim()
  const uniqueName = String(raw.uniqueName || name).trim()
  if (!name || !uniqueName || seen.has(uniqueName)) return
  const components = parseComponents(raw.components)
  if (!components.length) return
  seen.add(uniqueName)
  out.push({
    uniqueName,
    name,
    category: mapCategory(source, raw),
    masteryReq: typeof raw.masteryReq === 'number' ? raw.masteryReq : null,
    buildPrice: typeof raw.buildPrice === 'number' ? raw.buildPrice : null,
    buildTime: typeof raw.buildTime === 'number' ? raw.buildTime : null,
    vaulted: typeof raw.vaulted === 'boolean' ? raw.vaulted : null,
    isPrime: /prime/i.test(name),
    imageName: parseImageName(raw),
    components,
  })
}

async function fetchJsonArray(url: string): Promise<Array<Record<string, unknown>>> {
  try {
    const raw = await httpsGetJson(url)
    return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : []
  } catch {
    return []
  }
}

async function fetchAndCache(): Promise<void> {
  // warframestat `/sentinels` is 404 — load companions from WFCD instead.
  const [warframes, weapons, sentinels, skins] = await Promise.all([
    fetchJsonArray('https://api.warframestat.us/warframes'),
    fetchJsonArray('https://api.warframestat.us/weapons'),
    fetchJsonArray(WFCD_JSON('Sentinels.json')),
    fetchJsonArray(WFCD_JSON('Skins.json')),
  ])

  const companionSkins = skins.filter((row) => {
    const name = String(row.name || '')
    const comps = row.components
    return (
      /prime/i.test(name) &&
      Array.isArray(comps) &&
      comps.length > 0 &&
      /collar|kubrow|kavat/i.test(name)
    )
  })

  const out: RecipeItem[] = []
  const seen = new Set<string>()
  for (const row of warframes) ingestParent(row, 'warframe', out, seen)
  for (const row of weapons) ingestParent(row, 'weapon', out, seen)
  for (const row of sentinels) ingestParent(row, 'sentinel', out, seen)
  for (const row of companionSkins) ingestParent(row, 'sentinel', out, seen)

  out.sort((a, b) => a.name.localeCompare(b.name))
  rebuildIndexes(out)
  fs.mkdirSync(path.dirname(cachePath()), { recursive: true })
  const payload: RecipeCache = {
    version: RECIPE_CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    items: out,
  }
  fs.writeFileSync(cachePath(), JSON.stringify(payload), 'utf8')
  console.info(`[Everything Warframe] Recipe catalog ready (${out.length} buildable items)`)
}

export function ensureRecipeCatalog(opts?: { force?: boolean }): Promise<void> {
  if (opts?.force) ready = null
  if (!ready) {
    ready = (async () => {
      if (opts?.force || !loadCache()) {
        await fetchAndCache()
      }
    })().catch((err) => {
      // Allow a later call to retry after a network / disk failure.
      ready = null
      throw err
    })
  }
  return ready
}

/** Drop in-memory catalog so the next ensure reloads from disk or network. */
export function invalidateRecipeCatalog() {
  ready = null
  items = []
  byUnique = new Map()
}

export function getRecipeItems(): RecipeItem[] {
  return items
}

export function getRecipeByUnique(uniqueName: string): RecipeItem | null {
  if (!uniqueName) return null
  return byUnique.get(uniqueName) || byUnique.get(uniqueName.split('/').pop() || '') || null
}

/** Resolve nested component recipe from catalog or inline component data. */
export function resolveComponentRecipe(comp: RecipeComponent): RecipeComponent[] {
  if (comp.components?.length) return comp.components
  const item = getRecipeByUnique(comp.uniqueName)
  return item?.components || []
}

/** Prefer component imageName, else look up catalog parent art. */
export function resolveImageName(uniqueName: string, imageName?: string | null): string | null {
  if (imageName) return imageName
  return getRecipeByUnique(uniqueName)?.imageName ?? null
}
