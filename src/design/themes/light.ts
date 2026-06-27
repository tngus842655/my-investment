import type { FpTheme } from './types'

export const lightTheme: FpTheme = {
  id: 'light',
  label: 'Light',
  emoji: '☀',
  dark: false,
  colors: {
    primary:             '#16B5A5',
    secondary:           '#0FA090',
    success:             '#18A957',
    error:               '#E34D4D',
    warning:             '#F6A623',
    info:                '#16B5A5',

    background:          '#F4F8FC',
    surface:             '#FFFFFF',
    surfaceVariant:      '#EBF2F9',

    onPrimary:           '#FFFFFF',
    onSurface:           '#1B2430',
    onSurfaceVariant:    '#6B7280',
    onSurfaceHint:       '#A0A8B3',

    outline:             '#E7EDF3',
    divider:             '#EEF2F7',
  },
  chart: {
    palette: ['#16B5A5', '#6366F1', '#F6A623', '#E34D4D', '#8B5CF6', '#0EA5E9', '#F97316', '#18A957', '#EC4899', '#14B8A6'],
    typeColors: {
      해외주식: '#6366F1',
      국내주식: '#0EA5E9',
      ETF:     '#16B5A5',
      암호화폐: '#F6A623',
      현금:    '#18A957',
    },
  },
}
