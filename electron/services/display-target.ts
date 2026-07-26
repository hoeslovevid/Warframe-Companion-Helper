import { screen } from 'electron'
import type { DisplayChoice, PrimaryDisplayInfo } from '../../shared/types'
import { loadSettings } from '../settings'

/** Display used for OCR capture and overlay placement. */
export function resolveOcrDisplay(): Electron.Display {
  const settings = loadSettings()
  const id = settings.ocrDisplayId
  if (id != null) {
    const found = screen.getAllDisplays().find((d) => d.id === id)
    if (found) return found
  }
  return screen.getPrimaryDisplay()
}

export function listDisplayChoices(): DisplayChoice[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label?.trim() || `Display ${i + 1}`,
    width: d.bounds.width,
    height: d.bounds.height,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === primaryId,
  }))
}

export function getOcrDisplayInfo(): PrimaryDisplayInfo {
  const display = resolveOcrDisplay()
  const primaryId = screen.getPrimaryDisplay().id
  return {
    id: display.id,
    label: display.label?.trim() || undefined,
    width: display.bounds.width,
    height: display.bounds.height,
    scaleFactor: display.scaleFactor,
    isPrimary: display.id === primaryId,
  }
}
