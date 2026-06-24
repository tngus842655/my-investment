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
    // 저장값 없으면 다크 기본
    theme.global.name.value = 'dark'
  }

  return { isDark, toggleTheme, initTheme }
}
