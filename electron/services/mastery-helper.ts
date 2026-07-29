import type { FoundryCategory, MasteryEntry } from '../../shared/types'
import {
  ownedCountFor,
  ownedCountForCraft,
  peekInventoryIndex,
  peekMasteryIndex,
} from './inventory'
import {
  ensureRecipeCatalog,
  getRecipeItems,
} from './recipe-catalog'

function isDirectReady(
  components: Array<{ uniqueName: string; itemCount: number }>,
  index: Record<string, number>,
): boolean {
  if (!components.length) return false
  return components.every((c) => ownedCountForCraft(c.uniqueName, index) >= c.itemCount)
}

export type MasteryHelperItem = {
  uniqueName: string
  name: string
  category: FoundryCategory
  masteryReq: number | null
  owned: boolean
  mastered: boolean | null
  xpLevel: number | null
  readyToBuild: boolean
  isPrime: boolean
  imageName: string | null
}

export type MasteryHelperResult = {
  items: MasteryHelperItem[]
  summary: {
    mastered: number
    ownedUnmastered: number
    readyUnmastered: number
    unknown: number
  }
  inventoryLoaded: boolean
  error: string | null
}

export async function getMasteryHelper(opts?: {
  filter?: 'next' | 'owned_unmastered' | 'ready' | 'all'
  search?: string
}): Promise<MasteryHelperResult> {
  try {
    await ensureRecipeCatalog()
  } catch (err) {
    return {
      items: [],
      summary: { mastered: 0, ownedUnmastered: 0, readyUnmastered: 0, unknown: 0 },
      inventoryLoaded: false,
      error: err instanceof Error ? err.message : 'Failed to load recipes',
    }
  }

  const index = peekInventoryIndex()
  const mastery = peekMasteryIndex()
  const inventoryLoaded = Object.keys(index).length > 0 || Object.keys(mastery).length > 0
  const filter = opts?.filter || 'next'
  const search = (opts?.search || '').trim().toLowerCase()

  const items: MasteryHelperItem[] = []
  for (const recipe of getRecipeItems()) {
    const ownedCount = ownedCountFor(recipe.uniqueName, index)
    const m: MasteryEntry | null =
      mastery[recipe.uniqueName] || mastery[recipe.uniqueName.split('/').pop() || ''] || null
    const owned = ownedCount > 0 || (m?.owned ?? 0) > 0
    const mastered = m ? m.mastered : null
    const readyToBuild =
      !owned && isDirectReady(recipe.components, index)
    items.push({
      uniqueName: recipe.uniqueName,
      name: recipe.name,
      category: recipe.category,
      masteryReq: recipe.masteryReq,
      owned,
      mastered,
      xpLevel: m?.xpLevel ?? null,
      readyToBuild,
      isPrime: recipe.isPrime,
      imageName: recipe.imageName,
    })
  }

  const summary = {
    mastered: items.filter((i) => i.mastered === true).length,
    ownedUnmastered: items.filter((i) => i.owned && i.mastered !== true).length,
    readyUnmastered: items.filter((i) => i.readyToBuild && i.mastered !== true).length,
    unknown: items.filter((i) => i.mastered === null && i.owned).length,
  }

  let filtered = items
  if (filter === 'next') {
    // Ready to craft (unmastered) first, then owned unmastered
    filtered = items.filter(
      (i) => (i.readyToBuild || (i.owned && i.mastered !== true)) && i.mastered !== true,
    )
  } else if (filter === 'owned_unmastered') {
    filtered = items.filter((i) => i.owned && i.mastered !== true)
  } else if (filter === 'ready') {
    filtered = items.filter((i) => i.readyToBuild)
  }

  if (search) {
    filtered = filtered.filter((i) => i.name.toLowerCase().includes(search))
  }

  filtered.sort((a, b) => {
    // Prefer ready-to-build, then owned, then name
    const score = (x: MasteryHelperItem) =>
      (x.readyToBuild ? 4 : 0) + (x.owned ? 2 : 0) + (x.mastered === false ? 1 : 0)
    return score(b) - score(a) || a.name.localeCompare(b.name)
  })

  return { items: filtered, summary, inventoryLoaded, error: null }
}
