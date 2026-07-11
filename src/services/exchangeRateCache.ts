import { getExchangeRate } from './market'
import type { CurrencyCode } from '@/config/marketConfig'

const CACHE_TTL = 60 * 60 * 1000 // 1시간

interface CacheEntry {
  rate: number
  ts: number
}

// USD 허브 방식: USD→X 환율만 API로 조회·캐시하고, 임의 통화쌍은 두 값의 비율로 계산한다.
// (A→B = USD→B ÷ USD→A) — 국가가 늘어도 API 호출은 통화당 1회로 유지된다.
const FALLBACK_USD_RATES: Partial<Record<CurrencyCode, number>> = { KRW: 1350 }

const usdRateOf = async (currency: CurrencyCode): Promise<number> => {
  if (currency === 'USD') return 1

  // 기존 USD/KRW 캐시 키('exchange_rate_usd_krw')와 호환되는 키 규칙
  const cacheKey = `exchange_rate_usd_${currency.toLowerCase()}`
  try {
    const raw = localStorage.getItem(cacheKey)
    if (raw) {
      const entry: CacheEntry = JSON.parse(raw)
      if (Date.now() - entry.ts < CACHE_TTL) return entry.rate
    }
  } catch {
    // 파싱 오류 시 무시하고 새로 조회
  }

  try {
    const rate = await getExchangeRate('USD', currency)
    if (rate > 0) {
      localStorage.setItem(cacheKey, JSON.stringify({ rate, ts: Date.now() }))
      return rate
    }
  } catch {
    // 조회 실패
  }

  const fallback = FALLBACK_USD_RATES[currency]
  if (fallback) return fallback
  throw new Error(`환율 조회 실패: USD→${currency}`)
}

// 통화쌍 환율: from 1단위 = to 얼마
export const getCachedRate = async (from: CurrencyCode, to: CurrencyCode): Promise<number> => {
  if (from === to) return 1
  const [fromUsd, toUsd] = await Promise.all([usdRateOf(from), usdRateOf(to)])
  return toUsd / fromUsd
}

// 기존 호출부 호환: USD→KRW 환율
export const getCachedExchangeRate = (): Promise<number> => getCachedRate('USD', 'KRW')
