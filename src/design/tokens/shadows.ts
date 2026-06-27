export const shadows = {
  /** 라이트 모드 카드 */
  card:     '0 2px 12px rgba(0,0,0,0.06)',
  /** 다크 모드 카드 */
  cardDark: '0 4px 24px rgba(0,0,0,0.28)',
  /** 다이얼로그 */
  dialog:   '0 8px 40px rgba(0,0,0,0.18)',
  /** 없음 */
  none:     'none',
} as const

export type Shadows = typeof shadows
