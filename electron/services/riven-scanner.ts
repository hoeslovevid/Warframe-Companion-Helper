import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { RivenScanState } from '../../shared/types'
import { recognizeRivenBlocks, warmupOcr } from './ocr'
import { parseRivenOcr, recommendRolls } from './riven-grader'
import { enrichRivensWithMarket } from './riven-market'
import { captureRivenCompare } from './screen-capture'

function saveRivenDebugCrops(crops: Buffer[], label: string, fullPng?: Buffer) {
  try {
    const dir = path.join(app.getPath('userData'), 'riven-debug')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    crops.forEach((buf, i) => {
      const side = i === 0 ? 'current' : 'reroll'
      const file = path.join(dir, `${stamp}-${label}-${side}.png`)
      fs.writeFileSync(file, buf)
    })
    if (fullPng?.length) {
      fs.writeFileSync(path.join(dir, `${stamp}-${label}-full.png`), fullPng)
    }
    console.info(`[Everything Warframe] Saved riven debug crops → ${dir}`)
  } catch (err) {
    console.warn('[Everything Warframe] Could not save riven debug crops', err)
  }
}

type Listener = (state: RivenScanState) => void

const listeners = new Set<Listener>()
const AUTO_HIDE_MS = 90_000
const AUTO_HIDE_ERROR_MS = 15_000

let hideTimer: NodeJS.Timeout | null = null

let state: RivenScanState = {
  active: false,
  scanning: false,
  scannedAt: '',
  trigger: 'none',
  error: null,
  current: null,
  reroll: null,
  recommendation: 'none',
  recommendationNote: null,
}

function emit() {
  for (const cb of listeners) cb(state)
}

function cancelHide() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleHide(ms: number) {
  cancelHide()
  hideTimer = setTimeout(() => {
    hideTimer = null
    clearRivenScan()
  }, ms)
}

export function getRivenScanState(): RivenScanState {
  return state
}

export function onRivenScanUpdated(cb: Listener) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function clearRivenScan(): RivenScanState {
  cancelHide()
  state = {
    active: false,
    scanning: false,
    scannedAt: '',
    trigger: 'none',
    error: null,
    current: null,
    reroll: null,
    recommendation: 'none',
    recommendationNote: null,
  }
  emit()
  return state
}

export async function warmupRivenScanner(): Promise<void> {
  await warmupOcr().catch(() => {})
}

