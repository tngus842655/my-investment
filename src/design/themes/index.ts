export type { ThemeId, FpColors, FpTheme } from './types'
export { lightTheme } from './light'
export { darkTheme } from './dark'
export { natureTheme } from './nature'
export { spaceTheme } from './space'
export { goldTheme } from './gold'

import { lightTheme } from './light'
import { darkTheme } from './dark'
import { natureTheme } from './nature'
import { spaceTheme } from './space'
import { goldTheme } from './gold'
import type { ThemeId, FpTheme } from './types'

export const FP_THEMES: FpTheme[] = [lightTheme, darkTheme, natureTheme, spaceTheme, goldTheme]

export const FP_THEME_MAP: Record<ThemeId, FpTheme> = {
  light:  lightTheme,
  dark:   darkTheme,
  nature: natureTheme,
  space:  spaceTheme,
  gold:   goldTheme,
}
