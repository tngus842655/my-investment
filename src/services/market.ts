import { supabase } from '@/services/supabase'

export const getStockPrice = async (
  ticker: string,
  assetType: string = '',
  currency: string = 'USD',
): Promise<number> => {
  const { data, error } = await supabase.functions.invoke('stock-price', {
    body: { ticker, asset_type: assetType, currency },
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
