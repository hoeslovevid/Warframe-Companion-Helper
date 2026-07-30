import type {
  FoundryListFilters,
  FoundryListItem,
  FoundryTotalLine,
  FoundryTreeNode,
  FoundryTreeResult,
  InventoryIndex,
  MasteryIndex,
  RecipeComponent,
  RecipeItem,
} from '../../shared/types'
import {
  ownedCountFor,
  peekInventoryIndex,
  peekMasteryIndex,
} from './inventory'
import {
  ensureRecipeCatalog,
  getRecipeByUnique,
  getRecipeItems,
  resolveComponentRecipe,
  resolveImageName,
} from './recipe-catalog'

const MAX_DEPTH = 6

function normalizeSearch(s: string) {
  return s
    .toUpperCase()
    .replace(/['’]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function directReady(item: RecipeItem, index: InventoryIndex): boolean {
  if (!item.components.length) return false
  // Non-strict: catalog *Component paths match inventory *Blueprint stacks.
  return item.components.every((c) => ownedCountFor(c.uniqueName, index) >= c.itemCount)
}

function missingDirectCount(item: RecipeItem, index: InventoryIndex): number {
  let missing = 0
  for (const c of item.components) {
    const owned = ownedCountFor(c.uniqueName, index)
    if (owned < c.itemCount) missing += 1
  }
  return missing
}

/** Main recipe BP component (name "Blueprint"), if present. */
function mainBlueprintUnique(item: RecipeItem): string | null {
  const named = item.components.find((c) => /^blueprint$/i.test(c.name.trim()))
  return named?.uniqueName || null
}

function hasMainBlueprint(item: RecipeItem, index: InventoryIndex): boolean {
  const bp = mainBlueprintUnique(item)
  if (!bp) return false
  return ownedCountFor(bp, index) > 0
}

function isOwnedItem(item: RecipeItem, index: InventoryIndex, mastery: MasteryIndex): boolean {
  const ownedCount = ownedCountFor(item.uniqueName, index)
  if (ownedCount > 0) return true
  const masteryEntry =
    mastery[item.uniqueName] || mastery[item.uniqueName.split('/').pop() || ''] || null
  return (masteryEntry?.owned ?? 0) > 0
}

function toListItem(
  item: RecipeItem,
  index: InventoryIndex,
  mastery: MasteryIndex,
): FoundryListItem {
  const ownedCount = ownedCountFor(item.uniqueName, index)
  const masteryEntry =
    mastery[item.uniqueName] || mastery[item.uniqueName.split('/').pop() || ''] || null
  const owned = ownedCount > 0 || (masteryEntry?.owned ?? 0) > 0
  return {
    uniqueName: item.uniqueName,
    name: item.name,
    category: item.category,
    masteryReq: item.masteryReq,
    buildPrice: item.buildPrice,
    buildTime: item.buildTime,
    vaulted: item.vaulted,
    isPrime: item.isPrime,
    imageName: item.imageName,
    owned,
    hasBlueprint: hasMainBlueprint(item, index),
    ownedCount: Math.max(ownedCount, masteryEntry?.owned ?? 0),
    mastered: masteryEntry ? masteryEntry.mastered : null,
    readyToBuild: directReady(item, index),
    missingDirect: missingDirectCount(item, index),
  }
}

/** Recipes for gear you own, plus anything you can craft from current parts. */
function collectInventoryRecipes(
  index: InventoryIndex,
  mastery: MasteryIndex,
  includeReady: boolean,
): RecipeItem[] {
  const seen = new Set<string>()
  const out: RecipeItem[] = []

  const addOwned = (key: string) => {
    const recipe = getRecipeByUnique(key)
    if (!recipe || seen.has(recipe.uniqueName)) return
    if (!isOwnedItem(recipe, index, mastery)) return
    seen.add(recipe.uniqueName)
    out.push(recipe)
  }

  for (const key of Object.keys(mastery)) addOwned(key)
  for (const key of Object.keys(index)) addOwned(key)

  // Ready-to-build: cheap component checks only (no full row build yet).
  if (includeReady && Object.keys(index).length > 0) {
    for (const item of getRecipeItems()) {
      if (seen.has(item.uniqueName)) continue
      if (directReady(item, index)) {
        seen.add(item.uniqueName)
        out.push(item)
      }
    }
  }

  return out
}

function matchesStaticFilters(
  item: RecipeItem,
  filters: {
    search: string
    category: string
    prime: string
    vaulted: string
  },
): boolean {
  if (filters.category !== 'all' && item.category !== filters.category) return false
  if (filters.prime === 'prime' && !item.isPrime) return false
  if (filters.prime === 'normal' && item.isPrime) return false
  if (filters.vaulted === 'vaulted' && item.vaulted !== true) return false
  if (filters.vaulted === 'unvaulted' && item.vaulted === true) return false
  if (filters.search) {
    const hay = normalizeSearch(`${item.name} ${item.uniqueName}`)
    if (!hay.includes(filters.search)) return false
  }
  return true
}

export async function listFoundryItems(filters: FoundryListFilters = {}): Promise<FoundryListItem[]> {
  await ensureRecipeCatalog()
  const index = peekInventoryIndex()
  const mastery = peekMasteryIndex()
  const search = normalizeSearch(filters.search || '')
  const category = filters.category || 'all'
  const prime = filters.prime || 'any'
  const owned = filters.owned || 'any'
  const masteryFilter = filters.mastery || 'any'
  const ready = filters.ready || 'any'
  const vaulted = filters.vaulted || 'any'
  const scope = filters.scope || 'inventory'

  // Owned-only view can skip the ready-to-build catalog pass.
  const includeReady = owned !== 'owned'
  const source =
    scope === 'inventory'
      ? collectInventoryRecipes(index, mastery, includeReady)
      : getRecipeItems()

  const staticFilters = { search, category, prime, vaulted }
  const out: FoundryListItem[] = []
  for (const item of source) {
    if (!matchesStaticFilters(item, staticFilters)) continue
    const row = toListItem(item, index, mastery)
    if (owned === 'owned' && !row.owned) continue
    if (owned === 'unowned' && row.owned) continue
    if (masteryFilter === 'mastered' && row.mastered !== true) continue
    if (masteryFilter === 'unmastered' && row.mastered !== false) continue
    if (masteryFilter === 'unknown' && row.mastered !== null) continue
    if (ready === 'ready' && !row.readyToBuild) continue
    if (ready === 'not_ready' && row.readyToBuild) continue
    out.push(row)
  }

  if (scope === 'inventory') {
    out.sort((a, b) => a.name.localeCompare(b.name))
  }
  return out
}

function buildTreeNode(
  name: string,
  uniqueName: string,
  required: number,
  components: RecipeComponent[],
  depth: number,
  stack: Set<string>,
  index: InventoryIndex,
  imageName: string | null = null,
): FoundryTreeNode {
  const owned = ownedCountFor(uniqueName, index)
  const missing = Math.max(0, required - owned)
  const children: FoundryTreeNode[] = []
  const resolvedImage = resolveImageName(uniqueName, imageName)

  if (missing > 0 && depth < MAX_DEPTH && components.length && !stack.has(uniqueName)) {
    const nextStack = new Set(stack)
    nextStack.add(uniqueName)
    for (const comp of components) {
      const nested = resolveComponentRecipe(comp)
      children.push(
        buildTreeNode(
          comp.name,
          comp.uniqueName,
          comp.itemCount * missing,
          nested,
          depth + 1,
          nextStack,
          index,
          comp.imageName,
        ),
      )
    }
  }

  return {
    name,
    uniqueName,
    required,
    owned,
    missing,
    imageName: resolvedImage,
    children,
  }
}

function accumulateTotals(
  components: RecipeComponent[],
  craftsNeeded: number,
  depth: number,
  stack: Set<string>,
  bucket: Map<string, FoundryTotalLine>,
  index: InventoryIndex,
) {
  if (craftsNeeded <= 0 || depth > MAX_DEPTH) return

  for (const comp of components) {
    const need = comp.itemCount * craftsNeeded
    const owned = ownedCountFor(comp.uniqueName, index)
    const still = Math.max(0, need - owned)
    if (still <= 0) continue

    const nested = resolveComponentRecipe(comp)
    if (nested.length && !stack.has(comp.uniqueName)) {
      const next = new Set(stack)
      next.add(comp.uniqueName)
      accumulateTotals(nested, still, depth + 1, next, bucket, index)
    } else {
      const prev = bucket.get(comp.uniqueName)
      if (prev) {
        prev.required += still
        prev.missing = Math.max(0, prev.required - owned)
      } else {
        bucket.set(comp.uniqueName, {
          name: comp.name,
          uniqueName: comp.uniqueName,
          required: still,
          owned,
          missing: still,
          imageName: resolveImageName(comp.uniqueName, comp.imageName),
        })
      }
    }
  }
}

export async function getFoundryTree(uniqueName: string): Promise<FoundryTreeResult> {
  await ensureRecipeCatalog()
  try {
    const { ensureRelicCatalog } = await import('./relic-catalog')
    await ensureRelicCatalog()
  } catch {
    // Drop sources optional if relic catalog fails
  }
  const index = peekInventoryIndex()
  const mastery = peekMasteryIndex()
  const inventoryLoaded = Object.keys(index).length > 0
  const item = getRecipeByUnique(uniqueName)
  if (!item) {
    return {
      item: null,
      tree: null,
      totals: [],
      setFarm: null,
      inventoryLoaded,
      error: 'Recipe not found in catalog',
    }
  }

  const listItem = toListItem(item, index, mastery)
  const tree = buildTreeNode(
    item.name,
    item.uniqueName,
    1,
    item.components,
    0,
    new Set(),
    index,
    item.imageName,
  )
  const bucket = new Map<string, FoundryTotalLine>()
  const ownedFinished = ownedCountFor(item.uniqueName, index)
  const craftsNeeded = ownedFinished > 0 ? 0 : 1
  if (craftsNeeded > 0) {
    accumulateTotals(item.components, craftsNeeded, 0, new Set([item.uniqueName]), bucket, index)
  }

  const totals = [...bucket.values()].sort((a, b) => a.name.localeCompare(b.name))

  const { buildSetFarmForRecipe } = await import('./set-farm')
  const setFarm = buildSetFarmForRecipe(item)

  return {
    item: listItem,
    tree,
    totals,
    setFarm,
    inventoryLoaded,
    error: null,
  }
}

export function formatBuildTime(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    const rh = h % 24
    return rh ? `${d}d ${rh}h` : `${d}d`
  }
  if (h) return m ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}
