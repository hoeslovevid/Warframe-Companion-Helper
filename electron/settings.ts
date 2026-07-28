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
  // One-time upgrade: original centered default sat on the Cycle cards.
  const legacyRivens = raw.panelAnchors?.rivens
  if (
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
    // Empty array would hide every fissure — treat as unset and restore defaults.
    fissureTiers:
      Array.isArray(raw.fissureTiers) && raw.fissureTiers.length > 0
        ? raw.fissureTiers
        : base.fissureTiers,
    fissurePathMode: (() => {
      const mode = (raw as { fissurePathMode?: string }).fissurePathMode
      if (mode === 'normal' || mode === 'steel' || mode === 'both') return mode
      // Migrate legacy boolean: false → normal only, true/missing → both
      if ((raw as { fissureShowSteelPath?: boolean }).fissureShowSteelPath === false) {
        return 'normal' as const
      }
      return base.fissurePathMode
    })(),
    fissureShowStorms:
      typeof (raw as { fissureShowStorms?: boolean }).fissureShowStorms === 'boolean'
        ? (raw as { fissureShowStorms: boolean }).fissureShowStorms
        : base.fissureShowStorms,
    fissureSort: raw.fissureSort ?? base.fissureSort,
    ocrDisplayId: (() => {
      const id = (raw as { ocrDisplayId?: number | null }).ocrDisplayId
      if (id === null || id === undefined) return base.ocrDisplayId
      return typeof id === 'number' && Number.isFinite(id) ? id : base.ocrDisplayId
    })(),
    wfThemeOverride: (() => {
      const v = (raw as { wfThemeOverride?: string | null }).wfThemeOverride
      if (v == null || v === '') return null
      const ok = [
        'Vitruvian',
        'Stalker',
        'Baruuk',
        'Corpus',
        'Fortuna',
        'Grineer',
        'Lotus',
        'Nidus',
        'Orokin',
        'Tenno',
        'HighContrast',
        'Legacy',
        'Equinox',
        'DarkLotus',
        'Zephyr',
      ]
      return ok.includes(v) ? (v as AppSettings['wfThemeOverride']) : null
    })(),
    relicSquadSizeOverride: (() => {
      const v = (raw as { relicSquadSizeOverride?: number | null }).relicSquadSizeOverride
      if (v === 3 || v === 4) return v
      return null
    })(),
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
    rivenSoundEnabled: raw.rivenSoundEnabled ?? base.rivenSoundEnabled,
    soundPack:
      raw.soundPack === 'soft' ||
      raw.soundPack === 'bright' ||
      raw.soundPack === 'double' ||
      raw.soundPack === 'low'
        ? raw.soundPack
        : base.soundPack,
    activePlayProfile:
      typeof (raw as { activePlayProfile?: string | null }).activePlayProfile === 'string'
        ? (raw as { activePlayProfile: string }).activePlayProfile
        : (raw as { activePlayProfile?: null }).activePlayProfile === null
          ? null
          : base.activePlayProfile,
    marketWatchlist: Array.isArray(raw.marketWatchlist)
      ? raw.marketWatchlist.filter((x): x is string => typeof x === 'string')
      : base.marketWatchlist,
    widgetServerEnabled: raw.widgetServerEnabled ?? base.widgetServerEnabled,
    widgetServerPort:
      typeof raw.widgetServerPort === 'number' &&
      Number.isFinite(raw.widgetServerPort) &&
      raw.widgetServerPort > 0 &&
      raw.widgetServerPort < 65536
        ? Math.floor(raw.widgetServerPort)
        : base.widgetServerPort,
    quietMode: raw.quietMode ?? base.quietMode,
    overlayOnlyInWarframe:
      typeof (raw as { overlayOnlyInWarframe?: boolean }).overlayOnlyInWarframe === 'boolean'
        ? (raw as { overlayOnlyInWarframe: boolean }).overlayOnlyInWarframe
        : base.overlayOnlyInWarframe,
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
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
    console.error(
      `[Everything Warframe] Failed to save settings to ${settingsPath()}` +
        (code ? ` (${code})` : ''),
      err,
    )
    if (code === 'EROFS' || code === 'EACCES') {
      console.error(
        '[Everything Warframe] Settings path is not writable. On Linux AppImage, data must live under ~/.local/share — not inside the .AppImage mount.',
      )
    }
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
