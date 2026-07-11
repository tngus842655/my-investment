import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 시장별 야후 심볼 서픽스 — 프론트 src/config/marketConfig.ts와 동일한 맵 (국가 추가 시 양쪽 함께 수정)
// 6자리 숫자 티커는 KR로 간주 (CN도 6자리지만 시장 정보가 없는 이 API에서는 KR 우선. CN 지원 시 market 파라미터 도입 필요)
const MARKET_SUFFIXES: Record<string, string[]> = {
  KR: ['.KS', '.KQ'],
  US: [],
  JP: ['.T'],
  CN: ['.SS', '.SZ'],
}

const symbolCandidates = (ticker: string): string[] => {
  if (/^\d{6}$/.test(ticker)) return MARKET_SUFFIXES.KR!.map((s) => `${ticker}${s}`)
  return [ticker]
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

    const [startYear, startMonth] = start_ym.split('-').map(Number)
    const startUnix = Math.floor(new Date(startYear, startMonth - 1, 1).getTime() / 1000)
    const nowUnix = Math.floor(Date.now() / 1000)

    // 심볼 후보를 순서대로 시도 (KR: KOSPI 실패 시 KOSDAQ 재시도)
    // deno-lint-ignore no-explicit-any
    let result: any = null
    for (const symbol of symbolCandidates(ticker.toUpperCase())) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&period1=${startUnix}&period2=${nowUnix}&events=adjclose`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      })
      if (!res.ok) continue
      const json = await res.json()
      const r = json?.chart?.result?.[0]
      if (r) { result = r; break }
    }

    if (!result) {
      return new Response(JSON.stringify({ error: 'ticker_not_found' }), {
        status: 200,
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
      return new Response(JSON.stringify({ error: 'ticker_not_found' }), {
        status: 200,
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

    // MDD + 최고 평가금액 계산
    let peak = 0
    let peakYm = ''
    let mdd = 0
    let mddYm = ''
    for (const m of monthly) {
      if (m.evalAmount > peak) { peak = m.evalAmount; peakYm = m.ym }
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
          peakEval: peak,
          peakYm,
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
