import { app, BrowserWindow } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { AppUpdateStatus } from '../../shared/types'

type Listener = (status: AppUpdateStatus) => void

const listeners = new Set<Listener>()

let status: AppUpdateStatus = {
  supported: false,
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  currentVersion: app.getVersion(),
  latestVersion: null,
  progress: 0,
  error: null,
  message: 'Updates are available in packaged builds.',
}

function emit() {
  for (const cb of listeners) cb({ ...status })
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:status', { ...status })
  }
}

function setStatus(partial: Partial<AppUpdateStatus>) {
  status = { ...status, ...partial, currentVersion: app.getVersion() }
  emit()
}

export function getUpdateStatus(): AppUpdateStatus {
  return { ...status, currentVersion: app.getVersion() }
}

export function onUpdateStatus(cb: Listener) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function initAutoUpdater() {
  status.currentVersion = app.getVersion()

  if (!app.isPackaged) {
    setStatus({
      supported: false,
      message: 'Auto-update runs in installed builds. Dev mode uses npm start.',
    })
    return
  }

  setStatus({
    supported: true,
    message: 'Checking for updates…',
  })

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => {
    setStatus({
      checking: true,
      error: null,
      message: 'Checking GitHub Releases for updates…',
    })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setStatus({
      checking: false,
      available: true,
      latestVersion: info.version,
      downloading: true,
      message: `Update ${info.version} found — downloading…`,
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    setStatus({
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      latestVersion: info.version,
      progress: 0,
      message: `You're on the latest version (${info.version}).`,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      downloading: true,
      progress: Math.round(progress.percent),
      message: `Downloading update… ${Math.round(progress.percent)}%`,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setStatus({
      checking: false,
      available: true,
      downloading: false,
      downloaded: true,
      latestVersion: info.version,
      progress: 100,
      message: `Update ${info.version} ready. Restart to install.`,
    })
  })

  autoUpdater.on('error', (err) => {
    setStatus({
      checking: false,
      downloading: false,
      error: err?.message || String(err),
      message: 'Update check failed.',
    })
  })

  // Initial check shortly after launch
  setTimeout(() => {
    void checkForAppUpdates()
  }, 5000)

  // Periodic check every 4 hours
  setInterval(
    () => {
      void checkForAppUpdates()
    },
    4 * 60 * 60 * 1000,
  )
}

export async function checkForAppUpdates(): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    setStatus({
      supported: false,
      message: 'Auto-update runs in installed builds only.',
    })
    return getUpdateStatus()
  }

  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    setStatus({
      checking: false,
      error: err instanceof Error ? err.message : String(err),
      message: 'Update check failed.',
    })
  }
  return getUpdateStatus()
}

export function quitAndInstallUpdate(): boolean {
  if (!status.downloaded) return false
  autoUpdater.quitAndInstall(false, true)
  return true
}
