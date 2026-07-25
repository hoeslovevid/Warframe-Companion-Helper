import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

export function createOverlayWindow(devUrl: string | null): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.bounds

  const win = new BrowserWindow({
    width,
    height,
    x: display.bounds.x,
    y: display.bounds.y,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  // High enough to sit above borderless Warframe; companion uses the same level + moveTop
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // `{ forward: true }` is Windows-only; Linux/Proton still get click-through without it.
  if (process.platform === 'win32') {
    win.setIgnoreMouseEvents(true, { forward: true })
  } else {
    win.setIgnoreMouseEvents(true)
  }
  // Keep overlay visible to the player, but exclude it from desktopCapturer / OCR snapshots.
  try {
    win.setContentProtection(true)
  } catch {
    // Older Electron / OS builds may not support this.
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[Everything Warframe] Overlay failed to load (${code}): ${desc} — ${url}`)
  })

  win.webContents.on('did-finish-load', () => {
    console.info(`[Everything Warframe] Overlay loaded: ${win.webContents.getURL()}`)
  })

  if (devUrl) {
    void win.loadURL(`${devUrl}/?window=overlay`)
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { window: 'overlay' },
    })
  }

  win.once('ready-to-show', () => {
    try {
      win.setContentProtection(true)
    } catch {
      // ignore
    }
    win.showInactive()
    win.setAlwaysOnTop(true, 'screen-saver')
  })

  return win
}

export function setOverlayClickThrough(win: BrowserWindow, clickThrough: boolean) {
  if (clickThrough) {
    if (process.platform === 'win32') {
      win.setIgnoreMouseEvents(true, { forward: true })
    } else {
      win.setIgnoreMouseEvents(true)
    }
    win.setFocusable(false)
  } else {
    win.setIgnoreMouseEvents(false)
    win.setFocusable(true)
  }
}
