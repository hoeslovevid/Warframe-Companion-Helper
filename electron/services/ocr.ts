import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { app, nativeImage } from 'electron'
import { createWorker, PSM, Worker } from 'tesseract.js'

const nodeRequire = createRequire(__filename)

type PaddleLine = {
  text?: string
  mean?: number
  box?: Array<[number, number]>
}

type PaddleResult = {
  texts?: PaddleLine[]
  rawTexts?: string[]
}

type PaddleOcr = {
  detect: (image: string) => Promise<PaddleResult>
}

type PaddleModule = {
  create?: (options?: Record<string, unknown>) => Promise<PaddleOcr>
  releaseAll?: () => Promise<void>
  default?: {
    create: (options?: Record<string, unknown>) => Promise<PaddleOcr>
  }
}

let paddle: PaddleOcr | null = null
let paddleLoading: Promise<PaddleOcr | null> | null = null
let paddleFailed = false

let tessWorker: Worker | null = null
let tessLoading: Promise<Worker> | null = null

const RELIC_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '&-"
const RIVEN_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%+-.&' "

/** UI chrome / buttons that appear near Cycle cards — never treat as stats. */
const RIVEN_NOISE =
  /^(accept|decline|cycle|kuva|confirm|cancel|riven|keep|take|current|new|reroll|vs|polarity|rank|mr\.?|mastery|disposition|ok|yes|no)$/i

