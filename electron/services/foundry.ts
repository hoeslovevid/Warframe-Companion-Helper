import type {
  FoundryListFilters,
  FoundryListItem,
  FoundryTotalLine,
  FoundryTreeNode,
  FoundryTreeResult,
  RecipeComponent,
  RecipeItem,
} from '../../shared/types'
import { getInventoryIndex, getMasteryIndex, ownedCountFor } from './inventory'
import {
  ensureRecipeCatalog,
  getRecipeByUnique,
  getRecipeItems,
  resolveComponentRecipe,
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

function directReady(item: RecipeItem, index: ReturnType<typeof getInventoryIndex>): boolean {
  if (!item.components.length) return false
  return item.components.every((c) => ownedCountFor(c.uniqueName, index) >= c.itemCount)
}

function missingDirectCount(item: RecipeItem, index: ReturnType<typeof getInventoryIndex>): number {
  let missing = 0
  for (const c of item.components) {
    const owned = ownedCountFor(c.uniqueName, index)
    if (owned < c.itemCount) missing += 1
  }
  return missing
}

function toListItem(item: RecipeItem): FoundryListItem {
  const index = getInventoryIndex()
  const mastery = getMasteryIndex()
  const ownedCount = ownedCountFor(item.uniqueName, index)
  const masteryEntry =
    mastery[item.uniqueName] || mastery[item.uniqueName.split('/').pop() || ''] || null
  return {
    uniqueName: item.uniqueName,
    name: item.name,
    category: item.category,
    masteryReq: item.masteryReq,
    buildPrice: item.buildPrice,
    buildTime: item.buildTime,
    vaulted: item.vaulted,
    isPrime: item.isPrime,
    owned: ownedCount > 0 || (masteryEntry?.owned ?? 0) > 0,
    ownedCount: Math.max(ownedCount, masteryEntry?.owned ?? 0),
    mastered: masteryEntry ? masteryEntry.mastered : null,
    readyToBuild: directReady(item, index),
    missingDirect: missingDirectCount(item, index),
  }
}

export async function listFoundryItems(filters: FoundryListFilters = {}): Promise<FoundryListItem[]> {
  await ensureRecipeCatalog()
  const search = normalizeSearch(filters.search || '')
  const category = filters.category || 'all'
  const prime = filters.prime || 'any'
  const owned = filters.owned || 'any'
  const mastery = filters.mastery || 'any'
  const ready = filters.ready || 'any'
  const vaulted = filters.vaulted || 'any'

  const out: FoundryListItem[] = []
  for (const item of getRecipeItems()) {
    if (category !== 'all' && item.category !== category) continue
    if (prime === 'prime' && !item.isPrime) continue
    if (prime === 'normal' && item.isPrime) continue
    if (vaulted === 'vaulted' && item.vaulted !== true) continue
    if (vaulted === 'unvaulted' && item.vaulted === true) continue
    if (search) {
      const hay = normalizeSearch(`${item.name} ${item.uniqueName}`)
      if (!hay.includes(search)) continue
    }
    const row = toListItem(item)
    if (owned === 'owned' && !row.owned) continue
    if (owned === 'unowned' && row.owned) continue
    if (mastery === 'mastered' && row.mastered !== true) continue
    if (mastery === 'unmastered' && row.mastered !== false) continue
    if (mastery === 'unknown' && row.mastered !== null) continue
    if (ready === 'ready' && !row.readyToBuild) continue
    if (ready === 'not_ready' && row.readyToBuild) continue
    out.push(row)
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
): FoundryTreeNode {
  const index = getInventoryIndex()
  const owned = ownedCountFor(uniqueName, index)
  const missing = Math.max(0, required - owned)
  const children: FoundryTreeNode[] = []

  if (missing > 0 && depth < MAX_DEPTH && components.length && !stack.has(uniqueName)) {
    const nextStack = new Set(stack)
    nextStack.add(uniqueName)
    for (const comp of components) {
      const nested = resolveComponentRecipe(comp)
      children.push(
        buildTreeNode(comp.name, comp.uniqueName, comp.itemCount * missing, nested, depth + 1, nextStack),
      )
    }
  }

  return { name, uniqueName, required, owned, missing, children }
}

function accumulateTotals(
  components: RecipeComponent[],
  craftsNeeded: number,
  depth: number,
  stack: Set<string>,
  bucket: Map<string, FoundryTotalLine>,
) {
  if (craftsNeeded <= 0 || depth > MAX_DEPTH) return
  const index = getInventoryIndex()

  for (const comp of components) {
    const need = comp.itemCount * craftsNeeded
    const owned = ownedCountFor(comp.uniqueName, index)
    const still = Math.max(0, need - owned)
    if (still <= 0) continue

    const nested = resolveComponentRecipe(comp)
    if (nested.length && !stack.has(comp.uniqueName)) {
      const next = new Set(stack)
      next.add(comp.uniqueName)
      accumulateTotals(nested, still, depth + 1, next, bucket)
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
        })
      }
    }
  }
}

export async function getFoundryTree(uniqueName: string): Promise<FoundryTreeResult> {
  await ensureRecipeCatalog()
  const inventoryLoaded = Object.keys(getInventoryIndex()).length > 0
  const item = getRecipeByUnique(uniqueName)
  if (!item) {
    return {
      item: null,
      tree: null,
      totals: [],
      inventoryLoaded,
      error: 'Recipe not found in catalog',
    }
  }

  const listItem = toListItem(item)
  const tree = buildTreeNode(item.name, item.uniqueName, 1, item.components, 0, new Set())
  const bucket = new Map<string, FoundryTotalLine>()
  const ownedFinished = ownedCountFor(item.uniqueName)
  const craftsNeeded = ownedFinished > 0 ? 0 : 1
  if (craftsNeeded > 0) {
    accumulateTotals(item.components, craftsNeeded, 0, new Set([item.uniqueName]), bucket)
  }

  const totals = [...bucket.values()].sort((a, b) => a.name.localeCompare(b.name))
  return {
    item: listItem,
    tree,
    totals,
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
