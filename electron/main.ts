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
  shell,
} from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getAppIcon, getTrayIcon } from './app-icon'
import { createOverlayWindow, setOverlayClickThrough } from './overlay-window'
import { loadSettings, setModuleEnabled, updateSettings } from './settings'
import { setCaptureOverlayPause, warmScreenCapture } from './services/screen-capture'
import { disposePersistentCapture } from './services/persistent-screen-capture'
import { defaultRivenAnchor } from '../shared/captureGeometry'
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
  ackRelicCelebration,
  clearRelicScan,
  getRelicScanState,
  onRelicScanUpdated,
  scanRelicRewards,
  setRelicSquadSizeHint,
} from './services/relic-scanner'
import {
  clearRivenScan,
  getRivenScanState,
  onRivenScanUpdated,
  scanRivens,
} from './services/riven-scanner'
import { shutdownOcr } from './services/ocr'
import { getFoundryTree, listFoundryItems } from './services/foundry'
import {
  invalidateWarframeProcessCache,
  isWarframeForeground,
  isWarframeRunning,
} from './services/warframe-process'
import {
  checkForAppUpdates,
  getUpdateStatus,
  initAutoUpdater,
  quitAndInstallUpdate,
} from './services/updater'
import {
  AppSettings,
  FoundryListFilters,
  HotkeyRegistration,
  ModuleId,
  WorldstateSnapshot,
} from '../shared/types'

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
if (process.platform === 'linux') {
  // Helps transparent always-on-top overlay above Proton / borderless clients
  app.commandLine.appendSwitch('enable-transparent-visuals')
  // PipeWire capturer — needed for reliable Wayland screen share + restore tokens
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer')
  // Pure Wayland cannot pin always-on-top above games — use XWayland for the overlay.
  // Override with ELECTRON_OZONE_PLATFORM_HINT=wayland if needed.
  if (
    process.env.WAYLAND_DISPLAY &&
    !process.env.ELECTRON_OZONE_PLATFORM_HINT &&
    !app.commandLine.hasSwitch('ozone-platform')
  ) {
    app.commandLine.appendSwitch('ozone-platform', 'x11')
    console.info(
      '[Everything Warframe] Using X11/XWayland so the overlay can stay above Warframe',
    )
  }
}

const isDev = !app.isPackaged
const DEV_URL = 'http://127.0.0.1:5173'

let companionWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let worldstateCache: WorldstateSnapshot | null = null
let worldstateTimer: NodeJS.Timeout | null = null
let expiryTimer: NodeJS.Timeout | null = null
let inventorySyncTimer: NodeJS.Timeout | null = null
let lastExpiryRefresh = 0
let lastHotkeyStatus: HotkeyRegistration[] = []
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

async function runRelicScan(trigger: 'manual' | 'log', squadSize?: number | null) {
  const settings = loadSettings()
  if (!settings.modules.relics) {
    console.info('[Everything Warframe] Relic scan skipped — Relics module disabled')
    return getRelicScanState()
  }
  if (trigger === 'log') {
    invalidateWarframeProcessCache()
    const fg = await isWarframeForeground()
    const running = fg ? true : await isWarframeRunning()
    if (!running) {
      console.info('[Everything Warframe] Relic auto-scan skipped — Warframe not running')
      return getRelicScanState()
    }
  }
  if (!settings.overlayVisible) {
    const next = updateSettings({ overlayVisible: true })
    applyOverlayVisibility(true)
    broadcastSettings(next)
  }
  setRelicSquadSizeHint(squadSize ?? logWatcher.getSquadSizeHint())
  const state = await scanRelicRewards(trigger)
  broadcastRelicScan()
  if (state.rewards.length && !state.error) {
    if (settings.relicSoundEnabled) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('relics:sound')
      }
    }
    if (!settings.onboarding.firstRelicSuccessAck) {
      // celebration flag already on RelicScanState; companion listens
    }
  }
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

async function runRivenScan(trigger: 'manual' | 'log') {
  const settings = loadSettings()
  if (!settings.modules.rivens) {
    console.info('[Everything Warframe] Riven scan skipped — Rivens module disabled')
    return getRivenScanState()
  }
  if (trigger === 'log') {
    invalidateWarframeProcessCache()
    const fg = await isWarframeForeground()
    const running = fg ? true : await isWarframeRunning()
    // EE.log only advances while the game is up; require running, not strict focus
    // (focus checks are flaky under overlays / multi-monitor).
    if (!running) {
      console.info('[Everything Warframe] Riven auto-scan skipped — Warframe not running')
      return getRivenScanState()
    }
    if (!fg) {
      console.info(
        '[Everything Warframe] Riven auto-scan: Warframe running but not focused — scanning anyway',
      )
    }
  }
  if (!settings.overlayVisible) {
    const next = updateSettings({ overlayVisible: true })
    applyOverlayVisibility(true)
    broadcastSettings(next)
  }
  const state = await scanRivens(trigger)
  broadcastRivenScan()
  return state
}

