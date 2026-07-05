# EDGE_FUNCTIONS.md

Supabase Edge Functions (`supabase/functions/`) 정리. 모두 CORS `*` 허용, `OPTIONS` 프리플라이트 처리 포함.

#### stock-price

주식/ETF/암호화폐 현재가 조회. `src/services/market.ts`에서 호출.

- **파라미터**: `{ ticker, asset_type, currency }`
- **응답**: `{ ticker, price }`
- **로직**: 국내주식(`asset_type === '국내주식'` 또는 `ETF`+`KRW` 또는 6자리 숫자 티커)이면 Yahoo Finance chart API로 KOSPI(`.KS`) 조회 후 실패 시 KOSDAQ(`.KQ`) 재시도. 그 외(해외주식/암호화폐)는 Finnhub API 사용 (`FINNHUB_API_KEY` 환경변수 필요, 암호화폐는 `BINANCE:{ticker}USDT` 심볼).

```ts
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
```

#### exchange-rate

환율 조회. `src/services/market.ts`에서 호출.

- **파라미터**: `{ from, to }`
- **응답**: `{ rate, from, to }`
- **로직**: 무료 API `open.er-api.com/v6/latest/{from}` 호출 (API 키 불필요), `rates[to]` 값 반환.

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { from, to } = await req.json()

    if (!from || !to) {
      return new Response(JSON.stringify({ error: 'from and to are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 무료 환율 API (키 불필요)
    const response = await fetch(`https://open.er-api.com/v6/latest/${from}`)

    const data = await response.json()

    // data.rates.KRW 형태로 반환됨
    const rate = data?.rates?.[to]

    if (!rate) {
      return new Response(JSON.stringify({ error: `Rate not found for ${from}/${to}` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ rate, from, to }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
```

#### etf-info

ETF 상세 정보(현재가/52주 고저/CAGR/MDD/변동성/배당률/운용보수/베타 등) 조회. `EtfAnalysisView.vue`에서 호출.

- **파라미터**: `{ tickers: string[] }`
- **응답**: `{ data: [...] }` (티커별 정보 배열, 실패한 티커는 결과에서 제외)
- **로직**: Yahoo Finance `chart` API(월봉, 기본 정보 + CAGR/MDD/변동성 계산)와 `quoteSummary` API(배당률/운용보수/베타 등, crumb 인증 필요)를 병렬 조회 후 병합. 국내 6자리 티커는 `.KS` 심볼로 변환.

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const yahooSymbol = (ticker: string): string => {
  if (/^\d{6}$/.test(ticker)) return `${ticker}.KS`
  return ticker
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

const fetchEtfInfo = async (ticker: string, crumb: string | null, cookie: string | null) => {
  const symbol = yahooSymbol(ticker)
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

  // chart API에서 기본 정보 + 계산 지표 추출
  if (chartRes.status === 'fulfilled' && chartRes.value.ok) {
    const data = await chartRes.value.json()
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
```

#### etf-backtest

적립식(DCA) 백테스트 시뮬레이션. `EtfBacktestView.vue`에서 호출.

- **파라미터**: `{ ticker, monthly_amount, start_ym }` (`start_ym`은 `"YYYY-MM"`)
- **응답**: `{ ticker, name, currency, monthly: [...], summary: { totalInvested, evalAmount, profit, totalReturn, cagr, mdd, mddYm, peakEval, peakYm, months, startYm, endYm } }`
- **로직**: Yahoo Finance `chart` API로 시작월~현재까지 월별 종가(adjclose 우선) 조회, 매월 말 `monthly_amount`만큼 매수했다고 가정하고 누적 매입금액/평가금액/CAGR/MDD 계산. 티커 없거나 데이터 없으면 `{ error: 'ticker_not_found' }`를 status 200으로 반환.

```ts
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
      return new Response(JSON.stringify({ error: `ticker_not_found` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) {
      return new Response(JSON.stringify({ error: 'No data found for ticker' }), {
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
```

#### etf-dividend

배당 캘린더(과거 배당 이력 + 다음 예정 배당락일) 조회. `DividendCalendarView.vue`에서 호출.

- **파라미터**: `{ tickers: { ticker, currency }[] }`
- **응답**: `{ data: [{ ticker, currency, dividends: [{ date, amount, type: 'ex' | 'next' }] }] }`
- **로직**: Yahoo Finance `chart` API(`events=dividends`)로 과거 배당 이력, `quoteSummary`(`calendarEvents`)로 다음 배당락일 조회 후 병합·정렬. 국내 6자리 티커(KRW)는 `.KS` 심볼로 변환.

```ts
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
  const from = 0  // 전체 상장 이력

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
```

#### admin-delete-user

관리자 전용 사용자 강제 삭제. `AdminSignupLogView.vue`에서 `fetch`로 직접 호출 (`supabase.functions.invoke` 아님).

- **인증**: `Authorization` 헤더로 호출자 확인 후, `SUPABASE_SERVICE_ROLE_KEY`로 호출자 이메일이 관리자(`tngus842655@gmail.com`)인지 검증. 아니면 401/403.
- **파라미터**: `{ email }`
- **응답**: `{ success: true }`
- **로직**: 이메일로 대상 유저를 찾아 `auth.admin.deleteUser`로 강제 삭제 (CASCADE로 관련 데이터 전부 삭제).

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAIL = 'tngus842655@gmail.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 서비스 롤로 호출자 이메일 확인
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }
  const { data: { user: callerUser } } = await supabaseAdmin.auth.admin.getUserById(user.id)
  if (!callerUser || callerUser.email !== ADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
  }

  const { email } = await req.json()
  if (!email) {
    return new Response(JSON.stringify({ error: 'email required' }), { status: 400, headers: corsHeaders })
  }

  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) {
    return new Response(JSON.stringify({ error: listError.message }), { status: 500, headers: corsHeaders })
  }

  const target = users.find((u) => u.email === email)
  if (!target) {
    return new Response(JSON.stringify({ error: 'No user matching email: ' + email }), { status: 404, headers: corsHeaders })
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(target.id)
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
```

#### admin-reset-password

관리자 전용 비밀번호 초기화. `AdminResetPasswordView.vue`에서 `fetch`로 직접 호출.

- **인증**: admin-delete-user와 동일한 관리자 검증.
- **파라미터**: `{ email, newPassword }` (`newPassword`는 6자 이상)
- **응답**: `{ success: true }`
- **로직**: 이메일로 대상 유저를 찾아 `auth.admin.updateUserById`로 비밀번호 변경.

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAIL = 'tngus842655@gmail.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 호출자가 관리자인지 확인
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }
  const { data: { user: callerUser } } = await supabaseAdmin.auth.admin.getUserById(user.id)
  if (!callerUser || callerUser.email !== ADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
  }

  const { email, newPassword } = await req.json()
  if (!email || !newPassword) {
    return new Response(JSON.stringify({ error: 'email and newPassword required' }), { status: 400, headers: corsHeaders })
  }
  if (newPassword.length < 6) {
    return new Response(JSON.stringify({ error: '비밀번호는 6자 이상이어야 합니다.' }), { status: 400, headers: corsHeaders })
  }

  // 이메일로 유저 조회
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) {
    return new Response(JSON.stringify({ error: listError.message }), { status: 500, headers: corsHeaders })
  }

  const target = users.find((u) => u.email === email)
  if (!target) {
    return new Response(JSON.stringify({ error: '가입되지 않은 이메일입니다.' }), { status: 404, headers: corsHeaders })
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
    password: newPassword,
  })
  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
```

### 공통 환경변수

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: admin-delete-user, admin-reset-password에서 사용
- `FINNHUB_API_KEY`: stock-price에서 해외주식/암호화폐 조회 시 사용
