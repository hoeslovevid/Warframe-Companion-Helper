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
 * Tuned for multi-monitor / varied aspect ratios. Crops are slightly wider than
 * the diamond art so edge-hugging values like `x1.64` stay inside the frame.
 */
export function rivenCompareRegions(width: number, height: number): CaptureRegion[] {
  const gap = Math.round(width * 0.01)
  // Slightly earlier / wider so edge-hugging "x1.64" multipliers stay in-frame.
  const startX = Math.round(width * 0.348)
  const y = Math.round(height * 0.12)

  // Current / selected card is rendered larger than the reroll card.
  const leftW = Math.round(width * 0.24)
  const leftH = Math.round(height * 0.7)
  const rightW = Math.round(width * 0.22)
  const rightH = Math.round(height * 0.64)
  const rightY = y + Math.round(height * 0.03)

  return [
    { x: startX, y, width: leftW, height: leftH },
    { x: startX + leftW + gap, y: rightY, width: rightW, height: rightH },
  ]
}

/** Lower portion of a card crop — where rolled stats usually sit. */
export function rivenCardStatsRegion(card: CaptureRegion): CaptureRegion {
  const topSkip = Math.round(card.height * 0.26)
  return {
    x: card.x + Math.round(card.width * 0.03),
    y: card.y + topSkip,
    width: Math.round(card.width * 0.94),
    height: Math.round(card.height * 0.66),
  }
}

/**
 * Horizontal grader strip spanning both Cycle cards (like the relic strip).
 * Anchored just above the in-game current/reroll diamonds.
 */
export function rivenStripLayout(width: number, height: number) {
  const regions = rivenCompareRegions(width, height)
  const left = regions[0]
  const right = regions[1]
  const x = left.x
  const stripWidth = right.x + right.width - left.x
  // Compact horizontal cards are ~18–22% of screen height; sit just above the diamonds.
  const stripH = Math.round(Math.min(height * 0.2, 220))
  const gap = Math.round(height * 0.01)
  const y = Math.max(8, left.y - stripH - gap)
  return {
    x,
    y,
    width: stripWidth,
    height: stripH,
  }
}

/** Place the grader strip above the in-game compare cards. */
export function defaultRivenAnchor(
  width: number,
  height: number,
): { x: number; y: number } {
  const layout = rivenStripLayout(width, height)
  return { x: layout.x, y: layout.y }
}

/**
 * Four reward-name bands on a typical fissure pick screen.
 * Geometry follows WFInfo / wfinfo-ng PIXEL_REWARD_* constants (scaled to
 * 1920×1080 reference), which targets the name line under item art.
 */
export function relicRewardRegions(
  width: number,
  height: number,
  slots: 3 | 4 = 4,
): CaptureRegion[] {
  const screenScaling = width * 9 > height * 16 ? height / 1080 : width / 1920
  // WFInfo: PIXEL_REWARD_WIDTH=968, HEIGHT=235, YDISPLAY=316, LINE_HEIGHT=48
  const mostWidth = 968 * screenScaling
  const lineHeight = 48 * screenScaling
  const mostTop =
    height / 2 -
    (316 - 235 + 48) * screenScaling
  // Name band ≈ lower third of the reward box (below art).
  const y = mostTop + (235 * screenScaling - lineHeight * 1.35)
  const h = lineHeight * 2.2
  const cardW = mostWidth / slots
  const startX = width / 2 - mostWidth / 2

  return Array.from({ length: slots }, (_, i) => ({
    x: Math.round(startX + i * cardW),
    y: Math.max(0, Math.round(y)),
    width: Math.round(cardW),
    height: Math.round(h),
  }))
}

/**
 * Per-slot vertical variants so UI scale / resolution still hits the name line.
 * Order: slightly above, primary, slightly below.
 */
export function relicRewardRegionVariants(
  width: number,
  height: number,
  slots: 3 | 4 = 4,
): CaptureRegion[][] {
  const primary = relicRewardRegions(width, height, slots)
  const deltas = [-0.04, 0, 0.035]
  const bandH = Math.round(height * 0.12)
  return primary.map((base) =>
    deltas.map((dy) => ({
      x: base.x,
      y: Math.max(0, Math.min(height - bandH, Math.round(base.y + height * dy))),
      width: base.width,
      height: bandH,
    })),
  )
}

/** Strip geometry as fractions of display size (for overlay alignment). */
export function relicStripLayout(width: number, height: number) {
  const regions = relicRewardRegions(width, height)
  const left = regions[0]?.x ?? 0
  const right = (regions[3]?.x ?? 0) + (regions[3]?.width ?? 0)
  const ocrBottom = regions[0] ? regions[0].y + regions[0].height : Math.round(height * 0.63)
  return {
    x: left,
    y: Math.min(height - 80, ocrBottom + Math.round(height * 0.02)),
    width: right - left,
    gap: regions.length > 1 ? regions[1].x - (regions[0].x + regions[0].width) : 0,
    cardWidth: regions[0]?.width ?? Math.round(width * 0.17),
  }
}

export function defaultRelicAnchor(
  width: number,
  height: number,
): { x: number; y: number } {
  const layout = relicStripLayout(width, height)
  return { x: layout.x, y: layout.y }
}