function dismissRivenPopup() {
  const state = clearRivenScan()
  broadcastRivenScan()
  return state
}

function broadcastRivenScan() {
  const state = getRivenScanState()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('rivens:updated', state)
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
  try {
    worldstateCache = await fetchWorldstate()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Worldstate request failed'
    console.error('[Everything Warframe] Worldstate fetch failed', err)
    if (worldstateCache) {
      worldstateCache = {
        ...worldstateCache,
        error: message,
        stale: true,
      }
    } else {
      worldstateCache = {
        fetchedAt: '',
        error: message,
        stale: true,
        cycles: [],
        fissures: [],
        baro: null,
        nightwave: null,
        arbitration: null,
        invasions: [],
        archonHunt: null,
        deepArchimedea: null,
      }
    }
  }
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
    const settings = loadSettings()
    if (settings.quietMode && settings.onboarding.checklistDismissed) {
      companionWindow?.hide()
    } else {
      raiseCompanion()
    }
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

function restoreOverlayGeometry(win: BrowserWindow) {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.bounds
  try {
    win.setBounds({ x, y, width, height })
  } catch {
    // Wayland may ignore programmatic moves; best-effort.
  }
  try {
    win.setOpacity(1)
  } catch {
    // ignore
  }
  try {
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } catch {
    // ignore
  }
}

function refreshTrayUi() {
  if (!tray) return
  const on = loadSettings().overlayVisible
  try {
    tray.setToolTip(`Everything Warframe — Overlay ${on ? 'ON' : 'OFF'}`)
  } catch {
    // ignore
  }
  try {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Open Companion',
          click: () => createCompanionWindow(),
        },
        {
          label: on ? 'Overlay: ON (click to hide)' : 'Overlay: OFF (click to show)',
          click: () => setOverlayVisible(!loadSettings().overlayVisible, { announce: true }),
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
      ]),
    )
  } catch {
    // ignore
  }
}

function announceOverlayVisibility(visible: boolean) {
  try {
    shell.beep()
  } catch {
    // ignore
  }
  if (Notification.isSupported()) {
    try {
      const tip = new Notification({
        title: visible ? 'Overlay ON' : 'Overlay OFF',
        body: visible
          ? 'Everything Warframe overlay is visible over the game.'
          : 'Everything Warframe overlay is hidden.',
        silent: false,
      })
      tip.show()
    } catch {
      // ignore
    }
  }
  refreshTrayUi()
}

let hideOverlayTimer: NodeJS.Timeout | null = null

/** Central overlay show/hide. Pass announce for hotkey/tray toggles. */
function setOverlayVisible(visible: boolean, opts?: { announce?: boolean }) {
  const next = updateSettings({ overlayVisible: visible })
  applyOverlayVisibility(next.overlayVisible, {
    // Keep window up briefly so the on-screen OFF cue can paint.
    delayHideMs: opts?.announce && !visible ? 900 : 0,
  })
  broadcastSettings(next)
  if (opts?.announce) announceOverlayVisibility(next.overlayVisible)
  else refreshTrayUi()
  return next.overlayVisible
}

function applyOverlayVisibility(visible: boolean, opts?: { delayHideMs?: number }) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (hideOverlayTimer) {
    clearTimeout(hideOverlayTimer)
    hideOverlayTimer = null
  }
  if (visible) {
    applyOverlayPerformanceMode(true)
    restoreOverlayGeometry(overlayWindow)
    overlayWindow.showInactive()
    try {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    } catch {
      // ignore
    }
    // Re-raise companion so overlay creation/show never hides it
    if (companionWindow && !companionWindow.isDestroyed() && companionWindow.isVisible()) {
      raiseCompanion()
    }
    broadcastOverlayVisibility(visible)
    return
  }

  broadcastOverlayVisibility(visible)
  const hide = () => {
    hideOverlayTimer = null
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    // Skip hide if the user toggled back on during the cue delay.
    if (loadSettings().overlayVisible) return
    overlayWindow.hide()
    applyOverlayPerformanceMode(false)
  }
  const delay = opts?.delayHideMs ?? 0
  if (delay > 0) hideOverlayTimer = setTimeout(hide, delay)
  else hide()
}

