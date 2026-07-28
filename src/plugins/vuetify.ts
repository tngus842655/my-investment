import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

import { createVuetify } from 'vuetify'
import { FP_THEMES } from '@/design'
import type { FpTheme } from '@/design'

function toVuetifyTheme(t: FpTheme) {
  const c = t.colors
  return {
    dark: t.dark,
    colors: {
      primary:               c.primary,
      secondary:             c.secondary,
      success:               c.success,
      error:                 c.error,
      warning:               c.warning,
      info:                  c.info,
      background:            c.background,
      surface:               c.surface,
      'surface-variant':     c.surfaceVariant,
      'on-primary':          c.onPrimary,
      'on-surface':          c.onSurface,
      'on-surface-variant':  c.onSurfaceVariant,
      outline:               c.outline,
    },
  }
}

// 컴포넌트·디렉티브는 전역 등록하지 않는다 — vite.config.ts의 vite-plugin-vuetify가
// 템플릿에서 실제 쓰는 것만 골라 import 한다 (전역 등록 시 전체가 번들에 포함됨).
export default createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: Object.fromEntries(FP_THEMES.map((t) => [t.id, toVuetifyTheme(t)])),
  },
})
