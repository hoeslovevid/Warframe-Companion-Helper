import {
  COLOR_THEME_META,
  ColorThemeId,
  CustomPalette,
  DEFAULT_CUSTOM_PALETTE,
  DEFAULT_SETTINGS,
  PRESET_PALETTE_SEEDS,
  PresetColorThemeId,
} from '../../shared/types'

type Rgb = { r: number; g: number; b: number }

const HEX_RE = /^#?([0-9a-f]{6})$/i

/** CSS custom properties written for the Custom theme (cleared when leaving it). */
export const CUSTOM_THEME_VARS = [
  '--vl-void-950',
  '--vl-void-900',
  '--vl-void-850',
  '--vl-void-800',
  '--vl-void-700',
  '--vl-mist',
  '--vl-mist-dim',
  '--vl-frost',
  '--vl-gold',
  '--vl-gold-soft',
  '--vl-gold-deep',
  '--vl-teal',
  '--vl-teal-bright',
  '--vl-teal-dim',
  '--vl-danger',
  '--vl-ok',
  '--vl-warn',
  '--vl-panel',
  '--vl-panel-solid',
  '--vl-panel-border',
  '--vl-panel-glow',
  '--vl-shadow',
  '--vl-shadow-soft',
  '--vl-scroll-track',
  '--vl-scroll-thumb',
  '--vl-scroll-thumb-hover',
  '--vl-bg-spot-1',
  '--vl-bg-spot-2',
  '--vl-bg-spot-3',
  '--vl-bg-base-a',
  '--vl-bg-base-b',
  '--vl-bg-base-c',
  '--vl-nav-bg-a',
  '--vl-nav-bg-b',
  '--vl-nav-border',
  '--vl-surface',
  '--vl-surface-border',
  '--vl-input-bg',
  '--vl-input-border',
  '--vl-btn-bg-a',
  '--vl-btn-bg-b',
  '--vl-btn-border',
  '--vl-btn-primary-a',
  '--vl-btn-primary-b',
  '--vl-btn-primary-border',
  '--vl-btn-ghost-bg',
  '--vl-nav-hover',
  '--vl-nav-active-a',
  '--vl-nav-active-b',
  '--vl-nav-active-border',
  '--vl-grid-line',
  '--vl-title-grad-a',
  '--vl-title-grad-b',
] as const

export function normalizeHex(value: string, fallback: string): string {
  const m = HEX_RE.exec((value || '').trim())
  if (!m) return normalizeHex(fallback, '#000000')
  return `#${m[1].toLowerCase()}`
}