/** Migrate old side-panel riven anchors to the horizontal strip above Cycle cards. */
function fixLegacyRivenAnchor() {
  const settings = loadSettings()
  const rivens = settings.panelAnchors.rivens
  if (!rivens) return
  const { width, height } = screen.getPrimaryDisplay().bounds
  const next = defaultRivenAnchor(width, height)
  const knownSidePanel =
    (rivens.x === 1460 && rivens.y === 290) ||
    (rivens.x === 1465 && rivens.y === 173) ||
    (rivens.x === 1555 && rivens.y === 167) ||
    (rivens.x === 1580 && rivens.y === 146)
  // Previous default sat beside the cards (far right, upper third).
  const looksLikeSidePanel = rivens.x > width * 0.55 && rivens.y < height * 0.4
  if (!knownSidePanel && !looksLikeSidePanel) return
  if (rivens.x === next.x && rivens.y === next.y) return
  updateSettings({
    panelAnchors: {
      ...settings.panelAnchors,
      rivens: next,
    },
  })
  console.info(
    `[Everything Warframe] Repositioned riven overlay above Cycle cards for ${width}×${height} → (${next.x}, ${next.y})`,
  )
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
  dismissRelics: ['Alt+Shift+D', 'F3'],
  scanRivens: ['Alt+Shift+G', 'F4', 'CommandOrControl+Alt+G'],
  dismissRivens: ['Alt+Shift+H', 'F6'],
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
  const status: HotkeyRegistration[] = []

  const bind = (
    id: keyof AppSettings['hotkeys'],
    handler: () => void,
  ) => {
    const requested = settings.hotkeys[id]
    const registered = registerOneHotkey(requested, HOTKEY_FALLBACKS[id], handler, id)
    status.push({ id, requested, registered, ok: Boolean(registered) })
    if (registered && registered !== requested) {
      nextHotkeys[id] = registered
      changed = true
    }
    return registered
  }

  bind('toggleOverlay', () => {
    setOverlayVisible(!loadSettings().overlayVisible, { announce: true })
  })
  bind('openCompanion', () => {
    createCompanionWindow()
  })
  bind('refreshWorldstate', () => {
    void refreshWorldstate(true)
  })
  bind('scanRelics', () => {
    void runRelicScan('manual')
  })
  bind('dismissRelics', () => {
    dismissRelicPopup()
  })
  bind('scanRivens', () => {
    void runRivenScan('manual')
  })
  bind('dismissRivens', () => {
    dismissRivenPopup()
  })
  bind('editLayout', () => {
    toggleLayoutEditMode()
  })

  lastHotkeyStatus = status

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
    refreshTrayUi()
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
    if (partial.overlayVisible !== undefined) {
      applyOverlayVisibility(next.overlayVisible)
      refreshTrayUi()
    }
    broadcastSettings(next)
    return next
  })
  ipcMain.handle('settings:setModule', (_e, id: ModuleId, enabled: boolean) => {
    const next = setModuleEnabled(id, enabled)
    broadcastSettings(next)
    if (enabled && process.platform === 'linux' && (id === 'relics' || id === 'rivens')) {
      void warmScreenCapture()
    }
    return next
  })
  ipcMain.handle('display:getPrimary', () => getPrimaryDisplayInfo())
  ipcMain.handle('worldstate:get', async () => refreshWorldstate(false))
  ipcMain.handle('worldstate:refresh', async () => refreshWorldstate(true))
  ipcMain.handle('overlay:toggle', () => {
    return setOverlayVisible(!loadSettings().overlayVisible, { announce: true })
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
  ipcMain.handle('relics:ackCelebration', () => {
    const state = ackRelicCelebration()
    broadcastRelicScan()
    const settings = loadSettings()
    if (!settings.onboarding.firstRelicSuccessAck) {
      const next = updateSettings({
        onboarding: { ...settings.onboarding, firstRelicSuccessAck: true },
      })
      broadcastSettings(next)
    }
    return state
  })
  ipcMain.handle('rivens:get', () => getRivenScanState())
  ipcMain.handle('rivens:scan', async () => runRivenScan('manual'))
  ipcMain.handle('rivens:clear', () => dismissRivenPopup())
  ipcMain.handle('foundry:list', async (_e, filters?: FoundryListFilters) =>
    listFoundryItems(filters || {}),
  )
  ipcMain.handle('foundry:tree', async (_e, uniqueName: string) => getFoundryTree(uniqueName || ''))
  ipcMain.handle('hotkeys:status', () => lastHotkeyStatus)
  ipcMain.handle('app:version', () => app.getVersion())
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
  setCaptureOverlayPause(() => {
    const win = overlayWindow
    if (!win || win.isDestroyed()) return () => {}
    const wasVisible = win.isVisible()
    let prevOpacity = 1
    try {
      prevOpacity = win.getOpacity()
      win.setOpacity(0)
    } catch {
      // ignore
    }
    try {
      win.setContentProtection(true)
    } catch {
      // ignore
    }
    // Windows: park off-screen so sticky capture APIs cannot sample overlay pixels.
    // Linux/Wayland: setBounds is unreliable and can leave the overlay "stuck" off-screen.
    const parkOffscreen = process.platform === 'win32'
    const bounds = win.getBounds()
    if (parkOffscreen) {
      try {
        win.setBounds({ ...bounds, x: -10_000, y: -10_000 })
      } catch {
        // ignore
      }
    }
    win.hide()
    return () => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return
      try {
        if (parkOffscreen) {
          overlayWindow.setBounds(bounds)
        } else {
          restoreOverlayGeometry(overlayWindow)
        }
        overlayWindow.setOpacity(prevOpacity > 0 ? prevOpacity : 1)
        overlayWindow.setContentProtection(true)
      } catch {
        // ignore
      }
      if (wasVisible && loadSettings().overlayVisible) {
        restoreOverlayGeometry(overlayWindow)
        overlayWindow.showInactive()
        try {
          overlayWindow.setAlwaysOnTop(true, 'screen-saver')
        } catch {
          // ignore
        }
      }
    }
  })
  fixLegacyRivenAnchor()
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
  onRivenScanUpdated(() => broadcastRivenScan())

  const bindEeLog = (reason: string) => {
    const eePath = loadSettings().eeLogPath || detectEeLogPath()
    if (eePath) {
      if (!loadSettings().eeLogPath) updateSettings({ eeLogPath: eePath })
      logWatcher.setPath(eePath)
      console.info(`[Everything Warframe] EE.log watcher bound (${reason}): ${eePath}`)
      return true
    }
    logWatcher.setPath(null)
    console.warn(`[Everything Warframe] EE.log watcher unbound (${reason}) — auto-scan off`)
    return false
  }
  bindEeLog('startup')
  // Proton prefixes appear after the first launch; keep trying on Linux.
  if (process.platform === 'linux') {
    setInterval(() => {
      if (loadSettings().eeLogPath && fs.existsSync(loadSettings().eeLogPath)) return
      bindEeLog('periodic-redetect')
    }, 45_000)
  }
  logWatcher.on('event', (event) => {
    if (event.type === 'relic_rewards') {
      if (!loadSettings().modules.relics) return
      console.info(
        `[Everything Warframe] EE.log relic rewards detected — scanning` +
          (event.squadSize ? ` (squad≈${event.squadSize})` : ''),
      )
      void runRelicScan('log', event.squadSize)
    } else if (event.type === 'relic_rewards_end') {
      console.info('[Everything Warframe] EE.log relic rewards ended — dismissing popup')
      dismissRelicPopup()
    } else if (event.type === 'riven_reroll') {
      if (!loadSettings().modules.rivens) return
      console.info('[Everything Warframe] EE.log riven reroll detected — scanning')
      void runRivenScan('log')
    } else if (event.type === 'riven_reroll_end') {
      // Ignore while a scan is in flight (false end markers used to wipe mid-OCR).
      if (getRivenScanState().scanning) {
        console.info('[Everything Warframe] EE.log riven end ignored — scan in progress')
        return
      }
      console.info('[Everything Warframe] EE.log riven reroll ended — dismissing popup')
      dismissRivenPopup()
    }
  })
  // Faster poll on Linux — Wine/Proton log flushes are bursty around reward screens.
  logWatcher.start(process.platform === 'linux' ? 800 : 1500)

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

  // Linux/Wayland: keep one PipeWire share session alive so OCR does not re-prompt.
  if (
    process.platform === 'linux' &&
    (loadSettings().modules.relics || loadSettings().modules.rivens)
  ) {
    setTimeout(() => {
      void warmScreenCapture()
    }, 1500)
  }

  worldstateTimer = setInterval(() => {
    void refreshWorldstate(true).catch((err) => console.error(err))
  }, 60_000)

  expiryTimer = setInterval(() => checkWorldstateExpiries(), 2000)

  inventorySyncTimer = setInterval(() => {
    void (async () => {
      const settings = loadSettings()
      if (!settings.inventoryAutoSync || !settings.inventoryConsent) return
      const running = await isWarframeRunning()
      if (!running) return
      try {
        await syncInventoryFromGame()
        broadcastInventory()
        broadcastSettings(loadSettings())
      } catch {
        // quiet
      }
    })()
  }, 10 * 60_000)

  applyOverlayPerformanceMode(loadSettings().overlayVisible)

  app.on('activate', () => {
    createCompanionWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  logWatcher.stop()
  if (worldstateTimer) clearInterval(worldstateTimer)
  if (inventorySyncTimer) clearInterval(inventorySyncTimer)
  if (expiryTimer) clearInterval(expiryTimer)
  disposePersistentCapture()
  void shutdownOcr()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running via tray/overlay; quit only when user chooses Quit
  }
})
