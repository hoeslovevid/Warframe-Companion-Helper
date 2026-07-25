import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import {
  AppSettings,
  ColorThemeId,
  CustomPalette,
  DEFAULT_CUSTOM_PALETTE,
  DEFAULT_SETTINGS,
  ModuleId,
  OVERLAY_MODULE_IDS,
} from '../shared/types'

const COLOR_THEMES: ColorThemeId[] = [
  'void',
  'ember',
  'glacier',
  'obsidian',
  'snow',
  'parchment',
  'mist',
  'harbor',
  'custom',
]

const HEX_RE = /^#?[0-9a-fA-F]{6}$/

function mergeCustomPalette(
  raw: Partial<CustomPalette> | null | undefined,
  fallback: CustomPalette = DEFAULT_CUSTOM_PALETTE,
): CustomPalette {
  const normalize = (value: unknown, fb: string) => {
    if (typeof value !== 'string' || !HEX_RE.test(value.trim())) return fb
    const hex = value.trim()
    return hex.startsWith('#') ? hex.toLowerCase() : `#${hex.toLowerCase()}`
  }
  return {
    mode: raw?.mode === 'light' ? 'light' : 'dark',
    background: normalize(raw?.background, fallback.background),
    text: normalize(raw?.text, fallback.text),
    muted: normalize(raw?.muted, fallback.muted),
    accentA: normalize(raw?.accentA, fallback.accentA),
    accentB: normalize(raw?.accentB, fallback.accentB),
  }
}

let cache: AppSettings | null = null

function settingsPath() {
  return path.join(app.getPath('userData'), 'voidlens-settings.json')
}

function clampOpacity(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0.4, value))
}

function mergeModuleOpacity(
  raw: Partial<AppSettings> | null | undefined,
  base: AppSettings,
): AppSettings['moduleOpacity'] {
  const fallback = clampOpacity(raw?.opacity, base.opacity)
  const next: AppSettings['moduleOpacity'] = { ...base.moduleOpacity }
  for (const id of OVERLAY_MODULE_IDS) {
    next[id] = fallback
  }
  const fromFile = raw?.moduleOpacity
  if (fromFile && typeof fromFile === 'object') {
    for (const id of OVERLAY_MODULE_IDS) {
      if (id in fromFile) {
        next[id] = clampOpacity(fromFile[id], fallback)
      }
    }
  }
  return next
}

function mergeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const base = structuredClone(DEFAULT_SETTINGS)
  if (!raw) return base

  const panelAnchors = { ...base.panelAnchors, ...(raw.panelAnchors ?? {}) }
  // One-time upgrade: old default sat on the Cycle cards; move beside them when
  // migrating settings that predate per-module opacity.
  const legacyRivens = raw.panelAnchors?.rivens
  if (
    !('moduleOpacity' in raw) &&
    legacyRivens &&
    legacyRivens.x === 480 &&
    legacyRivens.y === 200 &&
    base.panelAnchors.rivens
  ) {
    panelAnchors.rivens = { ...base.panelAnchors.rivens }
  }

  return {
    ...base,
    ...raw,
    modules: { ...base.modules, ...(raw.modules ?? {}) },
    panelAnchors,
    opacity: clampOpacity(raw.opacity, base.opacity),
    moduleOpacity: mergeModuleOpacity(raw, base),
    hotkeys: {
      ...base.hotkeys,
      ...(raw.hotkeys ?? {}),
      scanRelics: raw.hotkeys?.scanRelics || base.hotkeys.scanRelics,
      dismissRelics: raw.hotkeys?.dismissRelics || base.hotkeys.dismissRelics,
      scanRivens: raw.hotkeys?.scanRivens || base.hotkeys.scanRivens,
      dismissRivens: raw.hotkeys?.dismissRivens || base.hotkeys.dismissRivens,
      editLayout: raw.hotkeys?.editLayout || base.hotkeys.editLayout,
    },
    fissureTiers: raw.fissureTiers ?? base.fissureTiers,
    fissureShowSteelPath: raw.fissureShowSteelPath ?? base.fissureShowSteelPath,
    fissureSort: raw.fissureSort ?? base.fissureSort,
    inventorySource: raw.inventorySource ?? base.inventorySource,
    inventoryConsent: raw.inventoryConsent ?? base.inventoryConsent,
    inventoryLastSynced: raw.inventoryLastSynced ?? base.inventoryLastSynced,
    overlayScale:
      typeof raw.overlayScale === 'number' && Number.isFinite(raw.overlayScale)
        ? Math.min(1.5, Math.max(0.75, raw.overlayScale))
        : base.overlayScale,
    colorTheme:
      raw.colorTheme && COLOR_THEMES.includes(raw.colorTheme as ColorThemeId)
        ? (raw.colorTheme as ColorThemeId)
        : base.colorTheme,
    customPalette: mergeCustomPalette(raw.customPalette, base.customPalette),
    overlayDragHintDismissed: raw.overlayDragHintDismissed ?? base.overlayDragHintDismissed,
    baroWishlist: Array.isArray(raw.baroWishlist) ? raw.baroWishlist : base.baroWishlist,
    nightwaveDoneIds: Array.isArray(raw.nightwaveDoneIds)
      ? raw.nightwaveDoneIds
      : base.nightwaveDoneIds,
    relicSoundEnabled: raw.relicSoundEnabled ?? base.relicSoundEnabled,
    quietMode: raw.quietMode ?? base.quietMode,
    inventoryAutoSync: raw.inventoryAutoSync ?? base.inventoryAutoSync,
    lastSeenVersion: raw.lastSeenVersion ?? base.lastSeenVersion,
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
    moduleOpacity: { ...current.moduleOpacity, ...(partial.moduleOpacity ?? {}) },
    customPalette: {
      ...current.customPalette,
      ...(partial.customPalette ?? {}),
    },
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
