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
      },
      dark: {
        dark: true,
        colors: {
          primary: '#5DD6CF', // 더 밝은 틸 — 다크 배경 위 가독성
          secondary: '#3BBDB6',
          accent: '#E8A882',
          error: '#FF6B6B',
          warning: '#FFB74D',
          success: '#69F0AE',
          background: '#081A19',
          surface: '#0F2524',
          'on-surface': '#F0FAF9', // 거의 흰색 — 텍스트 최대 대비
          'surface-variant': '#1C3836',
        },
      },
    },
  },
})
