import { RelicScanState, RewardEval, SetPartOwned } from '../../shared/types'
import { getInventoryIndex } from './inventory'
import { ensureItemCatalog, getSetParts, matchCatalogItem } from './item-catalog'
import { recognizeRewardNames, warmupOcr } from './ocr'
import { captureRewardRegionPngs } from './screen-capture'

type Listener = (state: RelicScanState) => void

const listeners = new Set<Listener>()

let state: RelicScanState = {
  active: false,
  scanning: false,
  scannedAt: '',
  trigger: 'none',
  error: null,
  rewards: [],
  inventoryLoaded: false,
}

function emit() {
  for (const cb of listeners) cb(state)
}

function ownedCount(uniqueName: string | null, displayName: string): number {
  if (!uniqueName && !displayName) return 0
  const index = getInventoryIndex()
  if (!Object.keys(index).length) return 0

  if (uniqueName) {
    if (index[uniqueName] != null) return index[uniqueName]
    const base = uniqueName.split('/').pop()
    if (base && index[base] != null) return index[base]
  }

  // Fallback: match by normalized display fragments in keys (rare)
  const upper = displayName.toUpperCase()
  for (const [key, count] of Object.entries(index)) {
    if (key.toUpperCase().includes(upper) || upper.includes(key.toUpperCase())) {
      return count
    }
  }
  return 0
}

function buildSetParts(setName: string | null): {
  setParts: SetPartOwned[]
  setOwnedParts: number
  setTotalParts: number
} {
  const parts = getSetParts(setName)
  // Prefer component rows over the full item when both exist
  const filtered = parts.filter((p) => p.partName && p.partName !== 'Item')
  const use = filtered.length ? filtered : parts
  const setParts: SetPartOwned[] = use.map((p) => ({
    partName: p.partName || p.name,
    itemName: p.name,
    owned: ownedCount(p.uniqueName, p.name),
  }))
  const setOwnedParts = setParts.filter((p) => p.owned > 0).length
  return { setParts, setOwnedParts, setTotalParts: setParts.length }
}

export function getRelicScanState(): RelicScanState {
  return state
}

export function onRelicScanUpdated(cb: Listener) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function clearRelicScan(): RelicScanState {
  state = {
    active: false,
    scanning: false,
    scannedAt: '',
    trigger: 'none',
    error: null,
    rewards: [],
    inventoryLoaded: Object.keys(getInventoryIndex()).length > 0,
  }
  emit()
  return state
}

export async function warmupRelicScanner(): Promise<void> {
  await Promise.all([ensureItemCatalog(), warmupOcr().catch(() => {})])
}

export async function scanRelicRewards(
  trigger: 'manual' | 'log' = 'manual',
): Promise<RelicScanState> {
  if (state.scanning) return state

  state = {
    ...state,
    scanning: true,
    active: true,
    trigger,
    error: null,
    inventoryLoaded: Object.keys(getInventoryIndex()).length > 0,
  }
  emit()

  try {
    await ensureItemCatalog()
    // Give the reward UI a moment to finish animating (especially on log trigger)
    if (trigger === 'log') {
      await new Promise((r) => setTimeout(r, 1200))
    }

    const crops = await captureRewardRegionPngs()
    if (crops.length < 4) {
      throw new Error('Could not capture the reward screen. Is Warframe on the primary monitor?')
    }

    const ocrNames = await recognizeRewardNames(crops)
    const rewards: RewardEval[] = ocrNames.map((ocrText, slot) => {
      const matched = matchCatalogItem(ocrText)
      const name = matched?.item.name || ocrText || `Reward ${slot + 1}`
      const uniqueName = matched?.item.uniqueName || null
      const setName = matched?.item.setName || null
      const partName = matched?.item.partName || null
      const owned = ownedCount(uniqueName, name)
      const { setParts, setOwnedParts, setTotalParts } = buildSetParts(setName)

      return {
        slot,
        ocrText,
        name,
        uniqueName,
        setName,
        partName,
        owned,
        needed: owned <= 0 && Boolean(setName),
        setOwnedParts,
        setTotalParts,
        setParts,
        matchScore: matched?.score ?? 99,
        ducats: matched?.item.ducats ?? null,
      }
    })

    state = {
      active: true,
      scanning: false,
      scannedAt: new Date().toISOString(),
      trigger,
      error: null,
      rewards,
      inventoryLoaded: Object.keys(getInventoryIndex()).length > 0,
    }
    emit()
    return state
  } catch (err) {
    state = {
      ...state,
      scanning: false,
      active: true,
      error: err instanceof Error ? err.message : 'Relic scan failed',
    }
    emit()
    return state
  }
}
