/**
 * Set / recipe checklist: which direct parts you have, and which owned relics drop the rest.
 */
import type { RecipeComponent, RecipeItem, SetFarmPart, SetFarmRelicSource, SetFarmResult } from '../../shared/types'
import { ownedCountFor, peekInventoryIndex } from './inventory'
import {
  ensureRecipeCatalog,
  getRecipeByUnique,
  getRecipeItems,
  resolveImageName,
} from './recipe-catalog'
import {
  ensureRelicCatalog,
  getDropSourcesForNames,
  getRelicByUnique,
} from './relic-catalog'

function normalize(s: string) {
  return s
    .toUpperCase()
    .replace(/['’]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SHORT_PARTS = new Set(
  [
    'Blueprint',
    'Neuroptics',
    'Chassis',
    'Systems',
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
  ].map((s) => normalize(s)),
)

/** Sum owned counts across Intact/Exceptional/Flawless/Radiant for each base relic key. */
export function buildOwnedRelicByKey(index: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>()
  for (const [unique, count] of Object.entries(index)) {
    if (!count || unique === 'RegularCredits' || unique === 'Ducats' || unique === 'PremiumCredits') {
      continue
    }
    const hit = getRelicByUnique(unique)
    if (!hit) continue
    map.set(hit.key, (map.get(hit.key) || 0) + count)
  }
  return map
}

function scoreRecipeMatch(name: string, q: string): number {
  const n = normalize(name)
  if (!q || !n) return 0
  if (n === q) return 1000
  if (n.startsWith(q)) return 800 - Math.min(200, n.length - q.length)
  if (n.includes(q)) return 500 - Math.min(200, n.length - q.length)
  const tokens = q.split(' ').filter(Boolean)
  if (tokens.length && tokens.every((t) => n.includes(t))) return 400 - n.length
  return 0
}

/** Best recipe for a free-text search like "ember prime" or "ember prime chassis". */
export function findRecipeForSearch(search: string): RecipeItem | null {
  const q = normalize(search)
  if (q.length < 2) return null
  const items = getRecipeItems()

  let best: RecipeItem | null = null
  let bestScore = 0
  for (const item of items) {
    const s = scoreRecipeMatch(item.name, q)
    if (s > bestScore) {
      bestScore = s
      best = item
    }
  }

  // Part-name fallback: "Ember Prime Chassis" → parent Ember Prime
  if (bestScore < 400) {
    for (const item of items) {
      for (const c of item.components) {
        const s = scoreRecipeMatch(partDisplayName(item.name, c.name), q)
        if (s > bestScore) {
          bestScore = s
          best = item
        }
      }
    }
  }

  return bestScore >= 400 ? best : null
}

/**
 * warframestat components are often short ("Chassis"); relic rewards are full
 * ("Ember Prime Chassis Blueprint").
 */
export function partDisplayName(parentName: string, componentName: string): string {
  const c = componentName.trim()
  if (!c) return parentName
  if (!SHORT_PARTS.has(normalize(c))) return c
  if (normalize(c) === 'BLUEPRINT') return `${parentName} Blueprint`
  if (normalize(c).startsWith(normalize(parentName))) return c
  return `${parentName} ${c}`
}

/** Candidate names used to hit the relic drop index. */
export function dropLookupNames(parentName: string, comp: RecipeComponent): string[] {
  const display = partDisplayName(parentName, comp.name)
  const out = new Set<string>()
  out.add(display)
  if (!/\bblueprint$/i.test(display)) out.add(`${display} Blueprint`)
  out.add(comp.name)
  const qualified = `${parentName} ${comp.name}`.trim()
  out.add(qualified)
  if (!/\bblueprint$/i.test(qualified)) out.add(`${qualified} Blueprint`)
  if (comp.uniqueName) out.add(comp.uniqueName)
  return [...out]
}

function annotateSources(
  parentName: string,
  comp: RecipeComponent,
  ownedByKey: Map<string, number>,
): { owned: SetFarmRelicSource[]; other: SetFarmRelicSource[] } {
  const raw = getDropSourcesForNames(dropLookupNames(parentName, comp))
  const all: SetFarmRelicSource[] = raw.map((s) => ({
    ...s,
    owned: ownedByKey.get(s.key) || 0,
  }))
  all.sort(
    (a, b) =>
      b.owned - a.owned ||
      Number(Boolean(a.vaulted)) - Number(Boolean(b.vaulted)) ||
      a.key.localeCompare(b.key),
  )
  const owned = all.filter((s) => s.owned > 0)
  const other = all.filter((s) => s.owned <= 0)
  return { owned, other }
}

export function buildSetFarmForRecipe(item: RecipeItem): SetFarmResult {
  const index = peekInventoryIndex()
  const inventoryLoaded = Object.keys(index).length > 0
  const ownedByKey = buildOwnedRelicByKey(index)
  const ownedFinished = ownedCountFor(item.uniqueName, index) > 0

  const parts: SetFarmPart[] = item.components.map((c) => {
    const owned = ownedCountFor(c.uniqueName, index)
    const required = Math.max(1, c.itemCount)
    const missing = Math.max(0, required - owned)
    const have = missing <= 0
    // Always resolve drop sources for missing parts (even if finished item is owned).
    const sources = have
      ? { owned: [] as SetFarmRelicSource[], other: [] as SetFarmRelicSource[] }
      : annotateSources(item.name, c, ownedByKey)
    return {
      name: partDisplayName(item.name, c.name),
      uniqueName: c.uniqueName,
      imageName: resolveImageName(c.uniqueName, c.imageName),
      required,
      owned,
      missing,
      have,
      sourcesOwned: sources.owned.slice(0, 12),
      // Keep a few unowned drops visible even when you own some, so vaulted/trade options show.
      sourcesOther: (sources.owned.length ? sources.other.slice(0, 4) : sources.other.slice(0, 8)),
    }
  })

  const haveCount = parts.filter((p) => p.have).length
  const missingCount = parts.filter((p) => !p.have).length

  return {
    uniqueName: item.uniqueName,
    name: item.name,
    imageName: item.imageName,
    ownedFinished,
    parts,
    haveCount,
    missingCount,
    inventoryLoaded,
    error: null,
  }
}

export async function getSetFarm(opts: {
  uniqueName?: string
  search?: string
}): Promise<SetFarmResult | null> {
  try {
    await Promise.all([ensureRecipeCatalog(), ensureRelicCatalog()])
  } catch (err) {
    return {
      uniqueName: '',
      name: '',
      imageName: null,
      ownedFinished: false,
      parts: [],
      haveCount: 0,
      missingCount: 0,
      inventoryLoaded: false,
      error: err instanceof Error ? err.message : 'Failed to load set farm data',
    }
  }

  let item: RecipeItem | null = null
  if (opts.uniqueName) item = getRecipeByUnique(opts.uniqueName)
  if (!item && opts.search) item = findRecipeForSearch(opts.search)
  if (!item) return null
  return buildSetFarmForRecipe(item)
}
