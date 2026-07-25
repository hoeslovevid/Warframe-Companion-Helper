/** Shared screen-fraction geometry for OCR crops and overlay placement. */

export type CaptureRegion = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Left = current roll, right = reroll — full Kuva Cycle diamond cards.
 *
 * Tuned from 2560×1440 debug crops: pair sits right-of-center with a narrow gap.
 * The selected (left) card is larger in-game, so it needs a taller crop — the
 * third stat line (e.g. Critical Damage) was being clipped at the bottom.
 */
export function rivenCompareRegions(width: number, height: number): CaptureRegion[] {
  const gap = Math.round(width * 0.014)
  const startX = Math.round(width * 0.375)
  const y = Math.round(height * 0.135)

  // Current / selected card is rendered larger than the reroll card.
  const leftW = Math.round(width * 0.215)
  const leftH = Math.round(height * 0.68)
  const rightW = Math.round(width * 0.195)
  const rightH = Math.round(height * 0.62)
  const rightY = y + Math.round(height * 0.035)

  return [
    { x: startX, y, width: leftW, height: leftH },
    { x: startX + leftW + gap, y: rightY, width: rightW, height: rightH },
  ]
}

/** Lower portion of a card crop — where rolled stats usually sit. */
export function rivenCardStatsRegion(card: CaptureRegion): CaptureRegion {
  const topSkip = Math.round(card.height * 0.28)
  return {
    x: card.x + Math.round(card.width * 0.08),
    y: card.y + topSkip,
    width: Math.round(card.width * 0.84),
    height: Math.round(card.height * 0.62),
  }
}

/** Place the grader panel just to the right of the in-game compare cards. */
export function defaultRivenAnchor(
  width: number,
  height: number,
  panelWidth = 360,
): { x: number; y: number } {
  const regions = rivenCompareRegions(width, height)
  const right = regions[1]
  const pad = Math.round(width * 0.012)
  const x = Math.max(0, Math.min(width - panelWidth, right.x + right.width + pad))
  const y = Math.max(0, right.y)
  return { x, y }
}
