export const radius = {
  /** 메인 카드 */
  card:   '20px',
  /** 서브/작은 카드 */
  cardSm: '16px',
  /** 버튼 */
  button: '14px',
  /** 입력창 */
  input:  '14px',
  /** 배지, 칩 */
  badge:  '999px',
  /** 다이얼로그 */
  dialog: '24px',
  /** 기본 스케일 */
  sm:     '8px',
  md:     '12px',
  lg:     '16px',
  xl:     '20px',
} as const

export type Radius = typeof radius
