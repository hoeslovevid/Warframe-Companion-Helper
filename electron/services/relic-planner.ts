import {
  ownedCountFor,
  peekInventoryIndex,
} from './inventory'
import { lookupWfinfoPlatinum, ensureWfinfoPrices } from './wfinfo-prices'
import {
  ensureRelicCatalog,
  getRelicByUnique,
  listIntactRelics,
  type RelicCatalogEntry,
} from './relic-catalog'

export type RelicPlannerSort = 'missing' | 'platinum' | 'owned' | 'name'

export type RelicPlannerReward = {
  name: string
  uniqueName: string | null
  rarity: string
  chance: number | null
  owned: number
  needed: boolean
  platinum: number | null
}

export type RelicPlannerRow = {
  key: string
  name: string
  tier: string
  owned: number
  vaulted: boolean | null
  missingCount: number
  bestPlatinum: number | null
  rewards: RelicPlannerReward[]
}

export type RelicPlannerResult = {
  rows: RelicPlannerRow[]
  ownedRelicTypes: number
  inventoryLoaded: boolean
  error: string | null
}

/** Sum owned counts for all refinement variants of each base relic key. */
function buildOwnedByKey(index: Record<string, number>): Map<string, number> {
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

function buildRow(
  entry: RelicCatalogEntry,
  index: Record<string, number>,
  ownedByKey: Map<string, number>,
): RelicPlannerRow {
  const rewards: RelicPlannerReward[] = entry.rewards.map((r) => {
    const owned = r.uniqueName ? ownedCountFor(r.uniqueName, index) : 0
    const needed = owned <= 0
    return {
      name: r.name,
      uniqueName: r.uniqueName,
      rarity: r.rarity,
      chance: r.chance,
      owned,
      needed,
      platinum: lookupWfinfoPlatinum(r.name),
    }
  })

  const missingCount = rewards.filter((r) => r.needed && !/forma/i.test(r.name)).length
  const plats = rewards.map((r) => r.platinum).filter((p): p is number => p != null && p > 0)
  const bestPlatinum = plats.length ? Math.max(...plats) : null

  return {
    key: entry.key,
    name: entry.key,
    tier: entry.tier,
    owned: ownedByKey.get(entry.key) || 0,
    vaulted: entry.vaulted,
    missingCount,
    bestPlatinum,
    rewards,
  }
}

export async function getRelicPlanner(opts?: {
  ownedOnly?: boolean
  sort?: RelicPlannerSort
  search?: string
  tier?: string
}): Promise<RelicPlannerResult> {
  try {
    await Promise.all([ensureRelicCatalog(), ensureWfinfoPrices()])
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
  const ownedOnly = opts?.ownedOnly !== false
  const sort = opts?.sort || 'missing'
  const search = (opts?.search || '').trim().toLowerCase()
  const tier = opts?.tier || 'all'

  let rows = listIntactRelics().map((e) => buildRow(e, index, ownedByKey))
  if (ownedOnly) rows = rows.filter((r) => r.owned > 0)
  if (tier !== 'all') rows = rows.filter((r) => r.tier.toLowerCase() === tier.toLowerCase())
  if (search) {
    rows = rows.filter(
      (r) =>
        r.key.toLowerCase().includes(search) ||
        r.rewards.some((rw) => rw.name.toLowerCase().includes(search)),
    )
  }

  rows.sort((a, b) => {
    if (sort === 'platinum') {
      return (b.bestPlatinum ?? -1) - (a.bestPlatinum ?? -1) || a.key.localeCompare(b.key)
    }
    if (sort === 'owned') {
      return b.owned - a.owned || a.key.localeCompare(b.key)
    }
    if (sort === 'name') return a.key.localeCompare(b.key)
    return (
      b.missingCount - a.missingCount ||
      (b.bestPlatinum ?? -1) - (a.bestPlatinum ?? -1) ||
      a.key.localeCompare(b.key)
    )
  })

  return {
    rows,
    ownedRelicTypes: [...ownedByKey.values()].filter((n) => n > 0).length,
    inventoryLoaded,
    error: null,
  }
}