function tmpPngPath(tag: string) {
  return path.join(
    os.tmpdir(),
    `everything-warframe-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
  )
}

async function loadPaddle(): Promise<PaddleOcr | null> {
  if (paddle) return paddle
  if (paddleFailed) return null
  if (!paddleLoading) {
    paddleLoading = (async () => {
      try {
        let mod: PaddleModule
        try {
          mod = nodeRequire('@repeato/ocr') as PaddleModule
        } catch {
          mod = (await import('@repeato/ocr')) as PaddleModule
        }
        const create = mod.create || mod.default?.create
        if (!create) throw new Error('@repeato/ocr create() missing')
        const instance = await create()
        paddle = instance
        console.info('[Everything Warframe] OCR engine: PaddleOCR (PP-OCRv4 ONNX)')
        return instance
      } catch (err) {
        paddleFailed = true
        console.warn(
          '[Everything Warframe] PaddleOCR unavailable — falling back to Tesseract',
          err instanceof Error ? err.message : err,
        )
        return null
      }
    })()
  }
  return paddleLoading
}

async function getTessWorker(): Promise<Worker> {
  if (tessWorker) return tessWorker
  if (!tessLoading) {
    tessLoading = (async () => {
      const cachePath = path.join(app.getPath('userData'), 'tesseract-cache')
      const w = await createWorker('eng', 1, {
        cachePath,
        logger: () => {},
      })
      await w.setParameters({
        tessedit_char_whitelist: RELIC_WHITELIST,
      })
      tessWorker = w
      return w
    })()
  }
  return tessLoading
}

/** Prep a single riven card crop: boost light UI text on dark mesh, pad, upscale. */
async function prepareRivenCard(png: Buffer, mode: 'normal' | 'harsh' = 'normal'): Promise<Buffer> {
  try {
    const sharp = nodeRequire('sharp') as typeof import('sharp')
    const meta = await sharp(png).metadata()
    const width = meta.width || 400
    const targetW = Math.max(640, Math.round(width * 2.6))
    let pipeline = sharp(png).grayscale().normalize()
    if (mode === 'harsh') {
      // Crush midtones so faint mesh drops out and white stat text pops.
      pipeline = pipeline.linear(1.85, -40).threshold(118)
    } else {
      pipeline = pipeline.linear(1.45, -22).sharpen({ sigma: 1.0 })
    }
    return pipeline
      .extend({
        top: 32,
        bottom: 32,
        left: 32,
        right: 32,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .resize({ width: targetW, kernel: 'lanczos3' })
      .png()
      .toBuffer()
  } catch {
    const img = nativeImage.createFromBuffer(png)
    const { width, height } = img.getSize()
    if (width < 8 || height < 8) return png
    return img
      .resize({
        width: Math.round(width * 2.6),
        height: Math.round(height * 2.6),
        quality: 'best',
      })
      .toPNG()
  }
}

async function prepareRelicPng(png: Buffer, scale: number): Promise<Buffer> {
  try {
    const sharp = nodeRequire('sharp') as typeof import('sharp')
    const meta = await sharp(png).metadata()
    const width = meta.width || 0
    if (width > 0 && scale !== 1) {
      return sharp(png)
        .resize({ width: Math.round(width * scale), kernel: 'lanczos3' })
        .png()
        .toBuffer()
    }
    return sharp(png).png().toBuffer()
  } catch {
    const img = nativeImage.createFromBuffer(png)
    const { width, height } = img.getSize()
    if (width < 8 || height < 8 || scale === 1) return png
    return img
      .resize({
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        quality: 'best',
      })
      .toPNG()
  }
}

/**
 * Merge Paddle boxes into reading-order lines.
 * Same visual row (value + stat name) becomes one string for the parser.
 */
function linesFromPaddle(result: PaddleResult): string[] {
  const texts = (result.texts || []).filter((t) => (t.text || '').trim())
  if (!texts.length && result.rawTexts?.length) {
    return result.rawTexts.map((t) => t.trim()).filter(Boolean)
  }

  const items = texts.map((t) => {
    const box = t.box || []
    const xs = box.map((p) => p[0])
    const ys = box.map((p) => p[1])
    const left = Math.min(...xs, 0)
    const top = Math.min(...ys, 0)
    const bottom = Math.max(...ys, 0)
    return {
      text: (t.text || '').trim(),
      left,
      top,
      midY: (top + bottom) / 2,
      height: Math.max(8, bottom - top),
    }
  })

  items.sort((a, b) => a.midY - b.midY || a.left - b.left)

  const rows: typeof items[] = []
  for (const item of items) {
    const row = rows[rows.length - 1]
    if (!row) {
      rows.push([item])
      continue
    }
    const ref = row[0]
    const threshold = Math.max(12, Math.min(ref.height, item.height) * 0.65)
    if (Math.abs(item.midY - ref.midY) <= threshold) {
      row.push(item)
    } else {
      rows.push([item])
    }
  }

  const lines: string[] = []
  for (const row of rows) {
    row.sort((a, b) => a.left - b.left)
    const joined = row
      .map((c) => c.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!joined) continue
    // If a row glued multiple ±stat pairs, split so the parser sees each.
    const parts = joined.split(/(?=[+\-]\s*\d)/).map((p) => p.trim()).filter(Boolean)
    if (parts.length > 1 && parts.every((p) => /^[+\-]\s*\d/.test(p))) {
      lines.push(...parts)
    } else {
      lines.push(joined)
    }
  }
  return lines
}

function filterRivenLines(lines: string[]): string[] {
  return lines.filter((line) => {
    const t = line.trim()
    if (!t || t.length < 2) return false
    if (RIVEN_NOISE.test(t)) return false
    // Pure kuva / credit amounts
    if (/^[?\d,\.\s]+$/.test(t) && !/%/.test(t)) return false
    return true
  })
}

async function detectPrepared(engine: PaddleOcr, prepared: Buffer): Promise<string[]> {
  const file = tmpPngPath('paddle')
  try {
    fs.writeFileSync(file, prepared)
    const result = await engine.detect(file)
    return linesFromPaddle(result)
  } finally {
    try {
      fs.unlinkSync(file)
    } catch {
      // ignore
    }
  }
}

async function recognizeRelicsTess(images: Buffer[]): Promise<string[]> {
  const w = await getTessWorker()
  await w.setParameters({
    tessedit_char_whitelist: RELIC_WHITELIST,
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  })
  const names: string[] = []
  for (const png of images) {
    const result = await w.recognize(png)
    const text = (result.data.text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    names.push(text)
  }
  return names
}

async function recognizeRivensTess(images: Buffer[]): Promise<string[]> {
  const w = await getTessWorker()
  await w.setParameters({
    tessedit_char_whitelist: RIVEN_WHITELIST,
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  })
  const blocks: string[] = []
  for (const png of images) {
    const prepared = await prepareRivenCard(png)
    const result = await w.recognize(prepared)
    const text = filterRivenLines(
      (result.data.text || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    ).join('\n')
    blocks.push(text)
  }
  await w.setParameters({
    tessedit_char_whitelist: RELIC_WHITELIST,
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  })
  return blocks
}

export async function recognizeRewardNames(images: Buffer[]): Promise<string[]> {
  const engine = await loadPaddle()
  if (engine) {
    const out: string[] = []
    for (const png of images) {
      const prepared = await prepareRelicPng(png, 2)
      const lines = await detectPrepared(engine, prepared)
      out.push(lines.join(' ').replace(/\s+/g, ' ').trim())
    }
    return out
  }
  return recognizeRelicsTess(images)
}

/**
 * OCR each full riven card independently (current / reroll).
 * Runs a full-card pass plus a stats-band pass and merges lines.
 */
export async function recognizeRivenBlocks(images: Buffer[]): Promise<string[]> {
  const engine = await loadPaddle()
  if (!engine) return recognizeRivensTess(images)

  const out: string[] = []
  for (const png of images) {
    const passes: string[][] = []

    const fullPrep = await prepareRivenCard(png, 'normal')
    passes.push(filterRivenLines(await detectPrepared(engine, fullPrep)))

    const harshPrep = await prepareRivenCard(png, 'harsh')
    passes.push(filterRivenLines(await detectPrepared(engine, harshPrep)))

    // Stats-band pass (lower portion of the diamond where rolled lines sit).
    try {
      const sharp = nodeRequire('sharp') as typeof import('sharp')
      const meta = await sharp(png).metadata()
      const w = meta.width || 0
      const h = meta.height || 0
      if (w > 20 && h > 20) {
        // Mid stats + lower band (last rolled line / negative often sits low on the diamond).
        for (const band of [
          { top: 0.3, height: 0.55 },
          { top: 0.42, height: 0.48 },
        ] as const) {
          const statsPng = await sharp(png)
            .extract({
              left: Math.round(w * 0.04),
              top: Math.round(h * band.top),
              width: Math.round(w * 0.92),
              height: Math.round(h * band.height),
            })
            .toBuffer()
          const statsPrep = await prepareRivenCard(statsPng, 'normal')
          passes.push(filterRivenLines(await detectPrepared(engine, statsPrep)))
          const statsHarsh = await prepareRivenCard(statsPng, 'harsh')
          passes.push(filterRivenLines(await detectPrepared(engine, statsHarsh)))
        }
      }
    } catch {
      // stats band optional
    }

    const merged: string[] = []
    const seen = new Set<string>()
    for (const lines of passes) {
      for (const line of lines) {
        const key = line.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(line)
      }
    }
    out.push(merged.join('\n').trim())
  }
  return out
}

export async function warmupOcr(): Promise<void> {
  const engine = await loadPaddle()
  if (engine) return
  await getTessWorker()
}

export async function shutdownOcr(): Promise<void> {
  try {
    const mod = nodeRequire('@repeato/ocr') as PaddleModule
    await mod.releaseAll?.()
  } catch {
    // ignore
  }
  paddle = null
  paddleLoading = null
  if (tessWorker) {
    await tessWorker.terminate().catch(() => {})
    tessWorker = null
    tessLoading = null
  }
}
