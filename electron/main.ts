import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
} from 'electron'
import path from 'node:path'
import { createOverlayWindow, setOverlayClickThrough } from './overlay-window'
import { loadSettings, setModuleEnabled, updateSettings } from './settings'
import { fetchWorldstate } from './services/worldstate'
import { detectEeLogPath } from './services/log-path'
import {
  clearInventoryData,
  getInventoryIndex,
  getInventoryStatus,
  inferInventorySource,
  onInventoryUpdated,
  reloadConfiguredInventory,
  setInventoryConsent,
  syncInventoryFromGame,
  useInventoryFile,
} from './services/inventory'
import { LogWatcher } from './services/log-watcher'
import {
  clearRelicScan,
  getRelicScanState,
  onRelicScanUpdated,
  scanRelicRewards,
  warmupRelicScanner,
} from './services/relic-scanner'
import { AppSettings, ModuleId, WorldstateSnapshot } from '../shared/types'

// Ensure Chromium's optional FPS HUD is not enabled
try {
  app.commandLine.removeSwitch('show-fps-counter')
} catch {
  // ignore
}
app.setName('VoidLens')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.voidlens.app')
}

const isDev = !app.isPackaged
const DEV_URL = 'http://127.0.0.1:5173'

let companionWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let worldstateCache: WorldstateSnapshot | null = null
let worldstateTimer: NodeJS.Timeout | null = null
const logWatcher = new LogWatcher()

async function runRelicScan(trigger: 'manual' | 'log') {
  // Ensure relics module + overlay are visible for results
  const settings = loadSettings()
  if (!settings.modules.relics || !settings.overlayVisible) {
    const next = updateSettings({
      modules: { ...settings.modules, relics: true },
      overlayVisible: true,
    })
    applyOverlayVisibility(true)
    broadcastSettings(next)
  }
  const state = await scanRelicRewards(trigger)
  broadcastRelicScan()
  return state
}

function broadcastRelicScan() {
  const state = getRelicScanState()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('relics:updated', state)
  }
}

function broadcastSettings(settings: AppSettings) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', settings)
  }
}

function broadcastWorldstate(data: WorldstateSnapshot) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('worldstate:updated', data)
  }
}

function broadcastOverlayVisibility(visible: boolean) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('overlay:visibility', visible)
  }
}

function broadcastInventory() {
  const status = getInventoryStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('inventory:updated', status)
  }
}

async function refreshWorldstate(force = false): Promise<WorldstateSnapshot> {
  if (!force && worldstateCache) {
    const age = Date.now() - new Date(worldstateCache.fetchedAt).getTime()
    if (age < 15_000) return worldstateCache
  }
  worldstateCache = await fetchWorldstate()
  broadcastWorldstate(worldstateCache)
  return worldstateCache
}

function raiseCompanion() {
  if (!companionWindow || companionWindow.isDestroyed()) return
  // Same tier as overlay (screen-saver), then moveTop so the companion wins
  companionWindow.setAlwaysOnTop(true, 'screen-saver')
  companionWindow.show()
  companionWindow.focus()
  companionWindow.moveTop()
}

