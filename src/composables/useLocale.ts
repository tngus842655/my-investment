import type { LocaleCode } from '@/config/marketConfig'
import { i18n, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type SupportedLocale } from '@/plugins/i18n'
import { supabase } from '@/services/supabase'

// 표시 언어 (GLOBALIZATION.md 단계 D). 원본은 investment_goals.locale이며,
// userData 스토어가 goals 로드/초기화 시 setLocale로 동기화한다 (useBaseCurrency와 동일 패턴).
// DB는 ko/en/ja/zh(LocaleCode)까지 허용하지만 메시지 번들이 아직 ko/en뿐이라,
// 미지원 언어가 들어오면 폴백 언어('ko')로 대체한다.

const toSupported = (c: LocaleCode): SupportedLocale =>
  SUPPORTED_LOCALES.includes(c as SupportedLocale) ? (c as SupportedLocale) : 'ko'

export const setLocale = (c: LocaleCode) => {
  i18n.global.locale.value = toSupported(c)
}

export const useLocale = () => {
  const locale = i18n.global.locale

  const setLocaleAndSave = async (c: SupportedLocale) => {
    if (locale.value === c) return
    setLocale(c)
    localStorage.setItem(LOCALE_STORAGE_KEY, c)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('investment_goals').update({ locale: c }).eq('user_id', user.id)
  }

  return { locale, setLocale: setLocaleAndSave }
}
