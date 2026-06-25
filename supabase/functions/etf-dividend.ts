import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DividendEvent {
  date: string      // YYYY-MM-DD
  amount: number    // 주당 배당금 (USD or KRW)
  type: 'ex' | 'pay'  // 배당락일 or 지급일
}

interface TickerDividend {
  ticker: string
  dividends: DividendEvent[]
  currency: string
}

const yahooSymbol = (ticker: string, currency: string): string => {
  if (currency === 'KRW') {
    if (/^\d{6}$/.test(ticker)) return `${ticker}.KS`
  }
  return ticker
}

const fetchDividends = async (ticker: string, currency: string): Promise<TickerDividend> => {
  const symbol = yahooSymbol(ticker, currency)
  // 2년치 데이터 조회
  const now = Math.floor(Date.now() / 1000)
  const from = now - 60 * 60 * 24 * 365 * 2
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${from}&period2=${now}&events=dividends`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  })

  if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status} for ${symbol}`)

  const data = await res.json()
  const result = data?.chart?.result?.[0]
  if (!result) return { ticker, dividends: [], currency }

  const rawDividends: Record<string, { amount: number; date: number }> =
    result?.events?.dividends ?? {}

  const dividends: DividendEvent[] = Object.values(rawDividends).map((d) => {
    const date = new Date(d.date * 1000)
    const dateStr = date.toISOString().slice(0, 10)
    return {
      date: dateStr,
      amount: d.amount,
      type: 'ex' as const,
    }
  })

  // 날짜 오름차순 정렬
  dividends.sort((a, b) => a.date.localeCompare(b.date))

  return { ticker, dividends, currency }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { tickers } = await req.json() as { tickers: { ticker: string; currency: string }[] }

    if (!tickers?.length) {
      return new Response(JSON.stringify({ error: 'tickers is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await Promise.allSettled(
      tickers.map(({ ticker, currency }) => fetchDividends(ticker, currency))
    )

    const data = results
      .filter((r): r is PromiseFulfilledResult<TickerDividend> => r.status === 'fulfilled')
      .map((r) => r.value)

    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
