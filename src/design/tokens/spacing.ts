export const spacing = {
  /** 화면 좌우 패딩 */
  pagePadding:  '20px',
  /** 화면 상단 여백 */
  pageTop:      '24px',
  /** 카드 내부 패딩 */
  cardPadding:  '20px',
  /** 카드 간 간격 */
  cardGap:      '16px',
  /** 섹션 간 간격 */
  sectionGap:   '24px',
  /** 아이콘-텍스트 간격 */
  iconGap:      '8px',

  // 기본 스케일
  xs:  '4px',
  sm:  '8px',
  md:  '12px',
  lg:  '16px',
  xl:  '20px',
  xxl: '24px',
} as const

export type Spacing = typeof spacing
