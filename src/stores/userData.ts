import { defineStore } from 'pinia'
import { supabase } from '@/services/supabase'
import { setBaseCurrency } from '@/composables/useBaseCurrency'
import { setLocale } from '@/composables/useLocale'
import { LOCALE_STORAGE_KEY } from '@/plugins/i18n'
import type { CurrencyCode, LocaleCode } from '@/config/marketConfig'

export interface InvestmentGoal {
  id: string
  user_id: string
  target_asset: number
  monthly_investment: number
  annual_return: number | null
  target_date: string | null
  theme: string
  portfolio_sort: string
  hide_asset: boolean
  include_cash: boolean
  base_currency: CurrencyCode
  locale: LocaleCode
  created_at: string
  updated_at: string
}

export interface AssetSummary {
  id: string
  user_id: string
  current_asset: number
  investment_principal: number
  created_at: string
  updated_at: string
}

export interface Portfolio {
  id: string
  user_id: string
  ticker: string
  asset_class?: import('@/config/marketConfig').AssetClass
  market?: import('@/config/marketConfig').MarketCode | null
  quantity: number
  avg_price: number
  currency: string
  account_name: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

export const useUserDataStore = defineStore('userData', {
  state: () => ({
    goals: null as InvestmentGoal | null,
    assetSummary: null as AssetSummary | null,
    portfolios: [] as Portfolio[],
    goalsLoaded: false,
    assetSummaryLoaded: false,
    portfoliosLoaded: false,
    // 앱 콜드 스타트 이후 홈에서 최신 시세로 현재자산을 한 번 재계산했는지 (탭 전환 반복 재계산 방지)
    assetRefreshedThisSession: false,
  }),
  actions: {
    async ensureGoals(force = false) {
      if (this.goalsLoaded && !force) return this.goals
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return null
      const { data } = await supabase
        .from('investment_goals')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      this.goals = data
      this.goalsLoaded = true
      // 기준통화 동기화 — 금액 집계/표시가 이 값을 따른다 (GLOBALIZATION.md 단계 C)
      setBaseCurrency(data?.base_currency ?? 'KRW')
      // 표시 언어 동기화 — 로그인 계정의 저장값이 로컬스토리지(비로그인 추정값)보다 우선 (단계 D)
      if (data?.locale) {
        setLocale(data.locale)
        localStorage.setItem(LOCALE_STORAGE_KEY, data.locale)
      }
      return this.goals
    },

    async ensureAssetSummary(force = false) {
      if (this.assetSummaryLoaded && !force) return this.assetSummary
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return null
      const { data } = await supabase
        .from('asset_summary')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      this.assetSummary = data
      this.assetSummaryLoaded = true
      return this.assetSummary
    },

    async ensurePortfolios(force = false) {
      if (this.portfoliosLoaded && !force) return this.portfolios
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return []
      const { data } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
      this.portfolios = data ?? []
      this.portfoliosLoaded = true
      return this.portfolios
    },

    invalidateGoals() {
      this.goalsLoaded = false
    },

    invalidateAssetSummary() {
      this.assetSummaryLoaded = false
    },

    invalidatePortfolios() {
      this.portfoliosLoaded = false
    },

    reset() {
      this.goals = null
      this.assetSummary = null
      this.portfolios = []
      this.goalsLoaded = false
      this.assetSummaryLoaded = false
      this.portfoliosLoaded = false
      this.assetRefreshedThisSession = false
      setBaseCurrency('KRW')
    },
  },
})
