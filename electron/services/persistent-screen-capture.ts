import { app, BrowserWindow, desktopCapturer, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { resolveOcrDisplay } from './display-target'

/**
 * Keeps a single getDisplayMedia stream alive so Linux/Wayland (PipeWire portal)
 * only asks for screen-share permission once per session, and subsequent OCR
 * captures are just frame grabs (much faster than desktopCapturer thumbnails).
 */

type FrameResult = { png: Buffer; width: number; height: number }

let win: BrowserWindow | null = null
let initPromise: Promise<void> | null = null
let streamReady = false
let handlerInstalled = false

/** Portal pickers can hang forever if a second getSources races the first. */
const ENSURE_STREAM_TIMEOUT_MS = 120_000

const CAPTURE_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head><body>
<script>
(() => {
  let stream = null
  let video = null
  let canvas = null

  async function ensureStream() {
    if (stream && stream.getVideoTracks().some((t) => t.readyState === 'live')) {
      return true
    }
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        frameRate: { ideal: 8, max: 15 },
      },
    })
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    await video.play()
    // Wait for dimensions
    for (let i = 0; i < 40 && (!video.videoWidth || !video.videoHeight); i++) {
      await new Promise((r) => setTimeout(r, 25))
    }
    canvas = document.createElement('canvas')
    const track = stream.getVideoTracks()[0]
    track?.addEventListener('ended', () => {
      stream = null
      video = null
      canvas = null
    })
    return true
  }

  async function grabFrame() {
    await ensureStream()
    if (!video || !canvas) throw new Error('capture stream not ready')
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) throw new Error('capture video has no dimensions')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.drawImage(video, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/png')
    return { dataUrl, width: w, height: h }
  }

  async function isLive() {
    return Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'))
  }

  async function stopStream() {
    try {
      stream?.getTracks()?.forEach((t) => t.stop())
    } catch (_) {}
    stream = null
    video = null
    canvas = null
  }

  window.__ewCapture = { ensureStream, grabFrame, isLive, stopStream }
})()
</script>
</body></html>`

function captureSession() {
  return session.fromPartition('persist:ew-screen-capture')
}

function installDisplayMediaHandler() {
  if (handlerInstalled) return
  handlerInstalled = true
  const ses = captureSession()

  /**
   * Linux/Wayland: use the PipeWire/xdg-desktop-portal system picker once.
   * Do NOT call desktopCapturer.getSources() here — that opens a *second*
   * portal dialog and commonly deadlocks (app freezes after “Authorize capture”).
   *
   * Other platforms: auto-pick the OCR monitor without a share dialog.
   */
  if (process.platform === 'linux') {
    ses.setDisplayMediaRequestHandler((_request, callback) => {
      // Empty streams → Chromium uses the system/PipeWire picker when available.
      try {
        callback({})
      } catch (err) {
        console.warn('[Everything Warframe] display media callback failed', err)
      }
    }, { useSystemPicker: true })
    return
  }

  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
      })
      const target = resolveOcrDisplay()
      const preferredId = String(target.id)
      const source =
        sources.find((s) => s.display_id === preferredId) ||
        sources.find((s) => Number(s.display_id) === target.id) ||
        sources.find((s) => s.id.includes('screen')) ||
        sources[0]
      if (!source) {
        callback({})
        return
      }
      callback({ video: source })
    } catch (err) {
      console.warn('[Everything Warframe] display media handler failed', err)
      callback({})
    }
  })
}

function captureHostPath() {
  const dir = app.getPath('userData')
  const file = path.join(dir, 'capture-host.html')
  fs.writeFileSync(file, CAPTURE_PAGE, 'utf8')
  return file
}

async function ensureWindow(): Promise<BrowserWindow> {
  if (win && !win.isDestroyed()) return win
  installDisplayMediaHandler()
  win = new BrowserWindow({
    show: false,
    width: 64,
    height: 64,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      partition: 'persist:ew-screen-capture',
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.on('closed', () => {
    win = null
    streamReady = false
    initPromise = null
  })
  // file:// host is a proper secure context for getDisplayMedia (data: URLs are flaky).
  await win.loadFile(captureHostPath())
  return win
}

async function exec<T>(js: string): Promise<T> {
  const w = await ensureWindow()
  return w.webContents.executeJavaScript(js, true) as Promise<T>
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`))
    }, ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** Start (or resume) the persistent screen stream. May show a portal picker once. */
export async function ensurePersistentCapture(): Promise<boolean> {
  if (streamReady) {
    try {
      const live = await exec<boolean>('window.__ewCapture.isLive()')
      if (live) return true
      streamReady = false
    } catch {
      streamReady = false
    }
  }
  if (!initPromise) {
    initPromise = (async () => {
      await ensureWindow()
      await withTimeout(
        exec('window.__ewCapture.ensureStream()'),
        ENSURE_STREAM_TIMEOUT_MS,
        'Screen share authorization',
      )
      streamReady = true
      console.info('[Everything Warframe] Persistent screen capture stream ready')
    })()
      .catch(async (err) => {
        streamReady = false
        try {
          await exec('window.__ewCapture.stopStream()')
        } catch {
          // ignore
        }
        throw err
      })
      .finally(() => {
        initPromise = null
      })
  }
  try {
    await initPromise
    return streamReady
  } catch (err) {
    streamReady = false
    console.warn('[Everything Warframe] Persistent screen capture unavailable', err)
    return false
  }
}

export function isPersistentCaptureLive(): boolean {
  return streamReady
}

/** Grab one full-desktop frame from the live stream (no new permission prompt). */
export async function grabPersistentFrame(): Promise<FrameResult | null> {
  const ok = await ensurePersistentCapture()
  if (!ok) return null
  try {
    const frame = await exec<{ dataUrl: string; width: number; height: number }>(
      'window.__ewCapture.grabFrame()',
    )
    if (!frame?.dataUrl) return null
    const b64 = frame.dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const png = Buffer.from(b64, 'base64')
    return { png, width: frame.width, height: frame.height }
  } catch (err) {
    streamReady = false
    console.warn('[Everything Warframe] Persistent frame grab failed', err)
    return null
  }
}

export function disposePersistentCapture() {
  streamReady = false
  initPromise = null
  if (win && !win.isDestroyed()) {
    try {
      void win.webContents.executeJavaScript('window.__ewCapture?.stopStream?.()', true)
    } catch {
      // ignore
    }
    win.destroy()
  }
  win = null
}
