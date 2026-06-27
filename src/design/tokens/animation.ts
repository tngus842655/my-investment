export const animation = {
  /** 화면 전환 */
  transition:     '200ms ease',
  /** 느린 전환 */
  transitionSlow: '250ms ease',
  /** 버튼 눌림 */
  scalePress:     'scale(0.97)',
  /** Dialog fade-scale */
  dialogEnter:    'opacity 200ms ease, transform 200ms ease',
} as const

export type Animation = typeof animation
