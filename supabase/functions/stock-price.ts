import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const isKoreanStock = (ticker: string, assetType: string, currency: string): boolean => {
  return assetType === '국내주식' || (assetType === 'ETF' && currency === 'KRW') || /^\d{6}$/.test(ticker)
}

const fetchYahooPrice = async (ticker: string): Promise<number> => {
  // KOSPI 먼저 시도
  const tryFetch = async (symbol: string): Promise<number | null> => {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    return price && price > 0 ? price : null
  }

  const ksPrice = await tryFetch(`${ticker}.KS`)
  if (ksPrice) return ksPrice

  // KOSDAQ 재시도
  const kqPrice = await tryFetch(`${ticker}.KQ`)
  if (kqPrice) return kqPrice

  throw new Error(`Yahoo Finance: price not found for ${ticker}`)
}

const fetchFinnhubPrice = async (ticker: string, assetType: string): Promise<number> => {
  const apiKey = Deno.env.get('FINNHUB_API_KEY')
  if (!apiKey) throw new Error('FINNHUB_API_KEY not found')

  const symbol = assetType === '암호화폐' ? `BINANCE:${ticker}USDT` : ticker
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
    const { ticker, asset_type, currency } = await req.json()

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'ticker is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const price = isKoreanStock(ticker, asset_type ?? '', currency ?? '') ? await fetchYahooPrice(ticker) : await fetchFinnhubPrice(ticker, asset_type ?? '')

    return new Response(JSON.stringify({ ticker, price }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
