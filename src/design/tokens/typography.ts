export const fontSize = {
  /** 화면 제목 */
  pageTitle:    '22px',
  /** 섹션 제목 */
  sectionTitle: '18px',
  /** 카드 제목 */
  cardTitle:    '16px',
  /** 본문 */
  body:         '15px',
  /** 설명 */
  desc:         '13px',
  /** 캡션 */
  caption:      '12px',
  /** 필드 레이블 */
  label:        '11px',
  /** 큰 금액 */
  amountLg:     '30px',
  /** 수익/손실 금액 */
  amountMd:     '22px',
} as const

export const fontWeight = {
  bold:     '700',
  semibold: '600',
  medium:   '500',
  regular:  '400',
} as const

export const typography = { fontSize, fontWeight } as const

export type FontSize   = typeof fontSize
export type FontWeight = typeof fontWeight
export type Typography = typeof typography
