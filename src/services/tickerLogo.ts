const CACHE_KEY = 'ticker_logo_cache'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7 // 7일

interface LogoCache {
  [ticker: string]: { url: string | null; ts: number }
}

const memCache: LogoCache = {}
let diskCache: LogoCache | null = null

function getDiskCache(): LogoCache {
  if (diskCache !== null) return diskCache
  try {
    diskCache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    diskCache = {}
  }
  return diskCache!
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(getDiskCache()))
  } catch {}
}

// 동시 fetch 중복 방지용 in-flight map
const inFlight: Record<string, Promise<string | null>> = {}

export async function getTickerLogo(ticker: string, currency: string): Promise<string | null> {
  if (currency === 'KRW') return null

  // 메모리 캐시 히트
  if (memCache[ticker] !== undefined) return memCache[ticker].url

  // localStorage 캐시 히트
  const disk = getDiskCache()
  const cached = disk[ticker]
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    memCache[ticker] = cached
    return cached.url
  }

  // 같은 ticker 동시 요청 중이면 기존 Promise 재사용
  if (inFlight[ticker]) return inFlight[ticker]

  inFlight[ticker] = (async () => {
    try {
      const apiKey = import.meta.env.VITE_FINNHUB_API_KEY
      const res = await fetch(
        `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`,
      )
      const data = await res.json()
      const url: string | null = data?.logo || null

      const entry = { url, ts: Date.now() }
      memCache[ticker] = entry
      getDiskCache()[ticker] = entry
      saveCache()
      return url
    } catch {
      return null
    } finally {
      delete inFlight[ticker]
    }
  })()

  return inFlight[ticker]!
}

// 포트폴리오 전체 로고를 한 번에 fetch — 캐시 히트는 즉시, 미스만 병렬 API 호출
export async function prefetchTickerLogos(
  items: { ticker: string; currency: string }[],
  onEach: (ticker: string, url: string | null) => void,
) {
  const disk = getDiskCache()
  const toFetch: typeof items = []

  for (const item of items) {
    if (item.currency === 'KRW') continue

    // 메모리 캐시
    if (memCache[item.ticker] !== undefined) {
      onEach(item.ticker, memCache[item.ticker]!.url)
      continue
    }

    // localStorage 캐시
    const cached = disk[item.ticker]
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      memCache[item.ticker] = cached
      onEach(item.ticker, cached.url)
      continue
    }

    toFetch.push(item)
  }

  // 미캐시 항목만 병렬 fetch
  await Promise.all(
    toFetch.map(async (item) => {
      const url = await getTickerLogo(item.ticker, item.currency)
      onEach(item.ticker, url)
    }),
  )
}
