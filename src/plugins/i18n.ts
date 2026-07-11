import { createI18n } from 'vue-i18n'
import ko from '@/locales/ko.json'
import en from '@/locales/en.json'
import type { LocaleCode } from '@/config/marketConfig'

// 표시 언어 저장 키. 비로그인 상태(로그인 화면 등)에서도 쓰이므로 로컬스토리지에 우선 보관하고,
// 로그인 후에는 investment_goals.locale과 동기화한다 (src/composables/useLocale.ts).
export const LOCALE_STORAGE_KEY = 'firepath-locale'

// 실제 메시지 번들이 준비된 언어만. LocaleCode(ko/en/ja/zh)는 DB CHECK 제약 기준 전체 후보이고,
// 이 상수는 그중 현재 i18n에 연결된 부분집합 — 일본어/중국어 추가 시 여기와 messages에 함께 반영.
export const SUPPORTED_LOCALES: SupportedLocale[] = ['ko', 'en']
export type SupportedLocale = Extract<LocaleCode, 'ko' | 'en'>

const detectInitialLocale = (): SupportedLocale => {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (saved && SUPPORTED_LOCALES.includes(saved as SupportedLocale)) return saved as SupportedLocale
  const browserLang = navigator.language.slice(0, 2)
  return SUPPORTED_LOCALES.includes(browserLang as SupportedLocale) ? (browserLang as SupportedLocale) : 'ko'
}

export const i18n = createI18n({
  legacy: false,
  // 템플릿에서 useI18n() 없이 $t를 직접 쓸 수 있도록 전역 주입 활성화
  globalInjection: true,
  locale: detectInitialLocale(),
  fallbackLocale: 'ko',
  messages: { ko, en },
})
