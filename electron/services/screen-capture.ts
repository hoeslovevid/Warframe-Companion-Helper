import { desktopCapturer, nativeImage, screen } from 'electron'

export type CaptureRegion = {
  x: number
  y: number
  width: number
  height: number
}

/** Four horizontal reward-name bands on a typical fissure reward screen. */
export function relicRewardRegions(width: number, height: number): CaptureRegion[] {
  const slots = 4
  const cardW = width * 0.17
  const gap = width * 0.035
  const total = slots * cardW + (slots - 1) * gap
  const startX = (width - total) / 2
  const y = height * 0.4
  const h = height * 0.14

  return Array.from({ length: slots }, (_, i) => ({
    x: Math.round(startX + i * (cardW + gap)),
    y: Math.round(y),
    width: Math.round(cardW),
    height: Math.round(h),
  }))
}

export async function capturePrimaryDisplay(): Promise<{
  png: Buffer
  width: number
  height: number
} | null> {
  const display = screen.getPrimaryDisplay()
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

  // thumbnail is in physical pixels; crop math uses that size
  const img = nativeImage.createFromBuffer(png)
  const size = img.getSize()
  return { png, width: size.width, height: size.height }
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
  const shot = await capturePrimaryDisplay()
  if (!shot) return []
  const regions = relicRewardRegions(shot.width, shot.height)
  return regions.map((region) => cropPng(shot.png, region))
}
