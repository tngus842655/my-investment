import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
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

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: Object.fromEntries(FP_THEMES.map((t) => [t.id, toVuetifyTheme(t)])),
  },
})
