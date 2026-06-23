import { getExchangeRate } from './market'

const CACHE_KEY = 'exchange_rate_usd_krw'
const CACHE_TTL = 60 * 60 * 1000 // 1시간

interface CacheEntry {
  rate: number
  ts: number
}

export const getCachedExchangeRate = async (): Promise<number> => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const entry: CacheEntry = JSON.parse(raw)
      if (Date.now() - entry.ts < CACHE_TTL) return entry.rate
    }
  } catch {
    // 파싱 오류 시 무시하고 새로 조회
  }

  try {
    const rate = await getExchangeRate('USD', 'KRW')
    if (rate > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, ts: Date.now() }))
      return rate
    }
  } catch {
    // 조회 실패
  }

  return 1350
}
