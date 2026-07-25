import { RelicScanState, RewardEval, SetPartOwned } from '../../shared/types'
import { getInventoryIndex } from './inventory'
import { ensureItemCatalog, getSetParts, matchCatalogItem } from './item-catalog'
import { lookupMarketPrices } from './market-prices'
import { recognizeRewardNames, warmupOcr } from './ocr'
import { captureRewardRegionPngs } from './screen-capture'

type Listener = (state: RelicScanState) => void

const listeners = new Set<Listener>()

const AUTO_HIDE_SUCCESS_MS = 45_000
const AUTO_HIDE_ERROR_MS = 12_000

let hideTimer: NodeJS.Timeout | null = null

let state: RelicScanState = {
  active: false,
  scanning: false,
  scannedAt: '',
  trigger: 'none',
  error: null,
  rewards: [],
  inventoryLoaded: false,
  celebration: false,
}

function emit() {
  for (const cb of listeners) cb(state)
}

function cancelAutoHide() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleAutoHide(ms: number) {
  cancelAutoHide()
  hideTimer = setTimeout(() => {
    hideTimer = null
    clearRelicScan()
  }, ms)
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

function pickBest(rewards: RewardEval[]): RewardEval[] {
  let bestIdx = -1
  let bestScore = -1
  rewards.forEach((r, i) => {
    let score = 0
    if (r.needed) score += 1000
    if (r.platinum != null) score += r.platinum * 2
    if (r.ducats != null) score += r.ducats * 0.1
    if (r.matchScore >= 0.7) score += 20
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  })
  return rewards.map((r, i) => ({ ...r, bestPick: i === bestIdx && bestScore > 0 }))
}

export function getRelicScanState(): RelicScanState {
  return state
}

export function onRelicScanUpdated(cb: Listener) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function clearRelicScan(): RelicScanState {
  cancelAutoHide()
  state = {
    active: false,
    scanning: false,
    scannedAt: '',
    trigger: 'none',
    error: null,
    rewards: [],
    inventoryLoaded: Object.keys(getInventoryIndex()).length > 0,
    celebration: false,
  }
  emit()
  return state
}

export function ackRelicCelebration(): RelicScanState {
  if (!state.celebration) return state
  state = { ...state, celebration: false }
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

  cancelAutoHide()

  state = {
    ...state,
    scanning: true,
    active: true,
    trigger,
    error: null,
    celebration: false,
    inventoryLoaded: Object.keys(getInventoryIndex()).length > 0,
  }
  emit()

  try {
    await ensureItemCatalog()
    if (trigger === 'log') {
      await new Promise((r) => setTimeout(r, 1200))
    }

    const crops = await captureRewardRegionPngs()
    if (crops.length < 4) {
      throw new Error(
        'Could not capture the reward screen. Is Warframe borderless on a captured display?',
      )
    }

    const ocrNames = await recognizeRewardNames(crops)
    let rewards: RewardEval[] = ocrNames.map((ocrText, slot) => {
      const matched = matchCatalogItem(ocrText)
      const name = matched?.item.name || ocrText || `Reward ${slot + 1}`
      const uniqueName = matched?.item.uniqueName || null
      const setName = matched?.item.setName || null
      const partName = matched?.item.partName || null
      const owned = ownedCount(uniqueName, name)
      const { setParts, setOwnedParts, setTotalParts } = buildSetParts(setName)
      const matchScore = matched?.score ?? 0

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
        matchScore,
        ducats: matched?.item.ducats ?? null,
        platinum: null,
        volume: null,
        bestPick: false,
      }
    })

    const useful = rewards.some(
      (r) => (r.ocrText.trim().length > 1 && r.matchScore >= 0.35) || r.matchScore >= 0.55,
    )
    if (!useful) {
      throw new Error('No reward names detected. Open the fissure pick screen, then scan again.')
    }

    // Soft-confidence: keep low-confidence names but flag via matchScore in UI
    try {
      const prices = await lookupMarketPrices(rewards.map((r) => r.name))
      rewards = rewards.map((r) => {
        const hit = prices.get(r.name)
        return hit
          ? { ...r, platinum: hit.platinum, volume: hit.volume }
          : r
      })
    } catch {
      // market optional
    }

    rewards = pickBest(rewards)

    state = {
      active: true,
      scanning: false,
      scannedAt: new Date().toISOString(),
      trigger,
      error: null,
      rewards,
      inventoryLoaded: Object.keys(getInventoryIndex()).length > 0,
      celebration: true,
    }
    emit()
    scheduleAutoHide(AUTO_HIDE_SUCCESS_MS)
    return state
  } catch (err) {
    state = {
      ...state,
      scanning: false,
      active: true,
      celebration: false,
      error: err instanceof Error ? err.message : 'Relic scan failed',
    }
    emit()
    scheduleAutoHide(AUTO_HIDE_ERROR_MS)
    return state
  }
}
