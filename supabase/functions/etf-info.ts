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

// Yahoo Finance crumb 획득 (quoteSummary 인증용)
const getCrumb = async (): Promise<{ crumb: string; cookie: string } | null> => {
  try {
    // 쿠키 세션 시작
    const loginRes = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
      redirect: 'follow',
    })
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''

    // crumb 획득
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/plain', Cookie: cookie },
    })
    if (!crumbRes.ok) return null
    const crumb = await crumbRes.text()
    return { crumb, cookie }
  } catch {
    return null
  }
}

const fetchEtfInfoBySymbol = async (
  ticker: string,
  symbol: string,
  crumb: string | null,
  cookie: string | null,
): Promise<{ result: Record<string, unknown>; hasChart: boolean }> => {
  const now = Math.floor(Date.now() / 1000)

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json',
  }
  if (cookie) headers['Cookie'] = cookie

  const [summaryRes, chartRes] = await Promise.allSettled([
    crumb
      ? fetch(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,price,fundProfile,quoteType&crumb=${encodeURIComponent(crumb)}`,
          { headers }
        )
      : Promise.reject(new Error('no crumb')),
    fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&period1=0&period2=${now}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    ),
  ])

  const result: Record<string, unknown> = { ticker }
  let hasChart = false

  // chart API에서 기본 정보 + 계산 지표 추출
  if (chartRes.status === 'fulfilled' && chartRes.value.ok) {
    const data = await chartRes.value.json()
    hasChart = !!data?.chart?.result?.[0]
    const meta = data?.chart?.result?.[0]?.meta
    const closes: number[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
    const timestamps: number[] = data?.chart?.result?.[0]?.timestamp ?? []

    // meta에서 기본 정보
    result.name = meta?.longName ?? meta?.shortName ?? ticker
    result.currency = meta?.currency ?? 'USD'
    result.currentPrice = meta?.regularMarketPrice ?? null
    result.week52High = meta?.fiftyTwoWeekHigh ?? null
    result.week52Low = meta?.fiftyTwoWeekLow ?? null

    // 월별 종가로 CAGR, MDD, 변동성 계산
    const valid = closes
      .map((c, i) => ({ c, t: timestamps[i] }))
      .filter((x): x is { c: number; t: number } => x.c != null && x.t != null)

    if (valid.length >= 2) {
      const first = valid[0]!
      const last = valid[valid.length - 1]!
      const years = (last.t - first.t) / (60 * 60 * 24 * 365.25)
      result.cagr = years > 0 ? Math.pow(last.c / first.c, 1 / years) - 1 : null
      result.inceptionDate = new Date(first.t * 1000).toISOString().slice(0, 10)

      let peak = valid[0]!.c
      let mdd = 0
      for (const { c } of valid) {
        if (c > peak) peak = c
        const dd = (c - peak) / peak
        if (dd < mdd) mdd = dd
      }
      result.mdd = mdd

      const monthlyReturns = valid.slice(1).map((v, i) => v.c / valid[i]!.c - 1)
      const mean = monthlyReturns.reduce((s, r) => s + r, 0) / monthlyReturns.length
      const variance = monthlyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / monthlyReturns.length
      result.volatility = Math.sqrt(variance) * Math.sqrt(12)

      // 프론트에서 공통 구간 재계산을 위해 raw 데이터 전달
      result.chartData = valid.map((x) => ({ t: x.t, c: x.c }))
    }
  }

  // quoteSummary에서 배당률, 운용보수, 베타 추출
  if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
    const data = await summaryRes.value.json()
    const detail = data?.quoteSummary?.result?.[0]?.summaryDetail
    const stats = data?.quoteSummary?.result?.[0]?.defaultKeyStatistics
    const fund = data?.quoteSummary?.result?.[0]?.fundProfile
    const price = data?.quoteSummary?.result?.[0]?.price
    const quoteType = data?.quoteSummary?.result?.[0]?.quoteType

    // 이름이 chart meta에서 안 온 경우 보완
    if (!result.name || result.name === ticker) {
      result.name = quoteType?.longName ?? price?.longName ?? price?.shortName ?? ticker
    }

    result.dividendYield = detail?.yield?.raw ?? detail?.trailingAnnualDividendYield?.raw ?? detail?.dividendYield?.raw ?? null
    result.expenseRatio = fund?.feesExpensesInvestment?.annualReportExpenseRatio?.raw ?? stats?.annualReportExpenseRatio?.raw ?? null
    result.beta = stats?.beta?.raw ?? stats?.beta3Year?.raw ?? null
    result.totalAssets = detail?.totalAssets?.raw ?? stats?.totalAssets?.raw ?? null
    result.fundFamily = fund?.family ?? null
    result.category = fund?.categoryName ?? null
  }

  return { result, hasChart }
}

// 심볼 후보를 순서대로 시도 (KR: KOSPI 실패 시 KOSDAQ 재시도)
const fetchEtfInfo = async (ticker: string, crumb: string | null, cookie: string | null) => {
  const candidates = symbolCandidates(ticker)
  let last: Record<string, unknown> = { ticker }
  for (const symbol of candidates) {
    const { result, hasChart } = await fetchEtfInfoBySymbol(ticker, symbol, crumb, cookie)
    last = result
    if (hasChart) return result
  }
  return last
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

    const auth = await getCrumb()
    const results = await Promise.allSettled(
      tickers.map((t) => fetchEtfInfo(t, auth?.crumb ?? null, auth?.cookie ?? null))
    )
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
