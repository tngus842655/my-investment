import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 시장별 야후 심볼 서픽스 — 프론트 src/config/marketConfig.ts와 동일한 맵 (국가 추가 시 양쪽 함께 수정)
const MARKET_SUFFIXES: Record<string, string[]> = {
  KR: ['.KS', '.KQ'],
  US: [],
  JP: ['.T'],
  CN: ['.SS', '.SZ'],
}

// 전환기 하위호환: asset_class/market 없이 asset_type(한글)만 보내는 구버전 프론트의 시장 유추
const isKoreanStock = (ticker: string, assetType: string, currency: string): boolean => {
  return assetType === '국내주식' || (assetType === 'ETF' && currency === 'KRW') || /^\d{6}$/.test(ticker)
}

const fetchYahooPrice = async (ticker: string, suffixes: string[]): Promise<number> => {
  const tryFetch = async (symbol: string): Promise<number | null> => {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    return price && price > 0 ? price : null
  }

  // 서픽스 순서대로 시도 (KR: KOSPI 실패 시 KOSDAQ 재시도)
  for (const suffix of suffixes) {
    const price = await tryFetch(`${ticker}${suffix}`)
    if (price) return price
  }

  throw new Error(`Yahoo Finance: price not found for ${ticker}`)
}

const fetchFinnhubPrice = async (ticker: string, isCrypto: boolean): Promise<number> => {
  const apiKey = Deno.env.get('FINNHUB_API_KEY')
  if (!apiKey) throw new Error('FINNHUB_API_KEY not found')

  const symbol = isCrypto ? `BINANCE:${ticker}USDT` : ticker
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`)
  if (!res.ok) throw new Error(`Finnhub error: ${res.status}`)

  const data = await res.json()
  if (!data.c || data.c <= 0) throw new Error(`Finnhub: invalid price for ${symbol}`)

  return data.c
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { ticker, asset_type, asset_class, market, currency } = await req.json()

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'ticker is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 신규 프론트는 asset_class + market을 보내고, 구버전은 asset_type(한글)만 보낸다
    const isCrypto = asset_class ? asset_class === 'crypto' : asset_type === '암호화폐'
    const resolvedMarket: string | null = market !== undefined
      ? market
      : isKoreanStock(ticker, asset_type ?? '', currency ?? '') ? 'KR' : 'US'
    const suffixes = resolvedMarket ? MARKET_SUFFIXES[resolvedMarket] ?? [] : []

    // 서픽스가 있는 시장(KR/JP/CN)은 Yahoo, 그 외(US 주식·ETF, 암호화폐)는 Finnhub
    const price = !isCrypto && suffixes.length > 0 ? await fetchYahooPrice(ticker, suffixes) : await fetchFinnhubPrice(ticker, isCrypto)

    return new Response(JSON.stringify({ ticker, price }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
