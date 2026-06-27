import { computed } from 'vue'
import { useTheme } from 'vuetify'
import {
  FP_THEME_MAP,
  spacing,
  typography,
  radius,
  shadows,
  animation,
} from '@/design'
import type { ThemeId } from '@/design'

/**
 * 현재 테마의 색상 토큰 + 수치 토큰을 반환하는 composable.
 *
 * 컴포넌트에서:
 *   const { colors, spacing, radius } = useDesignTokens()
 *   colors.value.primary   → 현재 테마의 primary 색상
 *   spacing.cardPadding    → '20px' (테마 무관 고정값)
 */
export const useDesignTokens = () => {
  const vuetifyTheme = useTheme()

  const themeId = computed(() => vuetifyTheme.global.name.value as ThemeId)

  const theme = computed(() => FP_THEME_MAP[themeId.value] ?? FP_THEME_MAP.dark)

  /** 현재 테마의 색상 토큰 (반응형) */
  const colors = computed(() => theme.value.colors)

  /** 현재 테마의 차트 팔레트 (반응형) */
  const chart = computed(() => theme.value.chart)

  /** 현재 테마가 다크 계열인지 여부 */
  const isDark = computed(() => theme.value.dark)

  return {
    // 반응형 — 테마 전환 시 자동 갱신
    themeId,
    theme,
    colors,
    chart,
    isDark,

    // 고정값 토큰 — 모든 테마에서 동일
    spacing,
    typography,
    radius,
    shadows,
    animation,
  }
}