export async function scanRivens(trigger: 'manual' | 'log' = 'manual'): Promise<RivenScanState> {
  if (state.scanning) return state
  cancelHide()

  // Hide prior results during capture so OCR cannot read our grader panel.
  // (Overlay is also content-protected + moved off-screen in screen-capture.)
  state = {
    ...state,
    scanning: true,
    active: false,
    trigger,
    error: null,
  }
  emit()
  // Let the renderer drop the panel before we snapshot.
  await new Promise((r) => setTimeout(r, 80))

  try {
    if (trigger === 'log') {
      // Compare UI animates in after kuva confirm / PleaseWait.
      // Proton/DXVK first paint is slower — wait longer on Linux.
      const animDelay = process.platform === 'linux' ? 2200 : 1400
      await new Promise((r) => setTimeout(r, animDelay))
    }

    const capture = await captureRivenCompare()
    if (!capture || capture.crops.length < 2) {
      throw new Error(
        process.platform === 'linux'
          ? 'Could not capture riven cards. Allow the screen-share dialog once and leave it on, then scan again (Borderless Windowed).'
          : 'Could not capture riven cards. Use Borderless Windowed, then scan again.',
      )
    }
    let crops = capture.crops

    let texts = await recognizeRivenBlocks(crops)
    console.info(
      '[Everything Warframe] Riven OCR current:\n' + (texts[0] || '(empty)').slice(0, 400),
    )
    console.info(
      '[Everything Warframe] Riven OCR reroll:\n' + (texts[1] || '(empty)').slice(0, 400),
    )
    let left = parseRivenOcr(texts[0] || '', 'current')
    let right = parseRivenOcr(texts[1] || '', 'reroll')
    let leftOk = left.stats.length > 0
    let rightOk = right.stats.length > 0
    console.info(
      `[Everything Warframe] Riven parse: current=${left.stats.length} stats (${left.weapon}), ` +
        `reroll=${right.stats.length} stats (${right.weapon})` +
        (left.stats.length
          ? ` | current=[${left.stats.map((s) => `${s.value < 0 || s.negative ? '-' : '+'}${Math.abs(s.value)}${s.unit === '%' ? '%' : ''} ${s.name}`).join('; ')}]`
          : '') +
        (right.stats.length
          ? ` | reroll=[${right.stats.map((s) => `${s.value < 0 || s.negative ? '-' : '+'}${Math.abs(s.value)}${s.unit === '%' ? '%' : ''} ${s.name}`).join('; ')}]`
          : ''),
    )

    const weakRead =
      !leftOk || !rightOk || left.stats.length < 3 || right.stats.length < 3
    if (weakRead) {
      saveRivenDebugCrops(crops, 'weak', capture.fullPng)
    }

    // Retry on empty OR partial reads (1–2 stats) — common when UI is still animating.
    if (weakRead) {
      const retryDelay = process.platform === 'linux' ? 1100 : 900
      await new Promise((r) => setTimeout(r, retryDelay))
      const retry = await captureRivenCompare()
      if (retry && retry.crops.length >= 2) {
        const retryTexts = await recognizeRivenBlocks(retry.crops)
        console.info(
          '[Everything Warframe] Riven OCR retry current:\n' +
            (retryTexts[0] || '(empty)').slice(0, 400),
        )
        console.info(
          '[Everything Warframe] Riven OCR retry reroll:\n' +
            (retryTexts[1] || '(empty)').slice(0, 400),
        )
        const retryLeft = parseRivenOcr(retryTexts[0] || '', 'current')
        const retryRight = parseRivenOcr(retryTexts[1] || '', 'reroll')
        if (retryLeft.stats.length >= left.stats.length) left = retryLeft
        if (retryRight.stats.length >= right.stats.length) right = retryRight
        leftOk = left.stats.length > 0
        rightOk = right.stats.length > 0
        texts = retryTexts
        crops = retry.crops
        if (!leftOk || !rightOk || left.stats.length < 3 || right.stats.length < 3) {
          saveRivenDebugCrops(retry.crops, 'retry', retry.fullPng)
        }
      }
    }

    if (!leftOk && !rightOk) {
      const sample = [texts[0], texts[1]].filter(Boolean).join(' | ').slice(0, 120)
      throw new Error(
        sample
          ? `No riven stats read (OCR: ${sample}). Open the Cycle compare screen, then scan again.`
          : 'No riven stats read. Open the Cycle compare screen (current vs new), then scan again.',
      )
    }

    // Left crop = current, right crop = reroll (Kuva Cycle layout).
    const current = leftOk ? left : state.current
    const reroll = rightOk ? right : leftOk && !rightOk ? null : right

    if (current && reroll) {
      // Only share the gun base name — never copy Latin riven titles across sides.
      const baseOf = (weapon: string) =>
        weapon.replace(/\s+[A-Za-z]{3,}-[a-z]{3,}\s*$/i, '').trim()
      if (current.weapon === 'Unknown Riven') {
        const base = baseOf(reroll.weapon)
        if (base && base !== 'Unknown Riven') current.weapon = base
      }
      if (reroll.weapon === 'Unknown Riven') {
        const base = baseOf(current.weapon)
        if (base && base !== 'Unknown Riven') reroll.weapon = base
      }
    }

    // Market is optional — show grades first, then refresh with plat estimates.
    const scannedAt = new Date().toISOString()
    const reco = recommendRolls(current, reroll)
    state = {
      active: true,
      scanning: false,
      scannedAt,
      trigger,
      error: null,
      current,
      reroll,
      recommendation: reco.recommendation,
      recommendationNote: reco.note,
    }
    emit()
    scheduleHide(AUTO_HIDE_MS)

    try {
      const priced = await enrichRivensWithMarket(current, reroll)
      if (state.scannedAt === scannedAt && state.active && !state.scanning) {
        const pricedReco = recommendRolls(priced.current, priced.reroll)
        state = {
          ...state,
          current: priced.current,
          reroll: priced.reroll,
          recommendation: pricedReco.recommendation,
          recommendationNote: pricedReco.note,
        }
        emit()
      }
    } catch (err) {
      console.warn('[Everything Warframe] Riven market enrich failed', err)
    }

    return state
  } catch (err) {
    state = {
      ...state,
      scanning: false,
      active: true,
      error: err instanceof Error ? err.message : 'Riven scan failed',
    }
    emit()
    scheduleHide(AUTO_HIDE_ERROR_MS)
    return state
  }
}
