import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { AppSettings, DEFAULT_SETTINGS, ModuleId } from '../shared/types'

let cache: AppSettings | null = null

function settingsPath() {
  return path.join(app.getPath('userData'), 'voidlens-settings.json')
}

function mergeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const base = structuredClone(DEFAULT_SETTINGS)
  if (!raw) return base

  return {
    ...base,
    ...raw,
    modules: { ...base.modules, ...(raw.modules ?? {}) },
    panelAnchors: { ...base.panelAnchors, ...(raw.panelAnchors ?? {}) },
    hotkeys: {
      ...base.hotkeys,
      ...(raw.hotkeys ?? {}),
      scanRelics: raw.hotkeys?.scanRelics || base.hotkeys.scanRelics,
      editLayout: raw.hotkeys?.editLayout || base.hotkeys.editLayout,
    },
    fissureTiers: raw.fissureTiers ?? base.fissureTiers,
    inventorySource: raw.inventorySource ?? base.inventorySource,
    inventoryConsent: raw.inventoryConsent ?? base.inventoryConsent,
    inventoryLastSynced: raw.inventoryLastSynced ?? base.inventoryLastSynced,
    overlayScale:
      typeof raw.overlayScale === 'number' && Number.isFinite(raw.overlayScale)
        ? Math.min(1.5, Math.max(0.75, raw.overlayScale))
        : base.overlayScale,
    overlayDragHintDismissed: raw.overlayDragHintDismissed ?? base.overlayDragHintDismissed,
    onboarding: {
      ...base.onboarding,
      ...(raw.onboarding ?? {}),
    },
  }
}

export function loadSettings(): AppSettings {
  if (cache) return cache
  try {
    const file = settingsPath()
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppSettings>
      cache = mergeSettings(parsed)
      return cache
    }
  } catch (err) {
    console.error('Failed to load settings', err)
  }
  cache = structuredClone(DEFAULT_SETTINGS)
  return cache
}

export function saveSettings(next: AppSettings): AppSettings {
  cache = next
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to save settings', err)
  }
  return cache
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const next = mergeSettings({
    ...current,
    ...partial,
    modules: { ...current.modules, ...(partial.modules ?? {}) },
    panelAnchors: { ...current.panelAnchors, ...(partial.panelAnchors ?? {}) },
    hotkeys: { ...current.hotkeys, ...(partial.hotkeys ?? {}) },
    onboarding: {
      ...current.onboarding,
      ...(partial.onboarding ?? {}),
    },
  })
  return saveSettings(next)
}

export function setModuleEnabled(id: ModuleId, enabled: boolean): AppSettings {
  const current = loadSettings()
  return updateSettings({
    modules: { ...current.modules, [id]: enabled },
  })
}
