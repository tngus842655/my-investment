import type { FpTheme } from './types'

export const natureTheme: FpTheme = {
  id: 'nature',
  label: 'Nature',
  emoji: '🌿',
  dark: false,
  colors: {
    primary:             '#2D9E6B',
    secondary:           '#239158',
    success:             '#18A957',
    error:               '#D44C4C',
    warning:             '#E69B1A',
    info:                '#2D9E6B',

    background:          '#F0F7F3',
    surface:             '#FFFFFF',
    surfaceVariant:      '#E6F3EC',

    onPrimary:           '#FFFFFF',
    onSurface:           '#1A2E1F',
    onSurfaceVariant:    '#5A7260',
    onSurfaceHint:       '#90A896',

    outline:             '#D4E8DB',
    divider:             '#E2F0E7',
  },
  chart: {
    palette: ['#2D9E6B', '#7EB84A', '#E69B1A', '#D44C4C', '#5BB8A0', '#A3C96A', '#C87941', '#18A957', '#8E6BBF', '#4BA8C5'],
    typeColors: {
      해외주식: '#5BB8A0',
      국내주식: '#7EB84A',
      ETF:     '#2D9E6B',
      암호화폐: '#E69B1A',
      현금:    '#18A957',
    },
  },
}
