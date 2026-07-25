import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  Tray,
  nativeImage,
  screen,
} from 'electron'
import os from 'node:os'
import path from 'node:path'
import { getAppIcon, getTrayIcon } from './app-icon'
import { createOverlayWindow, setOverlayClickThrough } from './overlay-window'
import { loadSettings, setModuleEnabled, updateSettings } from './settings'
import { fetchWorldstate, hasExpiredWorldstate } from './services/worldstate'
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
} from './services/relic-scanner'
import {
  checkForAppUpdates,
  getUpdateStatus,
  initAutoUpdater,
  quitAndInstallUpdate,
} from './services/updater'
import { AppSettings, ModuleId, WorldstateSnapshot } from '../shared/types'

// Ensure Chromium's optional FPS HUD is not enabled
try {
  app.commandLine.removeSwitch('show-fps-counter')
} catch {
  // ignore
}
app.setName('Everything Warframe')
if (process.platform === 'win32') {
  // Keep stable AUMID so Windows taskbar/jump lists stay linked across renames
  app.setAppUserModelId('com.voidlens.app')
}

const isDev = !app.isPackaged
const DEV_URL = 'http://127.0.0.1:5173'

let companionWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let worldstateCache: WorldstateSnapshot | null = null
let worldstateTimer: NodeJS.Timeout | null = null
let expiryTimer: NodeJS.Timeout | null = null
let lastExpiryRefresh = 0
const logWatcher = new LogWatcher()

function preferLowerProcessPriority() {
  try {
    os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL)
    console.info('[Everything Warframe] Process priority set to below-normal')
  } catch (err) {
    console.warn('[Everything Warframe] Could not lower process priority', err)
  }
}

function applyOverlayPerformanceMode(visible: boolean) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  // When hidden, let Chromium throttle; when shown, keep timers accurate for countdowns
  overlayWindow.webContents.setBackgroundThrottling(!visible)
}

async function runRelicScan(trigger: 'manual' | 'log') {
  const settings = loadSettings()
  // Feature must be enabled (module toggle). Manual hotkey still works when on.
  if (!settings.modules.relics) {
    console.info('[Everything Warframe] Relic scan skipped — Relics module disabled')
    return getRelicScanState()
  }
  // Popup needs the overlay window visible; do not permanently force the relics panel on
  if (!settings.overlayVisible) {
    const next = updateSettings({ overlayVisible: true })
    applyOverlayVisibility(true)
    broadcastSettings(next)
  }
  const state = await scanRelicRewards(trigger)
  broadcastRelicScan()
  return state
}

function dismissRelicPopup() {
  const state = clearRelicScan()
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
    console.error(`[Everything Warframe] Companion failed to load (${code}): ${desc} — ${url}`)
    if (isDev && url.startsWith(DEV_URL)) {
      console.warn('[Everything Warframe] Falling back to production dist build for companion')
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

  const appIcon = getAppIcon()
  companionWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1218',
    title: 'Everything Warframe',
    show: false,
    autoHideMenuBar: true,
    icon: appIcon.isEmpty() ? undefined : appIcon,
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

  companionWindow.on('close', () => {
    const current = loadSettings()
    if (current.onboarding.trayTipShown) return
    const next = updateSettings({
      onboarding: { ...current.onboarding, trayTipShown: true },
    })
    broadcastSettings(next)
    if (Notification.isSupported()) {
      const openKey = current.hotkeys.openCompanion || 'Alt+Shift+C'
      const tip = new Notification({
        title: 'Everything Warframe is still running',
        body: `Companion closed to the tray. Click the tray icon or press ${openKey} to reopen.`,
      })
      tip.on('click', () => createCompanionWindow())
      tip.show()
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
    applyOverlayPerformanceMode(true)
    overlayWindow.showInactive()
    // Re-raise companion so overlay creation/show never hides it
    if (companionWindow && !companionWindow.isDestroyed() && companionWindow.isVisible()) {
      raiseCompanion()
    }
  } else {
    overlayWindow.hide()
    applyOverlayPerformanceMode(false)
  }
  broadcastOverlayVisibility(visible)
}

function checkWorldstateExpiries() {
  if (!worldstateCache) return
  if (!hasExpiredWorldstate(worldstateCache)) return
  const now = Date.now()
  if (now - lastExpiryRefresh < 5000) return
  lastExpiryRefresh = now
  void refreshWorldstate(true).catch((err) =>
    console.error('[Everything Warframe] Expiry refresh failed', err),
  )
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
  // WFHelper uses Control+Tab to unlock overlay interaction
  editLayout: ['Control+Tab', 'Alt+Shift+E', 'Alt+Shift+X', 'F7'],
}

function toggleLayoutEditMode() {
  const next = updateSettings({ layoutEditMode: !loadSettings().layoutEditMode })
  applyLayoutEditMode(next.layoutEditMode)
  broadcastSettings(next)
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
            `[Everything Warframe] ${label}: "${preferred}" unavailable, using "${accelerator}"`,
          )
        } else {
          console.info(`[Everything Warframe] ${label}: registered "${accelerator}"`)
        }
        return accelerator
      }
    } catch (err) {
      console.warn(`[Everything Warframe] ${label}: error registering "${accelerator}"`, err)
    }
  }
  console.error(`[Everything Warframe] ${label}: all accelerators failed`)
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

  const editLayout = registerOneHotkey(
    settings.hotkeys.editLayout,
    HOTKEY_FALLBACKS.editLayout,
    () => {
      toggleLayoutEditMode()
    },
    'editLayout',
  )
  if (editLayout && editLayout !== settings.hotkeys.editLayout) {
    nextHotkeys.editLayout = editLayout
    changed = true
  }

  if (changed) {
    const next = updateSettings({ hotkeys: nextHotkeys })
    broadcastSettings(next)
  }
}

