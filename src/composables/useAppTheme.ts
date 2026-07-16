import { computed, ref } from 'vue'
import { useTheme } from 'vuetify'
import { FP_THEMES, FP_THEME_MAP, THEME_STORAGE_KEY } from '@/design'
import type { ThemeId, ThemeSetting } from '@/design'
import { supabase } from '@/services/supabase'

// 선택된 테마 설정('system' 포함) — 앱 전역에서 공유 (모듈 레벨 ref)
const themeSetting = ref<ThemeSetting>('dark')

const systemDarkQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
const systemThemeId = (): ThemeId => ((systemDarkQuery?.matches ?? true) ? 'dark' : 'light')

let systemListenerBound = false

export const useAppTheme = () => {
  const theme = useTheme()

  const currentThemeId = computed(() => theme.global.name.value as ThemeId)

  const currentTheme = computed(() => FP_THEME_MAP[currentThemeId.value] ?? FP_THEME_MAP.dark)

  const isDark = () => currentTheme.value.dark

  const applySetting = (setting: ThemeSetting) => {
    theme.change(setting === 'system' ? systemThemeId() : setting)
  }

  const setTheme = (id: ThemeSetting) => {
    themeSetting.value = id
    applySetting(id)
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
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeSetting | null
    if (saved === 'system' || (saved && FP_THEME_MAP[saved])) {
      themeSetting.value = saved
    } else {
      // 구버전 키 호환, 저장된 설정이 없으면 기기 화면모드를 따른다
      const legacy = localStorage.getItem('my-investment-theme')
      themeSetting.value = legacy === 'light' || legacy === 'dark' ? legacy : 'system'
    }
    applySetting(themeSetting.value)

    // 앱 사용 중 기기 화면모드가 바뀌면 실시간 반영 ('system' 설정일 때만)
    if (!systemListenerBound && systemDarkQuery) {
      systemDarkQuery.addEventListener('change', () => {
        if (themeSetting.value === 'system') applySetting('system')
      })
      systemListenerBound = true
    }
  }

  return {
    currentThemeId,
    currentTheme,
    themeSetting,
    themes: FP_THEMES,
    isDark,
    setTheme,
    toggleTheme,
    initTheme,
  }
}
