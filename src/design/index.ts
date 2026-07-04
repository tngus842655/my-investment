// ─── Themes ──────────────────────────────────────────────────
export type { ThemeId, FpColors, FpTheme } from './themes/types'
export { FP_THEMES, FP_THEME_MAP } from './themes/index'
export { lightTheme, darkTheme, natureTheme, spaceTheme, goldTheme } from './themes/index'

// ─── Tokens ──────────────────────────────────────────────────
export { spacing }                             from './tokens/spacing'
export { radius }                              from './tokens/radius'
export { shadows }                             from './tokens/shadows'
export { animation }                           from './tokens/animation'

export type { Spacing }                        from './tokens/spacing'
export type { Radius }                         from './tokens/radius'
export type { Shadows }                        from './tokens/shadows'
export type { Animation }                      from './tokens/animation'

// ─── Storage key ──────────────────────────────────────────────
export const THEME_STORAGE_KEY = 'fp-theme'
export const FONT_SCALE_STORAGE_KEY = 'fp-font-scale'

// ─── 글자 크기 스케일 ────────────────────────────────────────
export const FONT_SCALE_MIN = 0.75
export const FONT_SCALE_MAX = 1.25
export const FONT_SCALE_DEFAULT = 1
