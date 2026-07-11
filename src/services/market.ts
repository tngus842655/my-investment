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

export const getExchangeRate = async (from: string, to: string): Promise<number> => {
  const { data, error } = await supabase.functions.invoke('exchange-rate', {
    body: { from, to },
  })

  if (error) throw error

  return data.rate
}
