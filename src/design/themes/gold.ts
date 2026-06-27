import type { FpTheme } from './types'

export const goldTheme: FpTheme = {
  id: 'gold',
  label: 'Gold',
  emoji: '👑',
  dark: true,
  colors: {
    primary:             '#C9993A',   // 절제된 샴페인 골드
    secondary:           '#A07830',
    success:             '#4CAF79',   // 수익: 그린 유지
    error:               '#E05353',   // 손실: 레드 유지
    warning:             '#D4960A',
    info:                '#7A9FB8',   // 뉴트럴 블루-그레이

    background:          '#111009',
    surface:             '#1A1710',
    surfaceVariant:      '#231F14',

    onPrimary:           '#111009',
    onSurface:           '#EEEEEE',   // 뉴트럴 화이트 — 텍스트에 금색 제거
    onSurfaceVariant:    '#8E8E8E',   // 뉴트럴 미디엄 그레이
    onSurfaceHint:       '#565656',   // 뉴트럴 다크 그레이

    outline:             '#2C2518',   // 은은한 골드 틴트 경계
    divider:             '#1F1C12',
  },
  chart: {
    // 골드를 첫 번째 primary로, 이후 다양한 색상으로 구성
    palette: ['#C9993A', '#4CAF79', '#7A9FB8', '#A07830', '#9B7EB8', '#5BB8A0', '#E05353', '#C4884A', '#7A9F68', '#B8A07A'],
    typeColors: {
      해외주식: '#7A9FB8',   // 블루-그레이 (해외)
      국내주식: '#C4884A',   // 앰버 (국내)
      ETF:     '#C9993A',   // 골드 (ETF — 핵심 자산)
      암호화폐: '#9B7EB8',   // 퍼플 (크립토)
      현금:    '#4CAF79',   // 그린 (현금)
    },
  },
}
