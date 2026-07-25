import { app, nativeImage, NativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

function candidatePaths(filename: string): string[] {
  const roots = [
    path.join(__dirname, '../resources'),
    path.join(process.cwd(), 'resources'),
    path.join(app.getAppPath(), 'resources'),
  ]
  if (process.resourcesPath) {
    roots.push(path.join(process.resourcesPath, 'resources'))
    roots.push(process.resourcesPath)
  }
  return roots.map((root) => path.join(root, filename))
}

function loadPng(filename: string): NativeImage | null {
  for (const file of candidatePaths(filename)) {
    try {
      if (!fs.existsSync(file)) continue
      const img = nativeImage.createFromPath(file)
      if (!img.isEmpty()) return img
    } catch {
      // try next path
    }
  }
  return null
}

/** Full app icon for window title bars / taskbar. */
export function getAppIcon(): NativeImage {
  return (
    loadPng('icon-256.png') ||
    loadPng('icon.png') ||
    nativeImage.createEmpty()
  )
}

/** High-contrast tray glyph (Windows notification area). */
export function getTrayIcon(): NativeImage {
  const tray = loadPng('tray.png')
  if (tray && !tray.isEmpty()) {
    // Windows tray prefers ~16–32px; keep crisp resize from 32px source
    const { width } = tray.getSize()
    if (width > 32) return tray.resize({ width: 32, height: 32 })
    return tray
  }

  const fallback = getAppIcon()
  if (!fallback.isEmpty()) {
    return fallback.resize({ width: 32, height: 32 })
  }
  return nativeImage.createEmpty()
}
