import type { AssetClass, MarketCode } from '@/config/marketConfig'

export interface PortfolioForm {
  ticker: string
  asset_type: string
  currency: string
}

export interface PortfolioAsset {
  id: string
  user_id: string
  ticker: string
  asset_type: string
  // 다국가 전환용 (GLOBALIZATION.md 단계 A). DB에는 백필 완료, 프론트 전환 중에는 optional
  asset_class?: AssetClass
  market?: MarketCode | null
  quantity: number
  avg_price: number
  currency: string
  account_name: string
  sort_order: number
  created_at: string
  updated_at: string
}
