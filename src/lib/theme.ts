import { COLOR_THEME_META, ColorThemeId, DEFAULT_SETTINGS } from '../../shared/types'

export function applyColorTheme(themeId?: ColorThemeId | null) {
  const id =
    themeId && themeId in COLOR_THEME_META ? themeId : DEFAULT_SETTINGS.colorTheme
  const meta = COLOR_THEME_META[id]
  document.documentElement.dataset.theme = id
  document.documentElement.dataset.themeMode = meta.mode
  document.documentElement.style.colorScheme = meta.mode
}

export function themeIdsByMode(mode: 'dark' | 'light'): ColorThemeId[] {
  return (Object.keys(COLOR_THEME_META) as ColorThemeId[]).filter(
    (id) => COLOR_THEME_META[id].mode === mode,
  )
}
