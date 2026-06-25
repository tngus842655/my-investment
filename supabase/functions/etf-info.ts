import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const yahooSymbol = (ticker: string): string => {
  if (/^\d{6}$/.test(ticker)) return `${ticker}.KS`
  return ticker
}

const fetchEtfInfo = async (ticker: string) => {
  const symbol = yahooSymbol(ticker)
  const now = Math.floor(Date.now() / 1000)
  const from = 0  // 전체 이력

  const [summaryRes, chartRes] = await Promise.allSettled([
    fetch(
      `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,price`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    ),
    fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&period1=${from}&period2=${now}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    ),
  ])

  const result: Record<string, unknown> = { ticker }

  if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
    const data = await summaryRes.value.json()
    const detail = data?.quoteSummary?.result?.[0]?.summaryDetail
    const stats = data?.quoteSummary?.result?.[0]?.defaultKeyStatistics
    const price = data?.quoteSummary?.result?.[0]?.price

    result.name = price?.longName ?? price?.shortName ?? ticker
    result.currency = detail?.currency ?? 'USD'
    result.currentPrice = price?.regularMarketPrice?.raw ?? null
    result.dividendYield = detail?.dividendYield?.raw ?? null      // 배당률 (소수, 예: 0.035)
    result.expenseRatio = stats?.annualReportExpenseRatio?.raw ?? null  // 운용보수
    result.week52High = detail?.fiftyTwoWeekHigh?.raw ?? null
    result.week52Low = detail?.fiftyTwoWeekLow?.raw ?? null
    result.beta = stats?.beta?.raw ?? null
  }

  if (chartRes.status === 'fulfilled' && chartRes.value.ok) {
    const data = await chartRes.value.json()
    const closes: number[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
    const timestamps: number[] = data?.chart?.result?.[0]?.timestamps ?? []

    const valid = closes
      .map((c, i) => ({ c, t: timestamps[i] }))
      .filter((x) => x.c != null && x.t != null) as { c: number; t: number }[]

    if (valid.length >= 2) {
      // CAGR
      const first = valid[0]!
      const last = valid[valid.length - 1]!
      const years = (last.t - first.t) / (60 * 60 * 24 * 365.25)
      result.cagr = years > 0 ? Math.pow(last.c / first.c, 1 / years) - 1 : null
      result.inceptionDate = new Date(first.t * 1000).toISOString().slice(0, 10)

      // MDD (월별 종가 기준)
      let peak = valid[0]!.c
      let mdd = 0
      for (const { c } of valid) {
        if (c > peak) peak = c
        const dd = (c - peak) / peak
        if (dd < mdd) mdd = dd
      }
      result.mdd = mdd

      // 변동성: 월별 수익률 표준편차 × √12 (연환산)
      const monthlyReturns: number[] = []
      for (let i = 1; i < valid.length; i++) {
        monthlyReturns.push(valid[i]!.c / valid[i - 1]!.c - 1)
      }
      const mean = monthlyReturns.reduce((s, r) => s + r, 0) / monthlyReturns.length
      const variance = monthlyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / monthlyReturns.length
      result.volatility = Math.sqrt(variance) * Math.sqrt(12)  // 연환산
    }
  }

  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { tickers } = await req.json() as { tickers: string[] }
    if (!tickers?.length) {
      return new Response(JSON.stringify({ error: 'tickers required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await Promise.allSettled(tickers.map(fetchEtfInfo))
    const data = results
      .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === 'fulfilled')
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
