import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DividendEvent {
  date: string
  amount: number
  type: 'ex' | 'next'  // ex: 과거 배당락일, next: 다음 예정 배당락일
}

interface TickerDividend {
  ticker: string
  dividends: DividendEvent[]
  currency: string
}

const yahooSymbol = (ticker: string, currency: string): string => {
  if (currency === 'KRW' && /^\d{6}$/.test(ticker)) return `${ticker}.KS`
  return ticker
}

const fetchDividends = async (ticker: string, currency: string): Promise<TickerDividend> => {
  const symbol = yahooSymbol(ticker, currency)
  const now = Math.floor(Date.now() / 1000)
  const from = now - 60 * 60 * 24 * 365 * 5

  // 과거 배당 이력 + 다음 배당락일 동시 조회
  const [chartRes, summaryRes] = await Promise.allSettled([
    fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${from}&period2=${now}&events=dividends`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    ),
    fetch(
      `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${symbol}?modules=calendarEvents`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    ),
  ])

  const dividends: DividendEvent[] = []

  // 과거 배당 이력
  if (chartRes.status === 'fulfilled' && chartRes.value.ok) {
    const data = await chartRes.value.json()
    const rawDividends: Record<string, { amount: number; date: number }> =
      data?.chart?.result?.[0]?.events?.dividends ?? {}

    for (const d of Object.values(rawDividends)) {
      dividends.push({
        date: new Date(d.date * 1000).toISOString().slice(0, 10),
        amount: d.amount,
        type: 'ex',
      })
    }
  }

  // 다음 배당락일 (quoteSummary)
  if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
    const data = await summaryRes.value.json()
    const cal = data?.quoteSummary?.result?.[0]?.calendarEvents
    const exDateTs = cal?.exDividendDate?.raw
    const divAmount = cal?.dividendRate?.raw ?? cal?.dividendYield?.raw ?? null

    if (exDateTs) {
      const exDate = new Date(exDateTs * 1000).toISOString().slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      // 오늘 이후 날짜만 next로 추가 (과거 이력과 중복 방지)
      if (exDate >= today && !dividends.find((d) => d.date === exDate)) {
        dividends.push({
          date: exDate,
          amount: divAmount ?? 0,
          type: 'next',
        })
      }
    }
  }

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
