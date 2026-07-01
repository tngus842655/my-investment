import { US_STOCK_NAMES, US_ETF_NAMES } from './tickerNames.us'
import { KR_STOCK_NAMES, KR_ETF_NAMES } from './tickerNames.kr'
import { CRYPTO_NAMES } from './tickerNames.crypto'

export const TICKER_NAMES: Record<string, string> = {
  // 현금
  CASH: '보유현금',
  CASH_KRW: '원화',
  CASH_USD: '달러',

  ...US_STOCK_NAMES,
  ...US_ETF_NAMES,
  ...KR_STOCK_NAMES,
  ...KR_ETF_NAMES,
  ...CRYPTO_NAMES,
}

export const getTickerDisplayName = (ticker: string): string => {
  return TICKER_NAMES[ticker.toUpperCase()] ?? ticker
}

export const getTickerLabel = (ticker: string): { name: string; showTicker: boolean } => {
  const name = TICKER_NAMES[ticker.toUpperCase()]
  if (name) return { name, showTicker: true }
  return { name: ticker, showTicker: false }
}

export const isEtfTicker = (ticker: string): boolean => {
  const name = TICKER_NAMES[ticker.toUpperCase()]
  return name ? name.includes('ETF') : false
}
