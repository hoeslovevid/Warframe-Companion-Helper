import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { RivenScanState } from '../../shared/types'
import { recognizeRivenBlocks, warmupOcr } from './ocr'
import { parseRivenOcr, recommendRolls } from './riven-grader'
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
      await new Promise((r) => setTimeout(r, 1400))
    }

    const capture = await captureRivenCompare()
    if (!capture || capture.crops.length < 2) {
      throw new Error(
        'Could not capture riven cards. Use Borderless Windowed (Linux/Proton: X11 or XWayland).',
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

    // Keep debug frames when a side looks incomplete (typical riven has 3–4 lines).
    if (!leftOk || !rightOk || left.stats.length < 3 || right.stats.length < 3) {
      saveRivenDebugCrops(crops, 'weak', capture.fullPng)
    }

    // Retry once after a short beat — UI may still be animating.
    if ((!leftOk || !rightOk) && trigger === 'log') {
      await new Promise((r) => setTimeout(r, 900))
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
        if (!leftOk || !rightOk) saveRivenDebugCrops(retry.crops, 'retry', retry.fullPng)
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

    // If only one side parsed, keep prior current when available
    const current = leftOk ? left : state.current
    const reroll = rightOk ? right : leftOk && !rightOk ? null : right

    if (current) {
      // Prefer shared weapon name
      if (reroll && (!reroll.weapon || reroll.weapon === 'Unknown Riven')) {
        reroll.weapon = current.weapon
      }
      if (current.weapon === 'Unknown Riven' && reroll?.weapon) {
        current.weapon = reroll.weapon
      }
    }

    const recommendation = recommendRolls(current, reroll)

    state = {
      active: true,
      scanning: false,
      scannedAt: new Date().toISOString(),
      trigger,
      error: null,
      current,
      reroll,
      recommendation,
    }
    emit()
    scheduleHide(AUTO_HIDE_MS)
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
