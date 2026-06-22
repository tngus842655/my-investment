import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#0E8A82',
          secondary: '#4FC8C2',
          accent: '#F0CEBA',
          error: '#E53935',
          warning: '#FB8C00',
          success: '#43A047',
          background: '#E8F6F5',
          surface: '#FFFFFF',
          'on-surface': '#0D3D3B',
          'surface-variant': '#D0EDEA',
        },
        variables: {
          'card-bg': 'rgba(255, 255, 255, 0.72)',
          'card-border': 'rgba(255, 255, 255, 0.90)',
          'stat-bg': 'rgba(255, 255, 255, 0.60)',
          'muted-text': '#5AABA4',
          'gradient-start': '#4FC8C2',
          'gradient-mid': '#8ED4CC',
          'gradient-end': '#F0CEBA',
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: '#4FC8C2',
          secondary: '#2A9D96',
          accent: '#C4896A',
          error: '#EF5350',
          warning: '#FFA726',
          success: '#66BB6A',
          background: '#0D2625',
          surface: '#112E2D',
          'on-surface': '#E0F4F3',
          'surface-variant': '#1A3D3B',
        },
        variables: {
          'card-bg': 'rgba(17, 46, 45, 0.80)',
          'card-border': 'rgba(79, 200, 194, 0.18)',
          'stat-bg': 'rgba(17, 46, 45, 0.70)',
          'muted-text': '#7ABFBA',
          'gradient-start': '#0D3D3B',
          'gradient-mid': '#133A38',
          'gradient-end': '#1F2A30',
        },
      },
    },
  },
})
