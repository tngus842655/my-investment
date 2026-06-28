import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { FP_THEMES, FP_THEME_MAP, THEME_STORAGE_KEY } from '@/design'
import type { ThemeId } from '@/design'
import { supabase } from '@/services/supabase'

export const useAppTheme = () => {
  const theme = useTheme()

  const currentThemeId = computed(() => theme.global.name.value as ThemeId)

  const currentTheme = computed(() => FP_THEME_MAP[currentThemeId.value] ?? FP_THEME_MAP.dark)

  const isDark = () => currentTheme.value.dark

  const setTheme = (id: ThemeId) => {
    theme.change(id)
    localStorage.setItem(THEME_STORAGE_KEY, id)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('investment_goals')
        .update({ theme: id })
        .eq('user_id', user.id)
        .then()
    })
  }

  const toggleTheme = () => {
    setTheme(isDark() ? 'light' : 'dark')
  }

  const initTheme = () => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null
    if (saved && FP_THEME_MAP[saved]) {
      theme.change(saved)
      return
    }
    // 구버전 키 호환
    const legacy = localStorage.getItem('my-investment-theme')
    theme.change(legacy === 'light' ? 'light' : 'dark')
  }

  return {
    currentThemeId,
    currentTheme,
    themes: FP_THEMES,
    isDark,
    setTheme,
    toggleTheme,
    initTheme,
  }
}
