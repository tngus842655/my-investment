import type { AssetClass, MarketCode } from '@/config/marketConfig'

export interface PortfolioAsset {
  id: string
  user_id: string
  ticker: string
  // 시장/자산군 (marketConfig). crypto·cash는 market=null
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
