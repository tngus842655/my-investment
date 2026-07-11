import { defineStore } from 'pinia'
import { supabase } from '@/services/supabase'
import { setBaseCurrency } from '@/composables/useBaseCurrency'
import type { CurrencyCode } from '@/config/marketConfig'

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
  locale: string
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
  asset_type: string
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
      setBaseCurrency('KRW')
    },
  },
})
