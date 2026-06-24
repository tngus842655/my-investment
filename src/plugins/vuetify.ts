import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          primary: '#00d4b8',
          secondary: '#00b09c',
          accent: '#00ecd4',
          error: '#ff5f6d',
          warning: '#ffb347',
          success: '#00e5a0',
          background: '#080f1e',
          surface: '#0f1c35',
          'on-surface': '#e8f4f8',
          'surface-variant': '#172744',
          'on-primary': '#080f1e',
        },
      },
      light: {
        dark: false,
        colors: {
          primary: '#0ca899',
          secondary: '#00d4b8',
          accent: '#007a70',
          error: '#e53935',
          warning: '#fb8c00',
          success: '#2e7d32',
          background: '#eef4fb',
          surface: '#ffffff',
          'on-surface': '#0a1628',
          'surface-variant': '#ddeef8',
          'on-primary': '#ffffff',
        },
      },
    },
  },
})
