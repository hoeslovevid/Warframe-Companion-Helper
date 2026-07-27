import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

function xdgDataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
}

function xdgConfigHome() {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
}

function xdgCacheHome() {
  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
}

function dirHasData(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) return false
    return fs.readdirSync(dir).length > 0
  } catch {
    return false
  }
}

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(from, to)
    } else if (entry.isFile() && !fs.existsSync(to)) {
      fs.copyFileSync(from, to)
    }
  }
}

/**
 * Electron defaults `userData` to `~/.config/<name>` on Linux. That folder is for
 * small config files — catalogs, Chromium session data, OCR caches, and price DBs
 * do not belong there. Some AppImage / constrained home setups also refuse large
 * writes under config.
 *
 * Move durable app state to XDG_DATA_HOME (~/.local/share) and Chromium's cache
 * root to XDG_CACHE_HOME (~/.cache). Migrate any existing ~/.config copy once.
 */
export function configureLinuxStoragePaths() {
  if (process.platform !== 'linux') return

  const name = app.getName()
  const dataDir = path.join(xdgDataHome(), name)
  fs.mkdirSync(dataDir, { recursive: true })

  if (!dirHasData(dataDir)) {
    const legacyNames = [...new Set([name, 'Everything Warframe', 'everything-warframe', 'voidlens'])]
    for (const legacy of legacyNames) {
      const oldDir = path.join(xdgConfigHome(), legacy)
      if (path.resolve(oldDir) === path.resolve(dataDir)) continue
      if (!dirHasData(oldDir)) continue
      try {
        console.info(`[Everything Warframe] Migrating Linux data:\n  ${oldDir}\n  → ${dataDir}`)
        copyDirRecursive(oldDir, dataDir)
        break
      } catch (err) {
        console.warn('[Everything Warframe] Linux data migration failed', err)
      }
    }
  }

  app.setPath('userData', dataDir)
  try {
    app.setPath('sessionData', dataDir)
  } catch {
    // Electron version without sessionData path
  }

  const cacheDir = path.join(xdgCacheHome(), name)
  fs.mkdirSync(cacheDir, { recursive: true })
  try {
    app.setPath('cache', cacheDir)
  } catch {
    // ignore
  }

  console.info(`[Everything Warframe] Linux userData → ${dataDir}`)
  console.info(`[Everything Warframe] Linux cache → ${cacheDir}`)
  if (process.env.APPIMAGE) {
    console.info(`[Everything Warframe] AppImage → ${process.env.APPIMAGE}`)
  }
}

/** Writable dir for large downloaded catalogs / price DBs (never the AppImage mount). */
export function appWritableCacheDir() {
  return path.join(app.getPath('userData'), 'cache')
}
