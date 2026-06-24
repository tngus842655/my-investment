import { useTheme } from 'vuetify'

const THEME_KEY = 'my-investment-theme'

export const useAppTheme = () => {
  const theme = useTheme()

  const isDark = () => theme.global.name.value === 'dark'

  const toggleTheme = () => {
    const next = isDark() ? 'light' : 'dark'
    theme.change(next)
    localStorage.setItem(THEME_KEY, next)
  }

  const initTheme = () => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') {
      theme.change(saved)
      return
    }
    // 저장값 없으면 다크 기본
    theme.change('dark')
  }

  return { isDark, toggleTheme, initTheme }
}
