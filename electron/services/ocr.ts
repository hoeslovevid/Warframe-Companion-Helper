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

export async function recognizeRewardNames(images: Buffer[]): Promise<string[]> {
  const w = await getWorker()
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

export async function warmupOcr(): Promise<void> {
  await getWorker()
}
