import type { FpTheme } from './types'

export const darkTheme: FpTheme = {
  id: 'dark',
  label: 'Dark',
  emoji: '🌙',
  dark: true,
  colors: {
    primary:             '#16B5A5',
    secondary:           '#0FA090',
    success:             '#1FC76A',
    error:               '#E34D4D',
    warning:             '#F6A623',
    info:                '#16B5A5',

    background:          '#0D1520',
    surface:             '#172030',
    surfaceVariant:      '#1E2A3E',

    onPrimary:           '#0D1520',
    onSurface:           '#E8F0F8',
    onSurfaceVariant:    '#8A9BB0',
    onSurfaceHint:       '#5A6878',

    outline:             '#2A3A50',
    divider:             '#1E2E42',
  },
  chart: {
    palette: ['#16B5A5', '#818CF8', '#FCD34D', '#F87171', '#A78BFA', '#38BDF8', '#FB923C', '#34D399', '#F472B6', '#22D3EE'],
    typeColors: {
      해외주식: '#818CF8',
      국내주식: '#38BDF8',
      해외ETF:  '#FB923C',
      국내ETF:  '#A78BFA',
      ETF:     '#16B5A5',
      암호화폐: '#FCD34D',
      현금:    '#34D399',
    },
  },
}
