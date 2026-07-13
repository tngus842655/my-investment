import { supabase } from '@/services/supabase'
import { getAssetClass, getMarket, type ClassifiableItem } from '@/config/marketConfig'

// 종목 시세(현재가+등락률) 단기 캐시.
// 포트폴리오 분석 화면의 여러 패널(버블/비교)이 같은 종목을 각자 조회하거나
// 탭을 오갈 때 발생하던 API 왕복 중복을 막는다. 성공 응답만 캐시하고 실패(throw)는
// 캐시하지 않아 다음 호출에서 재시도된다. (자산 화면·백그라운드 재계산은 이 캐시를
// 쓰지 않고 기존대로 매번 fresh 조회 — 수동 새로고침 즉시성 유지)
const QUOTE_CACHE_TTL = 60 * 1000 // 60초
const quoteCache = new Map<string, { quote: StockQuote; ts: number }>()

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

// getStockQuote의 캐시 래퍼 (TTL 내 같은 종목이면 API 재호출 없이 재사용)
export const getCachedStockQuote = async (
  ticker: string,
  item: ClassifiableItem,
): Promise<StockQuote> => {
  const key = `${ticker}|${getAssetClass(item)}|${getMarket(item) ?? ''}|${item.currency ?? 'USD'}`
  const cached = quoteCache.get(key)
  if (cached && Date.now() - cached.ts < QUOTE_CACHE_TTL) return cached.quote
  const quote = await getStockQuote(ticker, item)
  quoteCache.set(key, { quote, ts: Date.now() })
  return quote
}

export const getExchangeRate = async (from: string, to: string): Promise<number> => {
  const { data, error } = await supabase.functions.invoke('exchange-rate', {
    body: { from, to },
  })

  if (error) throw error

  return data.rate
}
