export type ThemeId = 'light' | 'dark' | 'nature' | 'space' | 'gold'

/** 테마 선택 설정 — 'system'은 기기 화면모드(다크/라이트)를 따라간다 */
export type ThemeSetting = ThemeId | 'system'

export interface FpColors {
  // ── 브랜드 ──────────────────────────────────
  primary: string
  secondary: string

  // ── 시멘틱 ──────────────────────────────────
  success: string  // 수익
  error: string    // 손실
  warning: string
  info: string

  // ── 배경 ────────────────────────────────────
  background: string
  surface: string         // 카드 배경
  surfaceVariant: string  // 서브 카드 배경

  // ── 텍스트 on-surface ────────────────────────
  onPrimary: string
  onSurface: string         // 본문 텍스트
  onSurfaceVariant: string  // 보조 텍스트
  onSurfaceHint: string     // 힌트/placeholder

  // ── 선 ──────────────────────────────────────
  outline: string
  divider: string
}

export interface FpChartColors {
  /** 종목별 도넛/바 차트용 순환 팔레트 (10색) */
  palette: readonly string[]
  /** 자산 유형별 고정 색상 */
  typeColors: Readonly<Record<string, string>>
}

export interface FpTheme {
  id: ThemeId
  label: string
  emoji: string
  dark: boolean
  colors: FpColors
  chart: FpChartColors
}