function loadCompanionContent(win: BrowserWindow) {
  const distIndex = path.join(__dirname, '../dist/index.html')

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[VoidLens] Companion failed to load (${code}): ${desc} — ${url}`)
    if (isDev && url.startsWith(DEV_URL)) {
      console.warn('[VoidLens] Falling back to production dist build for companion')
      void win.loadFile(distIndex, { query: { window: 'companion' } })
    }
  })

  if (isDev) {
    void win.loadURL(`${DEV_URL}/?window=companion`)
  } else {
    void win.loadFile(distIndex, { query: { window: 'companion' } })
  }
}

function createCompanionWindow() {
  if (companionWindow && !companionWindow.isDestroyed()) {
    raiseCompanion()
    return companionWindow
  }

  companionWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1218',
    title: 'VoidLens',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  loadCompanionContent(companionWindow)

  companionWindow.once('ready-to-show', () => {
    raiseCompanion()
  })

  companionWindow.on('focus', () => {
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.setAlwaysOnTop(true, 'screen-saver')
      companionWindow.moveTop()
    }
  })

  companionWindow.on('blur', () => {
    // Keep elevated so the overlay cannot bury the companion while it stays open
    if (companionWindow && !companionWindow.isDestroyed() && companionWindow.isVisible()) {
      companionWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  })

  companionWindow.on('closed', () => {
    companionWindow = null
  })

  // Safety: show even if ready-to-show is delayed
  setTimeout(() => raiseCompanion(), 750)

  return companionWindow
}

function applyOverlayVisibility(visible: boolean) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (visible) {
    overlayWindow.showInactive()
    // Re-raise companion so overlay creation/show never hides it
    if (companionWindow && !companionWindow.isDestroyed() && companionWindow.isVisible()) {
      raiseCompanion()
    }
  } else {
    overlayWindow.hide()
  }
  broadcastOverlayVisibility(visible)
}

function applyLayoutEditMode(enabled: boolean) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  setOverlayClickThrough(overlayWindow, !enabled)
}

const HOTKEY_FALLBACKS: Record<keyof AppSettings['hotkeys'], string[]> = {
  toggleOverlay: ['Alt+Shift+V', 'Alt+Shift+O', 'F8', 'CommandOrControl+Alt+V'],
  openCompanion: ['Alt+Shift+C', 'Alt+Shift+L', 'F9', 'CommandOrControl+Alt+C'],
  refreshWorldstate: ['Alt+Shift+R', 'F10', 'CommandOrControl+Alt+R'],
  scanRelics: ['Alt+Shift+F', 'F2', 'CommandOrControl+Alt+F'],
}

function registerOneHotkey(
  preferred: string,
  fallbacks: string[],
  handler: () => void,
  label: string,
): string | null {
  const candidates = [preferred, ...fallbacks.filter((a) => a !== preferred)]
  for (const accelerator of candidates) {
    try {
      // Clear this accelerator first in case a prior attempt partially bound it
      globalShortcut.unregister(accelerator)
      const ok = globalShortcut.register(accelerator, handler)
      if (ok) {
        if (accelerator !== preferred) {
          console.warn(
            `[VoidLens] ${label}: "${preferred}" unavailable, using "${accelerator}"`,
          )
        } else {
          console.info(`[VoidLens] ${label}: registered "${accelerator}"`)
        }
        return accelerator
      }
    } catch (err) {
      console.warn(`[VoidLens] ${label}: error registering "${accelerator}"`, err)
    }
  }
  console.error(`[VoidLens] ${label}: all accelerators failed`)
  return null
}

function registerHotkeys() {
  globalShortcut.unregisterAll()
  const settings = loadSettings()
  const nextHotkeys = { ...settings.hotkeys }
  let changed = false

  const toggle = registerOneHotkey(
    settings.hotkeys.toggleOverlay,
    HOTKEY_FALLBACKS.toggleOverlay,
    () => {
      const next = updateSettings({ overlayVisible: !loadSettings().overlayVisible })
      applyOverlayVisibility(next.overlayVisible)
      broadcastSettings(next)
    },
    'toggleOverlay',
  )
  if (toggle && toggle !== settings.hotkeys.toggleOverlay) {
    nextHotkeys.toggleOverlay = toggle
    changed = true
  }

  const companion = registerOneHotkey(
    settings.hotkeys.openCompanion,
    HOTKEY_FALLBACKS.openCompanion,
    () => {
      createCompanionWindow()
    },
    'openCompanion',
  )
  if (companion && companion !== settings.hotkeys.openCompanion) {
    nextHotkeys.openCompanion = companion
    changed = true
  }

  const refresh = registerOneHotkey(
    settings.hotkeys.refreshWorldstate,
    HOTKEY_FALLBACKS.refreshWorldstate,
    () => {
      void refreshWorldstate(true)
    },
    'refreshWorldstate',
  )
  if (refresh && refresh !== settings.hotkeys.refreshWorldstate) {
    nextHotkeys.refreshWorldstate = refresh
    changed = true
  }

  const scan = registerOneHotkey(
    settings.hotkeys.scanRelics,
    HOTKEY_FALLBACKS.scanRelics,
    () => {
      void runRelicScan('manual')
    },
    'scanRelics',
  )
  if (scan && scan !== settings.hotkeys.scanRelics) {
    nextHotkeys.scanRelics = scan
    changed = true
  }

  if (changed) {
    const next = updateSettings({ hotkeys: nextHotkeys })
    broadcastSettings(next)
  }
}

function createTray() {
  try {
    // Simple 16x16 teal PNG (valid IHDR)
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGD4z0AEYBxVMFRgwP+BAsMogqECg/+MDAwMDMMpgqECgwYGBgYGRgYGADqmAwF5Ww6eAAAAAElFTkSuQmCC',
      'base64',
    )
    let icon = nativeImage.createFromBuffer(png)
    if (icon.isEmpty()) {
      icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGD4z0AEYBxVMFRgwP+BAsMogqECg/+MDAwMDMMpgqECgwYGBgYGRgYGADqmAwF5Ww6eAAAAAElFTkSuQmCC',
      )
    }
    tray = new Tray(icon)
    tray.setToolTip('VoidLens')
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Companion',
        click: () => createCompanionWindow(),
      },
      {
        label: 'Toggle Overlay',
        click: () => {
          const next = updateSettings({ overlayVisible: !loadSettings().overlayVisible })
          applyOverlayVisibility(next.overlayVisible)
          broadcastSettings(next)
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit()
        },
      },
    ])
    tray.setContextMenu(menu)
    tray.on('double-click', () => createCompanionWindow())
    tray.on('click', () => createCompanionWindow())
  } catch (err) {
    console.error('[VoidLens] Tray creation failed (non-fatal)', err)
  }
}

function registerIpc() {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:update', (_e, partial: Partial<AppSettings>) => {
    const next = updateSettings(partial)
    if (partial.hotkeys) registerHotkeys()
    if (partial.layoutEditMode !== undefined) applyLayoutEditMode(next.layoutEditMode)
    if (partial.overlayVisible !== undefined) applyOverlayVisibility(next.overlayVisible)
    broadcastSettings(next)
    return next
  })
  ipcMain.handle('settings:setModule', (_e, id: ModuleId, enabled: boolean) => {
    const next = setModuleEnabled(id, enabled)
    broadcastSettings(next)
    return next
  })
  ipcMain.handle('worldstate:get', async () => refreshWorldstate(false))
  ipcMain.handle('worldstate:refresh', async () => refreshWorldstate(true))
  ipcMain.handle('overlay:toggle', () => {
    const next = updateSettings({ overlayVisible: !loadSettings().overlayVisible })
    applyOverlayVisibility(next.overlayVisible)
    broadcastSettings(next)
    return next.overlayVisible
  })
  ipcMain.handle('overlay:setLayoutEdit', (_e, enabled: boolean) => {
    const next = updateSettings({ layoutEditMode: enabled })
    applyLayoutEditMode(enabled)
    broadcastSettings(next)
    return next
  })
  ipcMain.handle('dialog:pickEeLog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Warframe EE.log',
      properties: ['openFile'],
      filters: [{ name: 'Log files', extensions: ['log', 'txt'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const next = updateSettings({ eeLogPath: result.filePaths[0] })
    logWatcher.setPath(result.filePaths[0])
    broadcastSettings(next)
    return result.filePaths[0]
  })
  ipcMain.handle('dialog:pickInventory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select inventory.json or AlecaFrame lastData.dat',
      properties: ['openFile'],
      filters: [
        { name: 'Inventory', extensions: ['json', 'dat'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'AlecaFrame', extensions: ['dat'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const loaded = useInventoryFile(
      result.filePaths[0],
      result.filePaths[0].toLowerCase().endsWith('.dat') ? 'alecaframe' : 'manual',
    )
    broadcastSettings(loadSettings())
    broadcastInventory()
    return loaded.ok ? loaded.path ?? null : null
  })
  ipcMain.handle('log:detectEe', () => {
    const found = detectEeLogPath()
    if (found) {
      const next = updateSettings({ eeLogPath: found })
      logWatcher.setPath(found)
      broadcastSettings(next)
    }
    return found
  })
  ipcMain.handle('inventory:status', () => getInventoryStatus())
  ipcMain.handle('inventory:consent', (_e, consent: boolean) => {
    const status = setInventoryConsent(consent)
    broadcastSettings(loadSettings())
    broadcastInventory()
    return status
  })
  ipcMain.handle('inventory:detect', () => {
    const status = getInventoryStatus()
    broadcastInventory()
    return status
  })
  ipcMain.handle('inventory:use', (_e, filePath: string) => {
    const result = useInventoryFile(filePath, inferInventorySource(filePath))
    broadcastSettings(loadSettings())
    broadcastInventory()
    return result
  })
  ipcMain.handle('inventory:sync', async () => {
    const result = await syncInventoryFromGame()
    broadcastSettings(loadSettings())
    broadcastInventory()
    return result
  })
  ipcMain.handle('inventory:clear', () => {
    const status = clearInventoryData()
    broadcastSettings(loadSettings())
    broadcastInventory()
    return status
  })
  ipcMain.handle('inventory:index', () => getInventoryIndex())
  ipcMain.handle('relics:get', () => getRelicScanState())
  ipcMain.handle('relics:scan', async () => runRelicScan('manual'))
  ipcMain.handle('relics:clear', () => {
    const state = clearRelicScan()
    broadcastRelicScan()
    return state
  })
}

app.whenReady().then(async () => {
  registerIpc()

  const settings = loadSettings()
  if (!settings.eeLogPath) {
    const found = detectEeLogPath()
    if (found) updateSettings({ eeLogPath: found })
  }

  createCompanionWindow()
  overlayWindow = createOverlayWindow(isDev ? DEV_URL : null)
  applyOverlayVisibility(loadSettings().overlayVisible)
  applyLayoutEditMode(loadSettings().layoutEditMode)

  // Overlay is created after companion; ensure companion stays on top
  raiseCompanion()

  reloadConfiguredInventory()
  onInventoryUpdated((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('inventory:updated', status)
    }
  })
  onRelicScanUpdated(() => broadcastRelicScan())

  const eePath = loadSettings().eeLogPath || detectEeLogPath()
  if (eePath) {
    if (!loadSettings().eeLogPath) updateSettings({ eeLogPath: eePath })
    logWatcher.setPath(eePath)
  }
  logWatcher.on('event', (event) => {
    if (event.type === 'relic_rewards') {
      console.info('[VoidLens] EE.log relic rewards detected — scanning')
      void runRelicScan('log')
    }
  })
  logWatcher.start()

  registerHotkeys()
  createTray()

  try {
    await refreshWorldstate(true)
  } catch (err) {
    console.error('Initial worldstate fetch failed', err)
  }

  void warmupRelicScanner().catch((err) =>
    console.warn('[VoidLens] Relic scanner warmup failed', err),
  )

  worldstateTimer = setInterval(() => {
    void refreshWorldstate(true).catch((err) => console.error(err))
  }, 60_000)

  app.on('activate', () => {
    createCompanionWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  logWatcher.stop()
  if (worldstateTimer) clearInterval(worldstateTimer)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running via tray/overlay; quit only when user chooses Quit
  }
})
