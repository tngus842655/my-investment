import type { FpTheme } from './types'

export const spaceTheme: FpTheme = {
  id: 'space',
  label: 'Space',
  emoji: '🚀',
  dark: true,
  colors: {
    primary:             '#00D4B8',
    secondary:           '#00B09C',
    success:             '#00E5A0',
    error:               '#FF5F6D',
    warning:             '#FFB347',
    info:                '#00D4B8',

    background:          '#080F1E',
    surface:             '#0F1C35',
    surfaceVariant:      '#172744',

    onPrimary:           '#080F1E',
    onSurface:           '#E8F4F8',
    onSurfaceVariant:    '#7A9AB0',
    onSurfaceHint:       '#4A6478',

    outline:             '#1E3050',
    divider:             '#162540',
  },
  chart: {
    palette: ['#00D4B8', '#7C6FCD', '#FFB347', '#FF5F6D', '#4FC3F7', '#B39DDB', '#FF8A65', '#00E5A0', '#F48FB1', '#80DEEA'],
    typeColors: {
      해외주식: '#7C6FCD',
      국내주식: '#4FC3F7',
      해외ETF:  '#FF8A65',
      국내ETF:  '#B39DDB',
      ETF:     '#00D4B8',
      암호화폐: '#FFB347',
      현금:    '#00E5A0',
    },
  },
}
