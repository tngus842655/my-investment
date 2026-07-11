import { createI18n } from 'vue-i18n'
import ko from '@/locales/ko.json'
import en from '@/locales/en.json'
import type { LocaleCode } from '@/config/marketConfig'

// 표시 언어 저장 키. 비로그인 상태(로그인 화면 등)에서도 쓰이므로 로컬스토리지에 우선 보관하고,
// 로그인 후에는 investment_goals.locale과 동기화한다 (src/composables/useLocale.ts).
export const LOCALE_STORAGE_KEY = 'firepath-locale'

const SUPPORTED_LOCALES: LocaleCode[] = ['ko', 'en']

const detectInitialLocale = (): LocaleCode => {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (saved && SUPPORTED_LOCALES.includes(saved as LocaleCode)) return saved as LocaleCode
  const browserLang = navigator.language.slice(0, 2)
  return SUPPORTED_LOCALES.includes(browserLang as LocaleCode) ? (browserLang as LocaleCode) : 'ko'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: 'ko',
  messages: { ko, en },
})
