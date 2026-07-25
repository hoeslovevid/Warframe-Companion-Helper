import { desktopCapturer, nativeImage, screen } from 'electron'

export type CaptureRegion = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Four reward-name bands on a typical fissure pick screen.
 * Also used by the overlay strip to size/gap labels under cards.
 */
export function relicRewardRegions(width: number, height: number): CaptureRegion[] {
  const slots = 4
  const cardW = width * 0.155
  const gap = width * 0.028
  const total = slots * cardW + (slots - 1) * gap
  const startX = (width - total) / 2
  const y = height * 0.445
  const h = height * 0.085

  return Array.from({ length: slots }, (_, i) => ({
    x: Math.round(startX + i * (cardW + gap)),
    y: Math.round(y),
    width: Math.round(cardW),
    height: Math.round(h),
  }))
}

/** Strip geometry as fractions of display size (for overlay alignment). */
export function relicStripLayout(width: number, height: number) {
  const regions = relicRewardRegions(width, height)
  const left = regions[0]?.x ?? 0
  const right = (regions[3]?.x ?? 0) + (regions[3]?.width ?? 0)
  return {
    x: left,
    y: Math.round(height * 0.58),
    width: right - left,
    gap: regions.length > 1 ? regions[1].x - (regions[0].x + regions[0].width) : 0,
    cardWidth: regions[0]?.width ?? Math.round(width * 0.155),
  }
}

async function captureDisplay(display: Electron.Display): Promise<{
  png: Buffer
  width: number
  height: number
} | null> {
  const { width, height } = display.size
  const scale = display.scaleFactor || 1
  const thumbW = Math.round(width * scale)
  const thumbH = Math.round(height * scale)

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: thumbW, height: thumbH },
  })

  const primaryId = String(display.id)
  const source =
    sources.find((s) => s.display_id === primaryId) ||
    sources.find((s) => s.id.includes('screen')) ||
    sources[0]

  if (!source) return null
  const png = source.thumbnail.toPNG()
  if (!png?.length) return null

  const img = nativeImage.createFromBuffer(png)
  const size = img.getSize()
  return { png, width: size.width, height: size.height }
}

export async function capturePrimaryDisplay(): Promise<{
  png: Buffer
  width: number
  height: number
} | null> {
  return captureDisplay(screen.getPrimaryDisplay())
}

/** Prefer primary; if needed callers can iterate — we capture largest display as fallback. */
export async function captureBestDisplay(): Promise<{
  png: Buffer
  width: number
  height: number
} | null> {
  const displays = screen.getAllDisplays()
  const ordered = [
    screen.getPrimaryDisplay(),
    ...displays.sort((a, b) => b.size.width * b.size.height - a.size.width * a.size.height),
  ]
  const seen = new Set<number>()
  for (const d of ordered) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    const shot = await captureDisplay(d)
    if (shot) return shot
  }
  return null
}

export function cropPng(png: Buffer, region: CaptureRegion): Buffer {
  const img = nativeImage.createFromBuffer(png)
  const size = img.getSize()
  const x = Math.max(0, Math.min(region.x, size.width - 1))
  const y = Math.max(0, Math.min(region.y, size.height - 1))
  const width = Math.max(1, Math.min(region.width, size.width - x))
  const height = Math.max(1, Math.min(region.height, size.height - y))
  return img.crop({ x, y, width, height }).toPNG()
}

export async function captureRewardRegionPngs(): Promise<Buffer[]> {
  const shot = await captureBestDisplay()
  if (!shot) return []
  const regions = relicRewardRegions(shot.width, shot.height)
  return regions.map((region) => cropPng(shot.png, region))
}
