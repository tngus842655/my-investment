import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const yahooSymbol = (ticker: string): string => {
  if (/^\d{6}$/.test(ticker)) return `${ticker}.KS`
  return ticker
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ticker, monthly_amount, start_ym } = await req.json() as {
      ticker: string
      monthly_amount: number
      start_ym: string // "YYYY-MM"
    }

    if (!ticker || !monthly_amount || !start_ym) {
      return new Response(JSON.stringify({ error: 'ticker, monthly_amount, start_ym are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const symbol = yahooSymbol(ticker.toUpperCase())
    const [startYear, startMonth] = start_ym.split('-').map(Number)
    const startUnix = Math.floor(new Date(startYear, startMonth - 1, 1).getTime() / 1000)
    const nowUnix = Math.floor(Date.now() / 1000)

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&period1=${startUnix}&period2=${nowUnix}&events=adjclose`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Yahoo Finance error: ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) {
      return new Response(JSON.stringify({ error: 'No data found for ticker' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const timestamps: number[] = result.timestamp ?? []
    const adjCloses: number[] = result.indicators?.adjclose?.[0]?.adjclose ?? []
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? []
    const meta = result.meta ?? {}

    // adjclose 우선, 없으면 일반 close 사용
    const prices = timestamps
      .map((t, i) => ({
        ym: new Date(t * 1000).toISOString().slice(0, 7),
        price: (adjCloses[i] ?? closes[i] ?? null) as number | null,
      }))
      .filter((p) => p.price != null && p.price > 0)

    if (prices.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid price data' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DCA 시뮬레이션: 매월 말 종가에 매수
    let totalShares = 0
    let totalInvested = 0
    const monthly: { ym: string; price: number; totalInvested: number; evalAmount: number; shares: number }[] = []

    for (const { ym, price } of prices) {
      const shares = monthly_amount / price
      totalShares += shares
      totalInvested += monthly_amount
      const evalAmount = totalShares * price
      monthly.push({ ym, price, totalInvested, evalAmount, shares: totalShares })
    }

    const last = monthly[monthly.length - 1]!
    const first = monthly[0]!
    const totalReturn = (last.evalAmount - last.totalInvested) / last.totalInvested
    const months = monthly.length
    const years = months / 12
    const cagr = years > 0 ? Math.pow(last.evalAmount / last.totalInvested, 1 / years) - 1 : 0

    // MDD 계산 (평가금액 기준)
    let peak = 0
    let mdd = 0
    let mddYm = ''
    for (const m of monthly) {
      if (m.evalAmount > peak) peak = m.evalAmount
      const dd = peak > 0 ? (m.evalAmount - peak) / peak : 0
      if (dd < mdd) { mdd = dd; mddYm = m.ym }
    }

    return new Response(
      JSON.stringify({
        ticker: ticker.toUpperCase(),
        name: meta.longName ?? meta.shortName ?? ticker.toUpperCase(),
        currency: meta.currency ?? 'USD',
        monthly,
        summary: {
          totalInvested: last.totalInvested,
          evalAmount: last.evalAmount,
          profit: last.evalAmount - last.totalInvested,
          totalReturn,
          cagr,
          mdd,
          mddYm,
          months,
          startYm: first.ym,
          endYm: last.ym,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
