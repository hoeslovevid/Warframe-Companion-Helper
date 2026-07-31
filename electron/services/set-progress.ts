/**
 * Prime set completion overview for the Sets hub (Aleca-style progress).
 */
import type { SetProgressRow, SetProgressResult } from '../../shared/types'
import { ownedCountFor, peekInventoryIndex } from './inventory'
import { ensureRecipeCatalog, getRecipeItems } from './recipe-catalog'

function partOwned(uniqueName: string, index: Record<string, number>): number {
  return ownedCountFor(uniqueName, index)
}

export async function listSetProgress(opts?: {
  search?: string
  /** @deprecated Prefer `completion`. When true (default if completion unset), hide complete sets. */
  incompleteOnly?: boolean
  /** incomplete = missing parts, complete = finished sets, all = both */
  completion?: 'incomplete' | 'complete' | 'all'
  limit?: number
}): Promise<SetProgressResult> {
  try {
    await ensureRecipeCatalog()
  } catch (err) {
    return {
      rows: [],
      inventoryLoaded: false,
      error: err instanceof Error ? err.message : 'Failed to load recipes',
    }
  }

  const index = peekInventoryIndex()
  const inventoryLoaded = Object.keys(index).length > 0
  const search = String(opts?.search || '')
    .trim()
    .toLowerCase()
  const completion: 'incomplete' | 'complete' | 'all' =
    opts?.completion === 'complete' || opts?.completion === 'all' || opts?.completion === 'incomplete'
      ? opts.completion
      : opts?.incompleteOnly === false
        ? 'all'
        : 'incomplete'
  const limit = Math.min(Math.max(Number(opts?.limit) || 200, 1), 500)

  const rows: SetProgressRow[] = []
  for (const item of getRecipeItems()) {
    if (!item.isPrime || !item.components.length) continue
    if (search && !item.name.toLowerCase().includes(search)) continue

    const parts = item.components.map((c) => {
      const owned = partOwned(c.uniqueName, index)
      return {
        name: c.name,
        uniqueName: c.uniqueName,
        owned,
        needed: owned <= 0,
      }
    })
    const ownedParts = parts.filter((p) => !p.needed).length
    const totalParts = parts.length
    const missingParts = totalParts - ownedParts
    const complete = missingParts <= 0
    if (completion === 'incomplete' && complete) continue
    if (completion === 'complete' && !complete) continue

    rows.push({
      uniqueName: item.uniqueName,
      name: item.name,
      category: item.category,
      vaulted: item.vaulted,
      ownedParts,
      totalParts,
      missingParts,
      complete,
      percent: totalParts ? Math.round((ownedParts / totalParts) * 100) : 0,
      parts,
    })
  }

  rows.sort((a, b) => {
    if (completion === 'all' && a.complete !== b.complete) return a.complete ? 1 : -1
    if (completion === 'complete') {
      if (a.name !== b.name) return a.name.localeCompare(b.name)
      return 0
    }
    if (b.percent !== a.percent) return b.percent - a.percent
    return a.name.localeCompare(b.name)
  })

  return {
    rows: rows.slice(0, limit),
    inventoryLoaded,
    error: null,
  }
}
