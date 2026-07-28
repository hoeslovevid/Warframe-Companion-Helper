import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app, shell } from 'electron'

export type InstallKind = 'nsis' | 'portable' | 'appimage' | 'deb' | 'dev' | 'unknown'

export type UninstallInfo = {
  kind: InstallKind
  canLaunchUninstaller: boolean
  uninstallerPath: string | null
  installDir: string | null
  userDataPath: string
  /** Short user-facing summary of how to remove this install. */
  guidance: string
}

function findWindowsUninstaller(installDir: string): string | null {
  const product = app.getName()
  const names = [
    `Uninstall ${product}.exe`,
    'Uninstall Everything Warframe.exe',
    'uninstall.exe',
    'Uninstall.exe',
  ]

  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) continue
    seen.add(name)
    const full = path.join(installDir, name)
    if (fs.existsSync(full)) return full
  }

  try {
    for (const entry of fs.readdirSync(installDir)) {
      if (/^uninstall.*\.exe$/i.test(entry)) {
        return path.join(installDir, entry)
      }
    }
  } catch {
    // ignore
  }
  return null
}

export function getUninstallInfo(): UninstallInfo {
  const userDataPath = app.getPath('userData')

  if (!app.isPackaged) {
    return {
      kind: 'dev',
      canLaunchUninstaller: false,
      uninstallerPath: null,
      installDir: null,
      userDataPath,
      guidance:
        'This is a development build. Quit the app and stop `npm start` — there is nothing to uninstall.',
    }
  }

  if (process.platform === 'linux') {
    if (process.env.APPIMAGE) {
      return {
        kind: 'appimage',
        canLaunchUninstaller: false,
        uninstallerPath: null,
        installDir: path.dirname(process.env.APPIMAGE),
        userDataPath,
        guidance:
          'Delete the AppImage file, then optionally remove settings under ~/.local/share/Everything Warframe.',
      }
    }
    return {
      kind: 'deb',
      canLaunchUninstaller: false,
      uninstallerPath: null,
      installDir: path.dirname(process.execPath),
      userDataPath,
      guidance:
        'Remove with your package manager, e.g. `sudo apt remove everything-warframe`, then optionally delete ~/.local/share/Everything Warframe.',
    }
  }

  if (process.platform === 'win32') {
    const portable =
      Boolean(process.env.PORTABLE_EXECUTABLE_FILE) ||
      Boolean(process.env.PORTABLE_EXECUTABLE_DIR) ||
      Boolean(process.env.PORTABLE_EXECUTABLE_APP_PATH)

    const installDir = path.dirname(process.execPath)
    const uninstallerPath = portable ? null : findWindowsUninstaller(installDir)

    if (uninstallerPath) {
      return {
        kind: 'nsis',
        canLaunchUninstaller: true,
        uninstallerPath,
        installDir,
        userDataPath,
        guidance:
          'Use Uninstall below to run the Windows uninstaller (same as Apps & features). You can also clear settings with Delete data.',
      }
    }

    return {
      kind: portable ? 'portable' : 'unknown',
      canLaunchUninstaller: false,
      uninstallerPath: null,
      installDir,
      userDataPath,
      guidance: portable
        ? 'This is the portable build — delete the .exe when you quit. Optionally clear settings with Delete data.'
        : 'No installer was found. Remove the app folder manually, or open Windows Apps settings to uninstall if it appears there.',
    }
  }

  return {
    kind: 'unknown',
    canLaunchUninstaller: false,
    uninstallerPath: null,
    installDir: path.dirname(process.execPath),
    userDataPath,
    guidance: 'Quit the app and remove the install folder manually.',
  }
}

export async function openWindowsAppsSettings(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Windows Apps settings are only available on Windows.' }
  }
  try {
    await shell.openExternal('ms-settings:appsfeatures')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function openUserDataFolder(): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await shell.openPath(app.getPath('userData'))
    if (result) return { ok: false, error: result }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Launch the NSIS uninstaller (Windows Setup builds) and quit.
 * Falls back to Windows Apps settings when no uninstaller is present.
 */
export async function launchUninstaller(): Promise<{ ok: boolean; error?: string }> {
  const info = getUninstallInfo()

  if (info.uninstallerPath) {
    try {
      const child = spawn(info.uninstallerPath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.unref()
      setTimeout(() => app.quit(), 400)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  if (process.platform === 'win32') {
    return openWindowsAppsSettings()
  }

  return {
    ok: false,
    error: info.guidance,
  }
}

/**
 * Quit, then delete the userData folder (settings, caches, OCR data).
 * Does not remove the installed application itself.
 */
export function clearUserDataAndQuit(): { ok: boolean; error?: string } {
  const userData = app.getPath('userData')
  try {
    if (process.platform === 'win32') {
      const quoted = userData.replace(/"/g, '')
      const child = spawn(
        'cmd.exe',
        ['/d', '/c', `timeout /t 2 /nobreak >nul & rmdir /s /q "${quoted}"`],
        { detached: true, stdio: 'ignore', windowsHide: true },
      )
      child.unref()
    } else {
      const child = spawn(
        'sh',
        ['-c', `sleep 2; rm -rf ${JSON.stringify(userData)}`],
        { detached: true, stdio: 'ignore' },
      )
      child.unref()
    }
    setTimeout(() => app.quit(), 300)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
