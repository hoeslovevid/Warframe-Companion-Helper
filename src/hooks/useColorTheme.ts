import { useEffect } from 'react'
import type { ColorThemeId } from '../../shared/types'
import { applyColorTheme } from '../lib/theme'

/** Keeps document theme in sync with settings for companion + overlay. */
export function useColorTheme(colorTheme: ColorThemeId) {
  useEffect(() => {
    applyColorTheme(colorTheme)
  }, [colorTheme])
}
