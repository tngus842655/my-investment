import { supabase } from '@/services/supabase'

export const getStockPrice = async (ticker: string): Promise<number> => {
  const { data, error } = await supabase.functions.invoke('stock-price', {
    body: { ticker },
  })

  if (error) throw error

  return data.c
}

export const getExchangeRate = async (from: string, to: string): Promise<number> => {
  const { data, error } = await supabase.functions.invoke('exchange-rate', {
    body: { from, to },
  })

  if (error) throw error

  return data.rate
}
