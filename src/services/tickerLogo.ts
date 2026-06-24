const CACHE_KEY = 'ticker_logo_cache'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7 // 7일

interface LogoCache {
  [ticker: string]: { url: string | null; ts: number }
}

const memCache: LogoCache = {}

function loadCache(): LogoCache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveCache(cache: LogoCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

export async function getTickerLogo(ticker: string, currency: string): Promise<string | null> {
  if (currency === 'KRW') return null

  if (memCache[ticker] !== undefined) return memCache[ticker].url

  const stored = loadCache()
  const cached = stored[ticker]
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    memCache[ticker] = cached
    return cached.url
  }

  try {
    const apiKey = import.meta.env.VITE_FINNHUB_API_KEY
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`,
    )
    const data = await res.json()
    const url: string | null = data?.logo || null

    memCache[ticker] = { url, ts: Date.now() }
    stored[ticker] = { url, ts: Date.now() }
    saveCache(stored)
    return url
  } catch {
    return null
  }
}