function parseHex(hex: string): Rgb {
  const n = normalizeHex(hex, '#000000').slice(1)
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  }
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => clampByte(c).toString(16).padStart(2, '0')).join('')}`
}

function toRgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function mix(a: string, b: string, t: number): string {
  const A = parseHex(a)
  const B = parseHex(b)
  const k = Math.max(0, Math.min(1, t))
  return toHex({
    r: A.r + (B.r - A.r) * k,
    g: A.g + (B.g - A.g) * k,
    b: A.b + (B.b - A.b) * k,
  })
}

function normalizePalette(raw?: Partial<CustomPalette> | null): CustomPalette {
  const base = DEFAULT_CUSTOM_PALETTE
  return {
    mode: raw?.mode === 'light' ? 'light' : 'dark',
    background: normalizeHex(raw?.background || base.background, base.background),
    text: normalizeHex(raw?.text || base.text, base.text),
    muted: normalizeHex(raw?.muted || base.muted, base.muted),
    accentA: normalizeHex(raw?.accentA || base.accentA, base.accentA),
    accentB: normalizeHex(raw?.accentB || base.accentB, base.accentB),
  }
}

export function mergeCustomPalette(
  raw?: Partial<CustomPalette> | null,
  fallback: CustomPalette = DEFAULT_CUSTOM_PALETTE,
): CustomPalette {
  return normalizePalette({ ...fallback, ...(raw ?? {}) })
}

/** Expand seed colors into the full `--vl-*` token set. */
export function deriveCustomThemeVars(paletteInput?: Partial<CustomPalette> | null): Record<string, string> {
  const p = normalizePalette(paletteInput)
  const bg = p.background
  const text = p.text
  const muted = p.muted
  const accentA = p.accentA
  const accentB = p.accentB
  const dark = p.mode === 'dark'

  const void950 = dark ? mix(bg, '#000000', 0.45) : mix(bg, muted, 0.35)
  const void900 = bg
  const void850 = dark ? mix(bg, '#ffffff', 0.06) : mix(bg, '#ffffff', 0.55)
  const void800 = dark ? mix(bg, '#ffffff', 0.12) : mix(bg, muted, 0.12)
  const void700 = dark ? mix(bg, '#ffffff', 0.2) : mix(bg, muted, 0.22)
  const goldSoft = mix(accentA, dark ? '#ffffff' : '#000000', dark ? 0.22 : 0.12)
  const goldDeep = mix(accentA, '#000000', 0.28)
  const teal = mix(accentB, accentA, 0.18)
  const mistDim = mix(muted, bg, dark ? 0.35 : 0.2)

  return {
    '--vl-void-950': void950,
    '--vl-void-900': void900,
    '--vl-void-850': void850,
    '--vl-void-800': void800,
    '--vl-void-700': void700,
    '--vl-mist': muted,
    '--vl-mist-dim': mistDim,
    '--vl-frost': text,
    '--vl-gold': accentA,
    '--vl-gold-soft': goldSoft,
    '--vl-gold-deep': goldDeep,
    '--vl-teal': teal,
    '--vl-teal-bright': accentB,
    '--vl-teal-dim': toRgba(accentB, dark ? 0.14 : 0.1),
    '--vl-danger': dark ? '#c25f5f' : '#b0444c',
    '--vl-ok': dark ? '#5faa78' : '#2f8a5c',
    '--vl-warn': goldSoft,
    '--vl-panel': toRgba(void900, dark ? 0.9 : 0.92),
    '--vl-panel-solid': toRgba(mix(void900, dark ? '#000000' : '#ffffff', 0.15), dark ? 0.97 : 0.98),
    '--vl-panel-border': toRgba(accentA, 0.28),
    '--vl-panel-glow': toRgba(accentB, dark ? 0.07 : 0.06),
    '--vl-shadow': dark
      ? '0 18px 50px rgba(0, 0, 0, 0.55)'
      : `0 16px 40px ${toRgba(mix(text, muted, 0.5), 0.12)}`,
    '--vl-shadow-soft': dark
      ? '0 8px 24px rgba(0, 0, 0, 0.38)'
      : `0 6px 18px ${toRgba(mix(text, muted, 0.5), 0.08)}`,
    '--vl-scroll-track': toRgba(void950, dark ? 0.45 : 0.7),
    '--vl-scroll-thumb': toRgba(accentA, 0.32),
    '--vl-scroll-thumb-hover': toRgba(accentB, 0.48),
    '--vl-bg-spot-1': toRgba(accentB, dark ? 0.1 : 0.08),
    '--vl-bg-spot-2': toRgba(accentA, dark ? 0.08 : 0.06),
    '--vl-bg-spot-3': toRgba(void850, dark ? 0.7 : 0.55),
    '--vl-bg-base-a': mix(void900, void850, 0.35),
    '--vl-bg-base-b': void900,
    '--vl-bg-base-c': void950,
    '--vl-nav-bg-a': toRgba(void950, dark ? 0.88 : 0.95),
    '--vl-nav-bg-b': toRgba(void900, dark ? 0.72 : 0.92),
    '--vl-nav-border': toRgba(muted, dark ? 0.08 : 0.1),
    '--vl-surface': toRgba(void850, dark ? 0.55 : 0.8),
    '--vl-surface-border': toRgba(muted, dark ? 0.14 : 0.12),
    '--vl-input-bg': toRgba(void950, dark ? 0.65 : 0.95),
    '--vl-input-border': toRgba(muted, dark ? 0.16 : 0.16),
    '--vl-btn-bg-a': toRgba(void800, dark ? 0.96 : 0.98),
    '--vl-btn-bg-b': toRgba(void900, dark ? 0.98 : 0.98),
    '--vl-btn-border': toRgba(accentA, 0.3),
    '--vl-btn-primary-a': toRgba(accentB, dark ? 0.22 : 0.16),
    '--vl-btn-primary-b': toRgba(void900, dark ? 0.97 : 0.96),
    '--vl-btn-primary-border': toRgba(accentB, 0.46),
    '--vl-btn-ghost-bg': toRgba(void950, dark ? 0.4 : 0.5),
    '--vl-nav-hover': toRgba(void800, dark ? 0.75 : 0.95),
    '--vl-nav-active-a': toRgba(accentB, 0.12),
    '--vl-nav-active-b': toRgba(accentB, 0.03),
    '--vl-nav-active-border': toRgba(accentB, 0.22),
    '--vl-grid-line': toRgba(muted, dark ? 0.04 : 0.05),
    '--vl-title-grad-a': text,
    '--vl-title-grad-b': goldSoft,
  }
}

function clearCustomThemeVars(root: HTMLElement) {
  for (const key of CUSTOM_THEME_VARS) {
    root.style.removeProperty(key)
  }
}

function applyCustomThemeVars(root: HTMLElement, palette: CustomPalette) {
  const vars = deriveCustomThemeVars(palette)
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

export function applyColorTheme(
  themeId?: ColorThemeId | null,
  customPalette?: Partial<CustomPalette> | null,
) {
  const root = document.documentElement
  const id =
    themeId && themeId in COLOR_THEME_META ? themeId : DEFAULT_SETTINGS.colorTheme

  if (id === 'custom') {
    const palette = mergeCustomPalette(customPalette)
    root.dataset.theme = 'custom'
    root.dataset.themeMode = palette.mode
    root.style.colorScheme = palette.mode
    applyCustomThemeVars(root, palette)
    return
  }

  clearCustomThemeVars(root)
  const meta = COLOR_THEME_META[id]
  root.dataset.theme = id
  root.dataset.themeMode = meta.mode
  root.style.colorScheme = meta.mode
}

export function themeIdsByMode(mode: 'dark' | 'light'): PresetColorThemeId[] {
  return (Object.keys(PRESET_PALETTE_SEEDS) as PresetColorThemeId[]).filter(
    (id) => COLOR_THEME_META[id].mode === mode,
  )
}

export function customSwatches(palette?: Partial<CustomPalette> | null): [string, string, string] {
  const p = mergeCustomPalette(palette)
  return [p.background, p.accentA, p.accentB]
}

export function seedFromPreset(id: PresetColorThemeId): CustomPalette {
  return { ...PRESET_PALETTE_SEEDS[id] }
}
