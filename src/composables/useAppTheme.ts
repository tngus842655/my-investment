import { useTheme } from 'vuetify'

const THEME_KEY = 'my-investment-theme'

export const useAppTheme = () => {
  const theme = useTheme()

  const isDark = () => theme.global.name.value === 'dark'

  const toggleTheme = () => {
    const next = isDark() ? 'light' : 'dark'
    theme.global.name.value = next
    localStorage.setItem(THEME_KEY, next)
  }

  const initTheme = () => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') {
      theme.global.name.value = saved
      return
    }
    // 저장값 없으면 시스템 설정 따라가기
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    theme.global.name.value = prefersDark ? 'dark' : 'light'
  }

  return { isDark, toggleTheme, initTheme }
}
