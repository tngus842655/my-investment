export interface PortfolioForm {
  ticker: string
  asset_type: string
  quantity: number
  avg_price: number
  currency: string
}

export interface PortfolioAsset {
  id: string
  user_id: string
  ticker: string
  asset_type: string
  quantity: number
  avg_price: number
  currency: string
  created_at: string
  updated_at: string
}
