import { US_STOCK_NAMES, US_ETF_NAMES } from './tickerNames.us'
import { KR_STOCK_NAMES, KR_ETF_NAMES } from './tickerNames.kr'
import { CRYPTO_NAMES } from './tickerNames.crypto'
import { i18n } from '@/plugins/i18n'

// 티커 → 한글 표시명 매핑 (GLOBALIZATION.md 단계 E).
// 이 맵은 (1) ko 로케일의 표시명 소스이자 (2) "등록 가능한 종목인지" 판별용 목록 두 역할을 겸한다.
// 현금 티커의 표시명은 로케일별로 달라야 하므로 여기 두지 않고 아래 CASH_KEYS(i18n)로 처리한다.
export const TICKER_NAMES: Record<string, string> = {
  ...US_STOCK_NAMES,
  ...US_ETF_NAMES,
  ...KR_STOCK_NAMES,
  ...KR_ETF_NAMES,
  ...CRYPTO_NAMES,
}

// 현금 티커는 로케일별 i18n 문구로 표시한다.
const CASH_KEYS: Record<string, string> = {
  CASH: 'ticker.cash',
  CASH_KRW: 'ticker.cashKrw',
  CASH_USD: 'ticker.cashUsd',
}

// ETF 판별은 표시 문자열('ETF' 포함 여부)이 아니라 ETF 목록 소속으로 판단한다.
// → 로케일과 무관하게 항상 동일하게 동작한다.
const ETF_TICKERS = new Set(
  [...Object.keys(US_ETF_NAMES), ...Object.keys(KR_ETF_NAMES)].map((k) => k.toUpperCase()),
)

// 현재 로케일에서 티커의 표시명을 구한다.
// - 현금 티커: 로케일별 i18n 문구
// - ko 로케일: 한글 매핑(TICKER_NAMES), 없으면 티커 원문
// - 그 외 로케일: 이름 데이터가 없으므로 티커 원문 폴백 (예: en에서 AAPL은 그대로 "AAPL")
export const getTickerDisplayName = (ticker: string): string => {
  const upper = ticker.toUpperCase()
  const cashKey = CASH_KEYS[upper]
  if (cashKey) return i18n.global.t(cashKey)
  if (i18n.global.locale.value === 'ko') return TICKER_NAMES[upper] ?? ticker
  return ticker
}

// 표시명 + 티커를 함께 노출할지 여부.
// 이름이 있으면(현금 포함) name+티커, 없으면 티커만 표시.
export const getTickerLabel = (ticker: string): { name: string; showTicker: boolean } => {
  const upper = ticker.toUpperCase()
  if (CASH_KEYS[upper]) return { name: getTickerDisplayName(ticker), showTicker: true }
  if (i18n.global.locale.value === 'ko') {
    const name = TICKER_NAMES[upper]
    if (name) return { name, showTicker: true }
  }
  return { name: ticker, showTicker: false }
}

export const isEtfTicker = (ticker: string): boolean => ETF_TICKERS.has(ticker.toUpperCase())

// 등록 가능한(우리 목록에 존재하는) 티커인지 — 표시 로케일과 무관하게 목록 소속으로 판단.
// 종목 등록/거래 추가 다이얼로그의 국내주식·암호화폐 검증에 사용.
export const isKnownTicker = (ticker: string): boolean =>
  TICKER_NAMES[ticker.toUpperCase()] !== undefined
