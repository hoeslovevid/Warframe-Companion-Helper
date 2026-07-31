import {
  ownedCountForReward,
  peekInventoryIndex,
} from './inventory'
import { lookupWfinfoPlatinum, ensureWfinfoPrices } from './wfinfo-prices'
import { ensureItemCatalog, findCatalogItemByName } from './item-catalog'
import {
  ensureRelicCatalog,
  getRelicByUnique,
  listIntactRelics,
  type RelicCatalogEntry,
} from './relic-catalog'
import { loadSettings } from '../settings'
import type {
  FoundryPrimeFilter,
  RelicPlannerQuery,
  RelicPlannerResult,
  RelicPlannerRow,
  RelicPlannerSort,
} from '../../shared/types'

export type { RelicPlannerSort, RelicPlannerReward, RelicPlannerRow, RelicPlannerResult } from '../../shared/types'

function normalizeFavorite(s: string): string {
  return s
    .toUpperCase()
    .replace(/['’]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sum owned counts for all refinement variants of each base relic key. */
function buildOwnedByKey(index: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>()
  for (const [unique, count] of Object.entries(index)) {
    if (!count || unique === 'RegularCredits' || unique === 'Ducats' || unique === 'PremiumCredits') {
      continue
    }
    // Skip basename aliases — addCount indexes both full path and leaf, which
    // would double every relic stack (e.g. 9 → 18).
    if (!unique.includes('/')) continue
    const hit = getRelicByUnique(unique)
    if (!hit) continue
    map.set(hit.key, (map.get(hit.key) || 0) + count)
  }
  return map
}

function rewardDucats(name: string): number | null {
  const hit = findCatalogItemByName(name)
  return hit?.ducats ?? null
}

function rowTouchesFavorite(
  rewards: Array<{ name: string }>,
  favoriteNorms: Set<string>,
): boolean {
  if (!favoriteNorms.size) return false
  for (const r of rewards) {
    const n = normalizeFavorite(r.name)
    if (!n) continue
    if (favoriteNorms.has(n)) return true
    for (const fav of favoriteNorms) {
      if (n.includes(fav) || fav.includes(n)) return true
    }
  }
  return false
}

function buildRow(
  entry: RelicCatalogEntry,
  index: Record<string, number>,
  ownedByKey: Map<string, number>,
  favoriteNorms: Set<string>,
): RelicPlannerRow {
  const rewards = entry.rewards.map((r) => {
    const owned = ownedCountForReward(r.uniqueName, r.name, index)
    const needed = owned <= 0
    return {
      name: r.name,
      uniqueName: r.uniqueName,
      rarity: r.rarity,
      chance: r.chance,
      owned,
      needed,
      platinum: lookupWfinfoPlatinum(r.name),
      ducats: rewardDucats(r.name),
    }
  })

  const missingCount = rewards.filter((r) => r.needed && !/forma/i.test(r.name)).length
  const plats = rewards.map((r) => r.platinum).filter((p): p is number => p != null && p > 0)
  const bestPlatinum = plats.length ? Math.max(...plats) : null
  const ducatVals = rewards
    .filter((r) => r.needed || r.owned <= 0)
    .map((r) => r.ducats)
    .filter((d): d is number => d != null && d > 0)
  // Ducat "profit": best ducat among missing/unowned rewards (farm value).
  const allDucats = rewards.map((r) => r.ducats).filter((d): d is number => d != null && d > 0)
  const bestDucats = (ducatVals.length ? Math.max(...ducatVals) : null) ??
    (allDucats.length ? Math.max(...allDucats) : null)

  return {
    key: entry.key,
    name: entry.key,
    tier: entry.tier,
    owned: ownedByKey.get(entry.key) || 0,
    vaulted: entry.vaulted,
    missingCount,
    bestPlatinum,
    bestDucats,
    hasFavorite: rowTouchesFavorite(rewards, favoriteNorms),
    rewards,
  }
}

function relicHasPrimeReward(row: RelicPlannerRow): boolean {
  return row.rewards.some((r) => /prime/i.test(r.name) && !/^forma\b/i.test(r.name))
}

export async function getRelicPlanner(opts?: RelicPlannerQuery): Promise<RelicPlannerResult> {
  try {
    await Promise.all([ensureRelicCatalog(), ensureWfinfoPrices(), ensureItemCatalog()])
  } catch (err) {
    return {
      rows: [],
      ownedRelicTypes: 0,
      inventoryLoaded: false,
      error: err instanceof Error ? err.message : 'Failed to load relic catalog',
    }
  }

  const index = peekInventoryIndex()
  const inventoryLoaded = Object.keys(index).length > 0
  const ownedByKey = buildOwnedByKey(index)
  const settings = loadSettings()
  const favoriteNorms = new Set(
    (settings.farmFavorites || []).map(normalizeFavorite).filter(Boolean),
  )
  const ownedOnly = opts?.ownedOnly !== false
  const sort: RelicPlannerSort = opts?.sort || 'missing'
  const search = (opts?.search || '').trim().toLowerCase()
  const tier = opts?.tier || 'all'
  const prime: FoundryPrimeFilter = opts?.prime || 'any'
  const favoritesFirst = opts?.favoritesFirst !== false && favoriteNorms.size > 0

  let rows = listIntactRelics().map((e) => buildRow(e, index, ownedByKey, favoriteNorms))
  if (ownedOnly) rows = rows.filter((r) => r.owned > 0)
  if (tier !== 'all') rows = rows.filter((r) => r.tier.toLowerCase() === tier.toLowerCase())
  if (prime === 'prime') rows = rows.filter((r) => relicHasPrimeReward(r))
  if (prime === 'normal') rows = rows.filter((r) => !relicHasPrimeReward(r))
  if (search) {
    rows = rows.filter(
      (r) =>
        r.key.toLowerCase().includes(search) ||
        r.rewards.some((rw) => {
          const name = rw.name.toLowerCase()
          if (!name.includes(search)) return false
          if (prime === 'prime' && !/prime/i.test(rw.name)) return false
          if (prime === 'normal' && /prime/i.test(rw.name)) return false
          return true
        }),
    )
  }

  const compare = (a: RelicPlannerRow, b: RelicPlannerRow) => {
    if (sort === 'platinum') {
      return (b.bestPlatinum ?? -1) - (a.bestPlatinum ?? -1) || a.key.localeCompare(b.key)
    }
    if (sort === 'ducats') {
      return (b.bestDucats ?? -1) - (a.bestDucats ?? -1) || a.key.localeCompare(b.key)
    }
    if (sort === 'owned') {
      return b.owned - a.owned || a.key.localeCompare(b.key)
    }
    if (sort === 'name') return a.key.localeCompare(b.key)
    // missing (Best for MR)
    return (
      b.missingCount - a.missingCount ||
      (b.bestPlatinum ?? -1) - (a.bestPlatinum ?? -1) ||
      a.key.localeCompare(b.key)
    )
  }

  rows.sort((a, b) => {
    if (favoritesFirst && a.hasFavorite !== b.hasFavorite) {
      return a.hasFavorite ? -1 : 1
    }
    return compare(a, b)
  })

  const limit = opts?.limit
  if (typeof limit === 'number' && limit > 0 && rows.length > limit) {
    rows = rows.slice(0, limit)
  }

  return {
    rows,
    ownedRelicTypes: [...ownedByKey.values()].filter((n) => n > 0).length,
    inventoryLoaded,
    error: null,
  }
}
