import { desktopCapturer, nativeImage, screen } from 'electron'
import { rivenCompareRegions, type CaptureRegion } from '../../shared/captureGeometry'
import {
  ensurePersistentCapture,
  grabPersistentFrame,
  isPersistentCaptureLive,
} from './persistent-screen-capture'

export type { CaptureRegion }

/** Optional hook so main can hide the overlay while capturing (avoids OCR reading our UI). */
let pauseOverlayForCapture: (() => () => void) | null = null

export function setCaptureOverlayPause(fn: (() => () => void) | null) {
  pauseOverlayForCapture = fn
}

/** Short desktopCapturer cache — avoids double portal/thumbnail work on retry scans. */
let thumbCache: {
  at: number
  displayId: number
  png: Buffer
  width: number
  height: number
} | null = null
const THUMB_CACHE_MS = 1500

/** Drop cached desktopCapturer thumbs so OCR always sees a fresh frame. */
export function invalidateCaptureCache() {
  thumbCache = null
}

async function withOverlayPaused<T>(fn: () => Promise<T>): Promise<T> {
  const resume = pauseOverlayForCapture?.()
  try {
    // Overlay is opacity-0 + moved off-screen; brief settle is enough.
    // Persistent stream path needs less compositor settle time.
    const settleMs = isPersistentCaptureLive() ? 60 : process.platform === 'linux' ? 120 : 100
    await new Promise((r) => setTimeout(r, settleMs))
    return await fn()
  } finally {
    resume?.()
  }
}

/**
 * Four reward-name bands on a typical fissure pick screen.
 * Also used by the overlay strip to size/gap labels under cards.
 */
export function relicRewardRegions(width: number, height: number): CaptureRegion[] {
  const slots = 4
  // Slightly taller/wider band so multi-line names + rarity diamonds stay in crop.
  const cardW = width * 0.162
  const gap = width * 0.024
  const total = slots * cardW + (slots - 1) * gap
  const startX = (width - total) / 2
  const y = height * 0.435
  const h = height * 0.1

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

async function captureViaDesktopCapturer(preferred?: Electron.Display): Promise<{
  png: Buffer
  width: number
  height: number
} | null> {
  const target = preferred || screen.getPrimaryDisplay()
  const now = Date.now()
  if (thumbCache && now - thumbCache.at < THUMB_CACHE_MS) {
    return { png: thumbCache.png, width: thumbCache.width, height: thumbCache.height }
  }

  // Size thumbs for the largest display so one getSources call covers multi-monitor.
  // (Calling getSources once per display re-triggers Wayland/PipeWire prompts.)
  const displays = screen.getAllDisplays()
  let thumbW = 0
  let thumbH = 0
  for (const d of displays) {
    const scale = d.scaleFactor || 1
    thumbW = Math.max(thumbW, Math.round(d.size.width * scale))
    thumbH = Math.max(thumbH, Math.round(d.size.height * scale))
  }

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: thumbW, height: thumbH },
  })

  const preferredId = String(target.id)
  const ordered = [
    sources.find((s) => s.display_id === preferredId),
    ...sources.filter((s) => s.display_id !== preferredId),
  ].filter(Boolean) as Electron.DesktopCapturerSource[]

  for (const source of ordered) {
    const png = source.thumbnail.toPNG()
    if (!png?.length) continue
    const img = nativeImage.createFromBuffer(png)
    const size = img.getSize()
    if (size.width < 16 || size.height < 16) continue
    const result = { png, width: size.width, height: size.height }
    thumbCache = { at: now, displayId: target.id, ...result }
    return result
  }
  return null
}

/**
 * Linux/Wayland: prefer persistent MediaStream (one portal prompt per session).
 * Windows/macOS: desktopCapturer thumbnails (no share dialog).
 */
async function captureDisplay(display: Electron.Display): Promise<{
  png: Buffer
  width: number
  height: number
} | null> {
  if (process.platform === 'linux') {
    const persistent = await grabPersistentFrame()
    if (persistent?.png?.length) return persistent
  }
  return captureViaDesktopCapturer(display)
}

export async function capturePrimaryDisplay(): Promise<{
  png: Buffer
  width: number
  height: number
} | null> {
  return captureDisplay(screen.getPrimaryDisplay())
}

/** Prefer primary / persistent stream; one desktopCapturer fallback list if needed. */
export async function captureBestDisplay(): Promise<{
  png: Buffer
  width: number
  height: number
} | null> {
  return captureDisplay(screen.getPrimaryDisplay())
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
  return withOverlayPaused(async () => {
    invalidateCaptureCache()
    const shot = await captureBestDisplay()
    if (!shot) return []
    const regions = relicRewardRegions(shot.width, shot.height)
    return regions.map((region) => cropPng(shot.png, region))
  })
}

export { rivenCompareRegions }

export type RivenCaptureResult = {
  crops: Buffer[]
  fullPng: Buffer
  width: number
  height: number
  regions: CaptureRegion[]
}

/**
 * Capture the two full Cycle mod cards only (left=current, right=reroll).
 * Does not include the companion/overlay UI (paused + content-protected).
 */
export async function captureRivenComparePngs(): Promise<Buffer[]> {
  const result = await captureRivenCompare()
  return result?.crops ?? []
}

export async function captureRivenCompare(): Promise<RivenCaptureResult | null> {
  return withOverlayPaused(async () => {
    invalidateCaptureCache()
    const shot = await captureBestDisplay()
    if (!shot) return null
    const regions = rivenCompareRegions(shot.width, shot.height)
    console.info(
      `[Everything Warframe] Riven card crops ${shot.width}×${shot.height}: ` +
        regions
          .map((r, i) => `${i === 0 ? 'current' : 'reroll'}@(${r.x},${r.y},${r.width}x${r.height})`)
          .join(' · '),
    )
    return {
      crops: regions.map((region) => cropPng(shot.png, region)),
      fullPng: shot.png,
      width: shot.width,
      height: shot.height,
      regions,
    }
  })
}

/** Warm the persistent capture stream (call when OCR modules are enabled). */
export async function warmScreenCapture(): Promise<boolean> {
  return ensurePersistentCapture()
}
