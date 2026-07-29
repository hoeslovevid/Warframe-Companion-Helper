import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { RelicScanState, RewardEval, SetPartOwned } from '../../shared/types'
import { getInventoryIndex, ownedCountForReward } from './inventory'
import { ensureItemCatalog, getSetParts, matchCatalogItem } from './item-catalog'
import { lookupMarketPrices } from './market-prices'
import { recognizeRewardNames, warmupOcr } from './ocr'
import { captureRewardRegionVariants, cropRelicBandsFromPng } from './screen-capture'
import { detectRewardPlayerCount, detectUiTheme, type WfThemeId } from './wfinfo-theme'
import { ensureWfinfoPrices, lookupWfinfoPrices } from './wfinfo-prices'
import { loadSettings } from '../settings'

function cleanRelicOcr(ocrText: string): string {
  return ocrText
    .replace(/\b(OWNED|CRAFTED|UNRANKED|STEEL|PATH|BONUS|ESSENCE)\b/gi, '')
    .replace(/\b\d+\s*Owned\b/gi, '')
    .replace(/\bForma\b(?!\s+Blueprint)/gi, 'Forma Blueprint')
    .replace(/\bBlueprint\b/gi, 'Blueprint')
    .replace(/[^A-Za-z0-9 '&-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function saveRelicDebugCrops(bands: Buffer[][], label: string, fullPng?: Buffer) {
  try {
    const dir = path.join(app.getPath('userData'), 'relic-debug')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    bands.forEach((slotBands, slot) => {
      slotBands.forEach((buf, band) => {
        fs.writeFileSync(path.join(dir, `${stamp}-${label}-s${slot}-b${band}.png`), buf)
      })
    })
    if (fullPng?.length) {
      fs.writeFileSync(path.join(dir, `${stamp}-${label}-full.png`), fullPng)
    }
    console.info(`[Everything Warframe] Saved relic debug crops → ${dir}`)
  } catch (err) {
    console.warn('[Everything Warframe] Could not save relic debug crops', err)
  }
}

/** Pick the OCR string that best matches the item catalog (or longest fallback). */
async function bestOcrForSlot(bandCrops: Buffer[], theme: WfThemeId | null): Promise<string> {
  if (!bandCrops.length) return ''
  const texts = await recognizeRewardNames(bandCrops, theme)
  let best = ''
  let bestScore = -1
  for (const raw of texts) {
    const cleaned = cleanRelicOcr(raw)
    if (!cleaned) continue
    const matched = matchCatalogItem(cleaned)
    const score =
      matched?.score ??
      (cleaned.length >= 8 && /prime|blueprint|systems|chassis|neuro|barrel|receiver|blade|stock|link|grip|handle|string|hilt/i.test(cleaned)
        ? 0.35
        : cleaned.length > 4
          ? 0.12
          : 0)
    if (score > bestScore || (score === bestScore && cleaned.length > best.length)) {
      bestScore = score
      best = cleaned
    }
  }
  return best
}

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
  squadSize: null,
}

/** Optional EE.log squad-size hint supplied by main before a log-triggered scan. */
let pendingSquadSize: number | null = null

export function setRelicSquadSizeHint(size: number | null) {
  pendingSquadSize =
    size != null && size >= 1 && size <= 4 ? Math.round(size) : null
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
  return ownedCountForReward(uniqueName, displayName)
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
  pendingSquadSize = null
  state = {
    active: false,
    scanning: false,
    scannedAt: '',
    trigger: 'none',
    error: null,
    rewards: [],
    inventoryLoaded: Object.keys(getInventoryIndex()).length > 0,
    celebration: false,
    squadSize: null,
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
  await Promise.all([
    ensureItemCatalog(),
    ensureWfinfoPrices().catch(() => {}),
    warmupOcr().catch(() => {}),
  ])
}

export async function scanRelicRewards(
  trigger: 'manual' | 'log' = 'manual',
): Promise<RelicScanState> {
  if (state.scanning) return state

  cancelAutoHide()

  const squadSize = pendingSquadSize
  state = {
    ...state,
    scanning: true,
    active: true,
    trigger,
    error: null,
    celebration: false,
    inventoryLoaded: Object.keys(getInventoryIndex()).length > 0,
    squadSize,
  }
  emit()

  try {
    await Promise.all([ensureItemCatalog(), ensureWfinfoPrices().catch(() => {})])
    if (trigger === 'log') {
      // Wine/Proton often buffers EE.log; UI may still be animating after the marker.
      const delay = process.platform === 'linux' ? 1800 : 1200
      await new Promise((r) => setTimeout(r, delay))
    }

    const buildRewards = async (
      saveDebugOnWeak = false,
    ): Promise<RewardEval[]> => {
      const capture = await captureRewardRegionVariants()
      if (!capture || capture.bands.length < 4) {
        throw new Error(
          process.platform === 'linux'
            ? 'Could not capture the reward screen. Allow screen share once and use Borderless Windowed.'
            : 'Could not capture the reward screen. Is Warframe borderless on the selected OCR monitor?',
        )
      }

      // WFInfo-style: theme override or auto-detect, then isolate text.
      const settings = loadSettings()
      const theme: WfThemeId =
        settings.wfThemeOverride ?? detectUiTheme(capture.fullPng)
      console.info(`[Everything Warframe] Relic UI theme ≈ ${theme}`)

      // Squad size: settings override → EE.log hint → image cosine detect.
      let slotHint =
        settings.relicSquadSizeOverride ??
        squadSize ??
        detectRewardPlayerCount(capture.fullPng, theme)
      if (slotHint !== 3 && slotHint !== 4) slotHint = 4
      console.info(`[Everything Warframe] Relic slot count hint ≈ ${slotHint}`)

      // Re-crop for 3-player reward layouts (same strip width, 3 cards).
      const bands =
        slotHint === 3
          ? cropRelicBandsFromPng(capture.fullPng, capture.width, capture.height, 3)
          : capture.bands

      const ocrNames: string[] = []
      for (let slot = 0; slot < bands.length; slot++) {
        const best = await bestOcrForSlot(bands[slot], theme)
        ocrNames.push(best)
        console.info(
          `[Everything Warframe] Relic OCR slot ${slot}: ${best || '(empty)'}`,
        )
      }

      let next: RewardEval[] = ocrNames.map((cleaned, slot) => {
        const matched = matchCatalogItem(cleaned)
        const name = matched?.item.name || cleaned || `Reward ${slot + 1}`
        const uniqueName = matched?.item.uniqueName || null
        const setName = matched?.item.setName || null
        const partName = matched?.item.partName || null
        const owned = ownedCount(uniqueName, name)
        const { setParts, setOwnedParts, setTotalParts } = buildSetParts(setName)
        const matchScore = matched?.score ?? (cleaned.length > 2 ? 0.2 : 0)

        return {
          slot,
          ocrText: cleaned,
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
          vaulted: matched?.item.vaulted ?? null,
        }
      })

      // Drop garbage OCR (e.g. "HHI", "dit") — require a real catalog hit or a
      // long prime-part-shaped string. Short unmatched blobs used to pollute the strip.
      next = next.filter(
        (r) =>
          r.matchScore >= 0.42 ||
          /^forma(\s+blueprint)?$/i.test(r.ocrText.trim()) ||
          (r.ocrText.trim().length >= 10 &&
            /prime|blueprint|systems|chassis|neuro|barrel|receiver|blade|stock|grip|hilt|link|string/i.test(
              r.ocrText,
            )),
      )

      if (saveDebugOnWeak && next.every((r) => r.matchScore < 0.45)) {
        saveRelicDebugCrops(bands, 'weak', capture.fullPng)
      }

      // Prefer image/settings squad hint when EE.log didn't supply one.
      const trimTo = settings.relicSquadSizeOverride ?? squadSize ?? slotHint
      if (trimTo != null && next.length > trimTo) {
        const strong = next.filter((r) => r.matchScore >= 0.45)
        const keep = strong.length >= trimTo ? strong : next
        next = [...keep]
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, trimTo)
          .sort((a, b) => a.slot - b.slot)
          .map((r, i) => ({ ...r, slot: i }))
      }
      return next
    }

    let rewards = await buildRewards(false)
    // Catalog match required — length alone is not "useful" (junk like "449-e").
    let useful = rewards.some((r) => r.matchScore >= 0.45)

    // Proton log flush / UI paint can lag — one retry when the first pass is empty.
    if (!useful) {
      console.info('[Everything Warframe] Relic OCR weak — retrying capture…')
      await new Promise((r) => setTimeout(r, process.platform === 'linux' ? 1400 : 1000))
      rewards = await buildRewards(true)
      useful = rewards.some((r) => r.matchScore >= 0.45)
    }

    if (!useful) {
      const multi =
        process.platform === 'linux'
          ? ' On multi-monitor Linux, set Settings → Game/OCR monitor to the screen Warframe is on, and pick that same screen in the screen-share dialog.'
          : ' If you use multiple monitors, set Settings → Game/OCR monitor to Warframe’s screen.'
      throw new Error(
        'No reward names detected. Open the fissure pick screen, then scan again.' + multi,
      )
    }

    // Local WFInfo price DB first (instant) — live warframe.market only fills gaps.
    try {
      const local = lookupWfinfoPrices(rewards.map((r) => r.name))
      rewards = rewards.map((r) => {
        const hit = local.get(r.name)
        return hit ? { ...r, platinum: hit.platinum, volume: hit.volume } : r
      })
      const missing = rewards.filter((r) => r.platinum == null).map((r) => r.name)
      if (missing.length) {
        const live = await lookupMarketPrices(missing)
        rewards = rewards.map((r) => {
          if (r.platinum != null) return r
          const hit = live.get(r.name)
          return hit ? { ...r, platinum: hit.platinum, volume: hit.volume } : r
        })
      }
    } catch {
      // pricing optional
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
      squadSize,
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
