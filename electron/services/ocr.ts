import path from 'node:path'
import { createWorker, Worker } from 'tesseract.js'
import { app } from 'electron'

let worker: Worker | null = null
let loading: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (worker) return worker
  if (!loading) {
    loading = (async () => {
      const cachePath = path.join(app.getPath('userData'), 'tesseract-cache')
      const w = await createWorker('eng', 1, {
        cachePath,
        // Keep logs quiet in production
        logger: () => {},
      })
      await w.setParameters({
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '&-",
      })
      worker = w
      return w
    })()
  }
  return loading
}

const RELIC_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '&-"
const RIVEN_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%+-.&' "

export async function recognizeRewardNames(images: Buffer[]): Promise<string[]> {
  const w = await getWorker()
  await w.setParameters({ tessedit_char_whitelist: RELIC_WHITELIST })
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

/** Keep newlines — riven cards are multi-line (weapon + stats). */
export async function recognizeRivenBlocks(images: Buffer[]): Promise<string[]> {
  const w = await getWorker()
  await w.setParameters({ tessedit_char_whitelist: RIVEN_WHITELIST })
  const blocks: string[] = []
  for (const png of images) {
    const result = await w.recognize(png)
    const text = (result.data.text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n')
      .trim()
    blocks.push(text)
  }
  // Restore relic whitelist for subsequent relic scans
  await w.setParameters({ tessedit_char_whitelist: RELIC_WHITELIST })
  return blocks
}

export async function warmupOcr(): Promise<void> {
  await getWorker()
}