function createTray() {
  try {
    let icon = getTrayIcon()
    if (icon.isEmpty()) {
      console.warn('[Everything Warframe] Tray icon missing — using fallback glyph')
      icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAbElEQVR4Ae3XwQnAIAxA0Z7dO7iDR3ADZ3AEd3AER3AER3AHZ5DfQyCBhEBKeQehIeTjJUmSJEmS/g0A7gCuAO4ALgDOAI4A9gC2ANYAlgBmACYAhgA6AJoAKgCKAJIAYgDC/zvP8zzP8zzP8/wD2wM3J5oF2mYAAAAASUVORK5CYII=',
      )
    }
    tray = new Tray(icon)
    tray.setToolTip('Everything Warframe')
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
      {
        label: 'Move / Lock Panels',
        click: () => toggleLayoutEditMode(),
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
    console.error('[Everything Warframe] Tray creation failed (non-fatal)', err)
  }
}

function getPrimaryDisplayInfo() {
  const display = screen.getPrimaryDisplay()
  return {
    width: display.bounds.width,
    height: display.bounds.height,
    scaleFactor: display.scaleFactor,
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
  ipcMain.handle('display:getPrimary', () => getPrimaryDisplayInfo())
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
  ipcMain.handle('relics:clear', () => dismissRelicPopup())
  ipcMain.handle('update:status', () => getUpdateStatus())
  ipcMain.handle('update:check', async () => checkForAppUpdates())
  ipcMain.handle('update:install', () => quitAndInstallUpdate())
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
      if (!loadSettings().modules.relics) return
      console.info('[Everything Warframe] EE.log relic rewards detected — scanning')
      void runRelicScan('log')
    } else if (event.type === 'relic_rewards_end') {
      console.info('[Everything Warframe] EE.log relic rewards ended — dismissing popup')
      dismissRelicPopup()
    }
  })
  logWatcher.start(1500)

  preferLowerProcessPriority()
  registerHotkeys()
  createTray()
  initAutoUpdater()

  try {
    await refreshWorldstate(true)
  } catch (err) {
    console.error('Initial worldstate fetch failed', err)
  }

  // OCR/catalog warmup deferred until first relic scan (avoids startup CPU/RAM spike)

  worldstateTimer = setInterval(() => {
    void refreshWorldstate(true).catch((err) => console.error(err))
  }, 60_000)

  expiryTimer = setInterval(() => checkWorldstateExpiries(), 2000)

  applyOverlayPerformanceMode(loadSettings().overlayVisible)

  app.on('activate', () => {
    createCompanionWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  logWatcher.stop()
  if (worldstateTimer) clearInterval(worldstateTimer)
  if (expiryTimer) clearInterval(expiryTimer)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running via tray/overlay; quit only when user chooses Quit
  }
})
