import { useEffect } from 'react'
import type { ColorThemeId, CustomPalette } from '../../shared/types'
import { applyColorTheme } from '../lib/theme'

/** Keeps document theme in sync with settings for companion + overlay. */
export function useColorTheme(
  colorTheme: ColorThemeId,
  customPalette?: CustomPalette | null,
) {
  useEffect(() => {
    applyColorTheme(colorTheme, customPalette)
  }, [
    colorTheme,
    customPalette?.mode,
    customPalette?.background,
    customPalette?.text,
    customPalette?.muted,
    customPalette?.accentA,
    customPalette?.accentB,
  ])
}
