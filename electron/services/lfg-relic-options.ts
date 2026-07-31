/**
 * Lightweight relic name list for LFG typeahead (no planner enrichment / prices).
 */
import { peekInventoryIndex } from './inventory'
import { ensureRelicCatalog, listIntactRelics } from './relic-catalog'
import { buildOwnedRelicByKey } from './set-farm'

export type LfgRelicOptionRow = {
  id: string
  label: string
  value: string
  detail: string
  owned: number
}

let cache: LfgRelicOptionRow[] | null = null
let cacheOwnedSig = ''

function ownedSignature(ownedByKey: Map<string, number>): string {
  let n = 0
  let sum = 0
  for (const v of ownedByKey.values()) {
    if (v > 0) {
      n++
      sum += v
    }
  }
  return `${n}:${sum}`
}

export async function getLfgRelicOptions(): Promise<LfgRelicOptionRow[]> {
  await ensureRelicCatalog()
  const index = peekInventoryIndex()
  const ownedByKey = buildOwnedRelicByKey(index)
  const sig = ownedSignature(ownedByKey)
  if (cache && cacheOwnedSig === sig) return cache

  const rows: LfgRelicOptionRow[] = listIntactRelics().map((e) => {
    const owned = ownedByKey.get(e.key) || 0
    return {
      id: e.key,
      label: e.name || e.key,
      value: e.name || e.key,
      detail: [e.tier, e.vaulted ? 'vaulted' : null, owned > 0 ? `owned ×${owned}` : null]
        .filter(Boolean)
        .join(' · '),
      owned,
    }
  })
  rows.sort((a, b) => {
    const ao = a.owned > 0 ? 0 : 1
    const bo = b.owned > 0 ? 0 : 1
    if (ao !== bo) return ao - bo
    return a.label.localeCompare(b.label)
  })
  cache = rows
  cacheOwnedSig = sig
  return rows
}

export function clearLfgRelicOptionsCache() {
  cache = null
  cacheOwnedSig = ''
}
