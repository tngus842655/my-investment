import { supabase } from '@/services/supabase'
import { getAssetClass, getMarket, type ClassifiableItem } from '@/config/marketConfig'

export const getStockPrice = async (
  ticker: string,
  item: ClassifiableItem,
): Promise<number> => {
  const { data, error } = await supabase.functions.invoke('stock-price', {
    body: {
      ticker,
      asset_class: getAssetClass(item),
      market: getMarket(item),
      currency: item.currency ?? 'USD',
    },
  })

  if (error) throw error
  if (!data.price || data.price <= 0) throw new Error('Invalid price')

  return data.price
}

export interface StockQuote {
  price: number
  changeRate: number | null   // 전일 대비 등락률(%). 전일종가를 못 구하면 null
}

// 현재가 + 전일 등락률을 함께 조회 (자산 구성 버블 차트용)
export const getStockQuote = async (
  ticker: string,
  item: ClassifiableItem,
): Promise<StockQuote> => {
  const { data, error } = await supabase.functions.invoke('stock-price', {
    body: {
      ticker,
      asset_class: getAssetClass(item),
      market: getMarket(item),
      currency: item.currency ?? 'USD',
    },
  })

  if (error) throw error
  if (!data.price || data.price <= 0) throw new Error('Invalid price')

  return { price: data.price, changeRate: typeof data.changeRate === 'number' ? data.changeRate : null }
}

export const getExchangeRate = async (from: string, to: string): Promise<number> => {
  const { data, error } = await supabase.functions.invoke('exchange-rate', {
    body: { from, to },
  })

  if (error) throw error

  return data.rate
}
