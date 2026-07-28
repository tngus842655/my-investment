import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 시세 서버 캐시(price_cache 테이블) TTL.
// 보유종목 수만큼 이 함수가 동시 호출되는데 종목당 Yahoo/Finnhub 왕복이 들어가 자산 화면이
// 종목 수에 비례해 느려졌다. 같은 티커는 여러 사용자·여러 화면이 공유하므로 서버에 캐시한다.
const CACHE_TTL_MS = 60 * 1000

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
// 캐시는 부가 기능이라 환경변수가 없으면(또는 테이블 배포 전이면) 캐시 없이 그대로 동작한다.
const cacheDb = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

const readCache = async (key: string): Promise<Quote | null> => {
  if (!cacheDb) return null
  try {
    const { data } = await cacheDb
      .from('price_cache')
      .select('price, previous_close, updated_at')
      .eq('cache_key', key)
      .maybeSingle()
    if (!data) return null
    if (Date.now() - new Date(data.updated_at).getTime() >= CACHE_TTL_MS) return null
    return { price: Number(data.price), previousClose: data.previous_close === null ? null : Number(data.previous_close) }
  } catch {
    return null
  }
}

const writeCache = async (key: string, quote: Quote): Promise<void> => {
  if (!cacheDb) return
  try {
    await cacheDb.from('price_cache').upsert(
      { cache_key: key, price: quote.price, previous_close: quote.previousClose, updated_at: new Date().toISOString() },
      { onConflict: 'cache_key' },
    )
  } catch {
    // 캐시 저장 실패는 응답에 영향을 주지 않는다
  }
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

// 현재가 + 전일종가. previousClose를 못 구하면 null (등락률 계산 불가 → 프론트에서 보합 처리)
interface Quote {
  price: number
  previousClose: number | null
}

const fetchYahooPrice = async (ticker: string, suffixes: string[]): Promise<Quote> => {
  const tryFetch = async (symbol: string): Promise<Quote | null> => {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice
    if (!price || price <= 0) return null
    const prev = meta?.chartPreviousClose ?? meta?.previousClose
    return { price, previousClose: prev && prev > 0 ? prev : null }
  }

  // 서픽스 순서대로 시도 (KR: KOSPI 실패 시 KOSDAQ 재시도)
  for (const suffix of suffixes) {
    const quote = await tryFetch(`${ticker}${suffix}`)
    if (quote) return quote
  }

  throw new Error(`Yahoo Finance: price not found for ${ticker}`)
}

const fetchFinnhubPrice = async (ticker: string, isCrypto: boolean): Promise<Quote> => {
  const apiKey = Deno.env.get('FINNHUB_API_KEY')
  if (!apiKey) throw new Error('FINNHUB_API_KEY not found')

  const symbol = isCrypto ? `BINANCE:${ticker}USDT` : ticker
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`)
  if (!res.ok) throw new Error(`Finnhub error: ${res.status}`)

  const data = await res.json()
  if (!data.c || data.c <= 0) throw new Error(`Finnhub: invalid price for ${symbol}`)

  // Finnhub quote: c=현재가, pc=전일종가
  return { price: data.c, previousClose: data.pc && data.pc > 0 ? data.pc : null }
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

    // 시세를 결정하는 값(티커·시장·암호화폐 여부)만으로 캐시 키를 만든다
    const cacheKey = `${ticker}|${resolvedMarket ?? ''}|${isCrypto ? 'crypto' : 'stock'}`

    // 서픽스가 있는 시장(KR/JP/CN)은 Yahoo, 그 외(US 주식·ETF, 암호화폐)는 Finnhub
    let quote = await readCache(cacheKey)
    if (!quote) {
      quote = !isCrypto && suffixes.length > 0 ? await fetchYahooPrice(ticker, suffixes) : await fetchFinnhubPrice(ticker, isCrypto)
      await writeCache(cacheKey, quote)
    }

    // 등락률(%) = (현재가 - 전일종가) / 전일종가 * 100. 전일종가 없으면 null
    const changeRate = quote.previousClose ? ((quote.price - quote.previousClose) / quote.previousClose) * 100 : null

    return new Response(
      JSON.stringify({ ticker, price: quote.price, previousClose: quote.previousClose, changeRate }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
