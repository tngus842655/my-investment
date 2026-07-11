import type { LocaleCode } from '@/config/marketConfig'
import { i18n, LOCALE_STORAGE_KEY } from '@/plugins/i18n'
import { supabase } from '@/services/supabase'

// 표시 언어 (GLOBALIZATION.md 단계 D). 원본은 investment_goals.locale이며,
// userData 스토어가 goals 로드/초기화 시 setLocale로 동기화한다 (useBaseCurrency와 동일 패턴).

export const setLocale = (c: LocaleCode) => {
  i18n.global.locale.value = c
}

export const useLocale = () => {
  const locale = i18n.global.locale

  const setLocaleAndSave = async (c: LocaleCode) => {
    if (locale.value === c) return
    setLocale(c)
    localStorage.setItem(LOCALE_STORAGE_KEY, c)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('investment_goals').update({ locale: c }).eq('user_id', user.id)
  }

  return { locale, setLocale: setLocaleAndSave }
}
