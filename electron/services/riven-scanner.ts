import { RivenScanState } from '../../shared/types'
import { recognizeRivenBlocks, warmupOcr } from './ocr'
import { parseRivenOcr, recommendRolls } from './riven-grader'
import { captureRivenComparePngs } from './screen-capture'

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

  state = {
    ...state,
    scanning: true,
    active: true,
    trigger,
    error: null,
  }
  emit()

  try {
    if (trigger === 'log') {
      await new Promise((r) => setTimeout(r, 900))
    }

    const crops = await captureRivenComparePngs()
    if (crops.length < 2) {
      throw new Error('Could not capture riven cards. Use Borderless on a captured display.')
    }

    const texts = await recognizeRivenBlocks(crops)
    const left = parseRivenOcr(texts[0] || '', 'current')
    const right = parseRivenOcr(texts[1] || '', 'reroll')

    const leftOk = left.stats.length > 0
    const rightOk = right.stats.length > 0
    if (!leftOk && !rightOk) {
      throw new Error(
        'No riven stats read. Open the Cycle compare screen (current vs new), then scan again.',
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
