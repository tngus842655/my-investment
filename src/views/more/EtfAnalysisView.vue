<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { getTickerDisplayName } from '@/utils/tickerNames'
import { KR_ETF_NAMES } from '@/utils/tickerNames.kr'

const router = useRouter()

interface ChartPoint { t: number; c: number }

interface EtfInfo {
  ticker: string
  name: string
  currency: string
  currentPrice: number | null
  dividendYield: number | null
  expenseRatio: number | null
  week52High: number | null
  week52Low: number | null
  beta: number | null
  cagr: number | null
  mdd: number | null
  volatility: number | null
  inceptionDate: string | null
  totalAssets: number | null
  fundFamily: string | null
  category: string | null
  chartData?: ChartPoint[]
}

// ── 국내/해외 모드 ────────────────────────────────────
type Market = 'overseas' | 'domestic'
const marketA = ref<Market>('overseas')
const marketB = ref<Market>('overseas')

// 국내 ETF 자동완성 목록
const krEtfItems = Object.entries(KR_ETF_NAMES).map(([code, name]) => ({
  title: `${name} (${code})`,
  value: code,
  name,
}))

const krFilter = (_value: string, query: string, item?: { raw: { title: string } }) => {
  if (!item) return false
  const q = query.replace(/\s/g, '').toLowerCase()
  const t = item.raw.title.replace(/\s/g, '').toLowerCase()
  return t.includes(q)
}

const searchA = ref('')
const searchB = ref('')

const filteredA = computed(() => (searchA.value ?? '').trim().length === 0 ? [] : krEtfItems)
const filteredB = computed(() => (searchB.value ?? '').trim().length === 0 ? [] : krEtfItems)

// 국내 모드: 선택된 ETF 객체 (코드는 .value, 한글명은 .name)
const selectedA = ref<{ value: string; name: string } | null>(null)
const selectedB = ref<{ value: string; name: string } | null>(null)

// fetchInfo에서 사용할 실제 티커 코드
const inputA = ref('')
const inputB = ref('')

// 국내 모드 변경 시 초기화
watch(marketA, () => { inputA.value = ''; searchA.value = ''; selectedA.value = null; notFoundA.value = false })
watch(marketB, () => { inputB.value = ''; searchB.value = ''; selectedB.value = null; notFoundB.value = false })

// 국내 선택 시 코드 추출
watch(selectedA, (v) => { inputA.value = v?.value ?? '' })
watch(selectedB, (v) => { inputB.value = v?.value ?? '' })

watch(inputA, (v) => { if (v == null) { inputA.value = '' }; notFoundA.value = false })
watch(inputB, (v) => { if (v == null) { inputB.value = '' }; notFoundB.value = false })

const sanitizeTicker = (v: string) => v.replace(/[^A-Za-z0-9.-]/g, '')
const onInputA = (e: Event) => { inputA.value = sanitizeTicker((e.target as HTMLInputElement).value) }
const onInputB = (e: Event) => { inputB.value = sanitizeTicker((e.target as HTMLInputElement).value) }

const dataA = ref<EtfInfo | null>(null)
const dataB = ref<EtfInfo | null>(null)
const loading = ref(false)
const notFoundA = ref(false)
const notFoundB = ref(false)

const isEmptyResult = (info: EtfInfo) =>
  info.currentPrice == null && info.totalAssets == null && info.cagr == null && info.mdd == null

const fetchInfo = async () => {
  const tA = inputA.value.trim().toUpperCase()
  const tB = inputB.value.trim().toUpperCase()
  if (!tA) { showMessage('티커를 입력해주세요.', 'warning'); return }
  if (tB && tA === tB) { showMessage('두 티커가 동일합니다. 서로 다른 티커를 입력해주세요.', 'warning'); return }

  const tickers = [tA, tB].filter(Boolean)
  loading.value = true
  dataA.value = null
  dataB.value = null
  notFoundA.value = false
  notFoundB.value = false

  try {
    const { data, error } = await supabase.functions.invoke('etf-info', { body: { tickers } })
    if (error) throw error
    const list: EtfInfo[] = data.data
    const resA = list[0] ?? null
    const resB = list[1] ?? null
    if (resA && isEmptyResult(resA)) { notFoundA.value = true } else { dataA.value = resA }
    if (resB && isEmptyResult(resB)) { notFoundB.value = true } else { dataB.value = resB }
  } catch {
    showMessage('데이터를 불러오는 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

const fmt = {
  pct: (v: number | null, digits = 1) => v == null ? '-' : `${(v * 100).toFixed(digits)}%`,
  price: (v: number | null, currency: string) => {
    if (v == null) return '-'
    return currency === 'KRW' ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`
  },
  num: (v: number | null, digits = 2) => v == null ? '-' : v.toFixed(digits),
  aum: (v: number | null, currency: string) => {
    if (v == null) return '-'
    if (currency === 'KRW') {
      if (v >= 1e12) return `₩${(v / 1e12).toFixed(1)}조`
      return `₩${(v / 1e8).toFixed(0)}억`
    }
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
    return `$${Math.round(v).toLocaleString()}`
  },
  date: (d: string | null) => {
    if (!d) return '-'
    const [y, m] = d.split('-')
    return `${y}.${m}`
  },
}

// ── 공통 구간 재계산 ──────────────────────────────
const calcMetrics = (points: ChartPoint[]): { cagr: number | null; mdd: number | null; volatility: number | null } => {
  if (points.length < 2) return { cagr: null, mdd: null, volatility: null }
  const first = points[0]!
  const last = points[points.length - 1]!
  const years = (last.t - first.t) / (60 * 60 * 24 * 365.25)
  const cagr = years > 0 ? Math.pow(last.c / first.c, 1 / years) - 1 : null

  let peak = first.c, mdd = 0
  for (const { c } of points) {
    if (c > peak) peak = c
    const dd = (c - peak) / peak
    if (dd < mdd) mdd = dd
  }

  const returns = points.slice(1).map((v, i) => v.c / points[i]!.c - 1)
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length
  const volatility = Math.sqrt(variance) * Math.sqrt(12)

  return { cagr, mdd, volatility }
}

// 두 ETF 비교 시 공통 구간(늦게 상장한 쪽 기준) 재계산 결과
const commonPeriod = computed<{ startDate: string; a: ReturnType<typeof calcMetrics>; b: ReturnType<typeof calcMetrics> } | null>(() => {
  const a = dataA.value
  const b = dataB.value
  if (!a || !b || !a.chartData || !b.chartData) return null

  // 두 ETF 중 나중 상장일을 공통 시작 timestamp로
  const startT = Math.max(a.chartData[0]!.t, b.chartData[0]!.t)
  const sliceA = a.chartData.filter((p) => p.t >= startT)
  const sliceB = b.chartData.filter((p) => p.t >= startT)
  if (sliceA.length < 2 || sliceB.length < 2) return null

  const startDate = new Date(startT * 1000).toISOString().slice(0, 7)
  return { startDate, a: calcMetrics(sliceA), b: calcMetrics(sliceB) }
})

// 비교 모드에서 표시할 CAGR/MDD/변동성 (공통 구간 우선)
const dispA = computed(() => commonPeriod.value ? { ...dataA.value, ...commonPeriod.value.a } : dataA.value)
const dispB = computed(() => commonPeriod.value ? { ...dataB.value, ...commonPeriod.value.b } : dataB.value)

// higherIsBetter: MDD는 음수이므로 높을수록(0에 가까울수록) 낙폭이 적어 good → true
// precision: % 표시 소수점 자리수 (1 → 0.1% 단위 비교, 2 → 0.01% 단위 비교)
const roundPct = (v: number, precision: number) => {
  const factor = Math.pow(10, precision + 2)
  return Math.round(v * factor) / factor
}

const better = (a: number | null, b: number | null, higherIsBetter: boolean, precision = 1): 'a' | 'b' | null => {
  if (a == null || b == null) return null
  const ra = roundPct(a, precision), rb = roundPct(b, precision)
  if (ra === rb) return null
  return (higherIsBetter ? ra > rb : ra < rb) ? 'a' : 'b'
}

const cls = (a: number | null, b: number | null, higherIsBetter: boolean, side: 'a' | 'b', precision = 1): string => {
  if (!dataB.value) return ''
  const w = better(a, b, higherIsBetter, precision)
  if (w == null) return ''
  return w === side ? 'winner' : 'loser'
}


const getEtfTags = (info: EtfInfo) => {
  const tags: Array<{ label: string; color: string }> = []
  const name = (info.name ?? '').toLowerCase()
  const cat = (info.category ?? '').toLowerCase()

  if (/^\d{6}$/.test(info.ticker)) tags.push({ label: '국내', color: 'blue' })
  else tags.push({ label: '해외', color: 'indigo' })

  if (cat.includes('leveraged') || name.includes('2x') || name.includes('3x') || name.includes('ultra') || name.includes('레버'))
    tags.push({ label: '레버리지', color: 'orange' })
  else if (cat.includes('inverse') || name.includes('inverse') || name.includes('short') || name.includes('인버'))
    tags.push({ label: '인버스', color: 'red' })
  else if (name.includes('dividend') || name.includes('income') || name.includes('yield') || name.includes('배당') || cat.includes('dividend'))
    tags.push({ label: '배당', color: 'green' })

  if (cat.includes('bond') || name.includes('bond') || name.includes('treasury') || name.includes('채권'))
    tags.push({ label: '채권', color: 'teal' })

  return tags
}

const tooltips: Record<string, string> = {
  cagr: '연평균 복리 수익률. 상장 이후 매년 이 비율로 성장했을 때 현재 가치에 도달합니다. 높을수록 좋습니다.',
  mdd: '최대 낙폭(Max Drawdown). 최고점 대비 최대 하락 폭. 절대값이 작을수록(0에 가까울수록) 리스크가 낮습니다.',
  volatility: '연간 변동성. 월간 수익률의 표준편차를 연율화한 수치. 낮을수록 가격이 안정적입니다.',
  beta: '시장 민감도. S&P 500 대비 움직임. 1이면 시장과 동일, 1 이상이면 더 크게 움직입니다.',
  ter: '운용보수(TER). 매년 ETF 운용에 드는 비용 비율. 낮을수록 장기 수익률에 유리합니다.',
  dividendYield: '최근 12개월 지급 배당금의 현재가 대비 비율입니다.',
}

const aiData = computed(() => {
  const a = dataA.value
  const b = dataB.value
  if (!a) return null

  if (!b) {
    const parts: string[] = []
    if (a.cagr != null) parts.push(`CAGR ${fmt.pct(a.cagr)}`)
    if (a.mdd != null) parts.push(`MDD ${fmt.pct(a.mdd)}`)
    if (a.expenseRatio != null) parts.push(`운용보수 ${fmt.pct(a.expenseRatio, 2)}`)
    const risk = a.mdd == null ? '' : a.mdd > -0.2 ? '낮은' : a.mdd > -0.4 ? '중간 수준의' : '높은'
    return { mode: 'single' as const, summary: `${a.ticker}은 ${parts.join(', ')}의 ETF입니다. 리스크는 ${risk} 편입니다.` }
  }

  const dA = dispA.value
  const dB = dispB.value
  const cagrW = better(dA?.cagr ?? null, dB?.cagr ?? null, true)
  const mddW  = better(dA?.mdd  ?? null, dB?.mdd  ?? null, true)
  const terW  = better(a.expenseRatio,  b.expenseRatio,  false, 2)
  const divW  = better(a.dividendYield, b.dividendYield, true)

  let aScore = 0, bScore = 0
  ;[cagrW, mddW, terW, divW].forEach(w => { if (w === 'a') aScore++; else if (w === 'b') bScore++ })

  const tied = aScore === bScore
  const ws = tied ? null : (aScore > bScore ? 'a' : 'b')
  const winnerInfo = ws === 'b' ? b : a
  const winnerTicker = ws === 'b' ? b.ticker : a.ticker

  const reasons: string[] = []
  if (ws && cagrW === ws && dA?.cagr != null) reasons.push('CAGR 수익률 우수')
  if (ws && mddW  === ws && dA?.mdd  != null) reasons.push('최대 낙폭(MDD) 안정적')
  if (ws && terW  === ws && a.expenseRatio != null) reasons.push('운용보수(TER) 저렴')
  if (ws && divW  === ws && (a.dividendYield ?? 0) > 0) reasons.push('배당률 높음')

  const closing = tied ? '두 ETF는 전반적으로 비슷한 수준입니다.'
    : (winnerInfo.expenseRatio ?? 1) < 0.003 && (winnerInfo.dividendYield ?? 0) < 0.01
      ? '장기 적립식 투자에 유리합니다.'
      : (winnerInfo.dividendYield ?? 0) > 0.01
        ? '배당 수익을 원하는 투자자에게 적합합니다.'
        : '종합적으로 더 유리한 ETF입니다.'

  return { mode: 'compare' as const, winner: winnerTicker, reasons, closing, tied }
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex align-center ga-2 mb-6">
      <v-btn icon size="small" variant="text" @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div>
        <div class="text-h5 font-weight-bold">ETF 분석 & 비교</div>
        <div class="text-body-2 text-medium-emphasis">CAGR · MDD · 변동성 · 배당률 · 운용보수</div>
      </div>
    </div>

    <!-- 입력 -->
    <v-card rounded="xl" class="pa-4 mb-4">

      <!-- 둘 다 해외일 때: 기존 1줄 레이아웃 -->
      <template v-if="marketA === 'overseas' && marketB === 'overseas'">
        <div class="d-flex align-center ga-2 mb-3">
          <v-text-field
            v-model="inputA"
            label="티커 (예: SPY)"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            clearable
            maxlength="10"
            style="flex:1"
            @input="onInputA"
            @keyup.enter="fetchInfo"
          />
          <div class="text-body-2 font-weight-bold text-medium-emphasis">vs</div>
          <v-text-field
            v-model="inputB"
            label="비교 티커 (선택)"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            clearable
            maxlength="10"
            style="flex:1"
            @input="onInputB"
            @keyup.enter="fetchInfo"
          />
        </div>
        <div class="d-flex align-center ga-1 mb-3">
          <v-btn-toggle v-model="marketA" density="compact" rounded="lg" mandatory color="primary" variant="outlined" style="flex:1">
            <v-btn value="overseas" size="x-small" style="flex:1">해외</v-btn>
            <v-btn value="domestic" size="x-small" style="flex:1">국내</v-btn>
          </v-btn-toggle>
          <div style="width:28px" />
          <v-btn-toggle v-model="marketB" density="compact" rounded="lg" mandatory color="primary" variant="outlined" style="flex:1">
            <v-btn value="overseas" size="x-small" style="flex:1">해외</v-btn>
            <v-btn value="domestic" size="x-small" style="flex:1">국내</v-btn>
          </v-btn-toggle>
        </div>
      </template>

      <!-- 하나라도 국내일 때: 2줄 레이아웃 -->
      <template v-else>
        <!-- 기준 ETF -->
        <div class="d-flex align-center justify-space-between mb-1">
          <div class="text-caption text-medium-emphasis">기준 ETF</div>
          <v-btn-toggle v-model="marketA" density="compact" rounded="lg" mandatory color="primary" variant="outlined">
            <v-btn value="overseas" size="x-small">해외</v-btn>
            <v-btn value="domestic" size="x-small">국내</v-btn>
          </v-btn-toggle>
        </div>
        <div :key="`field-a-${marketA}`">
          <v-autocomplete
            v-if="marketA === 'domestic'"
            v-model="selectedA"
            v-model:search="searchA"
            :items="filteredA"
            item-title="name"
            return-object
            label="국내 ETF 검색"
            placeholder="TIGER 미국S&P500 등 종목명 입력"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            clearable
            auto-select-first
            no-data-text="검색 결과가 없습니다"
            :custom-filter="krFilter"
            class="mb-3"
            @keyup.enter="fetchInfo"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="item.raw?.value" />
            </template>
          </v-autocomplete>
          <v-text-field
            v-else
            v-model="inputA"
            label="티커 (예: SPY, QQQ)"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            clearable
            maxlength="10"
            class="mb-3"
            @input="onInputA"
            @keyup.enter="fetchInfo"
          />
        </div>

        <!-- 구분선 -->
        <div class="d-flex align-center ga-2 mb-3">
          <v-divider /><span class="text-caption text-medium-emphasis font-weight-bold">vs</span><v-divider />
        </div>

        <!-- 비교 ETF -->
        <div class="d-flex align-center justify-space-between mb-1">
          <div class="text-caption text-medium-emphasis">비교 ETF <span style="opacity:0.5">(선택)</span></div>
          <v-btn-toggle v-model="marketB" density="compact" rounded="lg" mandatory color="primary" variant="outlined">
            <v-btn value="overseas" size="x-small">해외</v-btn>
            <v-btn value="domestic" size="x-small">국내</v-btn>
          </v-btn-toggle>
        </div>
        <div :key="`field-b-${marketB}`">
          <v-autocomplete
            v-if="marketB === 'domestic'"
            v-model="selectedB"
            v-model:search="searchB"
            :items="filteredB"
            item-title="name"
            return-object
            label="국내 ETF 검색"
            placeholder="TIGER 미국S&P500 등 종목명 입력"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            clearable
            auto-select-first
            no-data-text="검색 결과가 없습니다"
            :custom-filter="krFilter"
            class="mb-3"
            @keyup.enter="fetchInfo"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="item.raw?.value" />
            </template>
          </v-autocomplete>
          <v-text-field
            v-else
            v-model="inputB"
            label="비교 티커 (선택)"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            clearable
            maxlength="10"
            class="mb-3"
            @input="onInputB"
            @keyup.enter="fetchInfo"
          />
        </div>
      </template>

      <div class="d-flex align-center ga-2">
        <v-btn
          v-if="dataA || inputA || inputB"
          variant="text"
          size="small"
          rounded="lg"
          @click="inputA = ''; inputB = ''; searchA = ''; searchB = ''; selectedA = null; selectedB = null; dataA = null; dataB = null"
        >초기화</v-btn>
        <v-spacer />
        <v-btn color="primary" rounded="lg" :loading="loading" @click="fetchInfo">분석</v-btn>
      </div>
    </v-card>

    <!-- 로딩 -->
    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <!-- 미발견 안내 -->
    <v-alert
      v-if="!loading && (notFoundA || notFoundB)"
      type="warning"
      variant="tonal"
      rounded="xl"
      class="mb-3"
      icon="mdi-magnify-close"
    >
      <template v-if="notFoundA && notFoundB">
        <strong>{{ inputA.trim().toUpperCase() }}</strong>, <strong>{{ inputB.trim().toUpperCase() }}</strong> 모두 찾을 수 없는 티커입니다.
      </template>
      <template v-else-if="notFoundA">
        <strong>{{ inputA.trim().toUpperCase() }}</strong> 티커를 찾을 수 없습니다.
      </template>
      <template v-else>
        <strong>{{ inputB.trim().toUpperCase() }}</strong> 티커를 찾을 수 없습니다.
      </template>
      <div class="text-caption mt-1 opacity-80">미국 ETF(SPY, QQQ 등) 또는 국내 ETF 코드(069500 등)를 확인해주세요.</div>
    </v-alert>

    <!-- 빈 상태 -->
    <div v-else-if="!dataA" class="text-center py-12 text-medium-emphasis">
      <v-icon size="48" class="mb-3">mdi-chart-box-outline</v-icon>
      <div class="text-body-2">티커를 입력하고 분석 버튼을 눌러주세요.</div>
      <div class="text-caption mt-1">미국 ETF(SPY, QQQ 등) 및 국내 ETF(069500 등) 지원</div>
    </div>

    <template v-else>
      <!-- ETF 카드 -->
      <div class="d-flex ga-2 mb-3">
        <template v-for="info in ([dataA, dataB].filter(Boolean) as EtfInfo[])" :key="info.ticker">
          <div class="etf-card pa-2">
            <div class="d-flex align-center ga-1 mb-1 flex-wrap">
              <v-chip
                v-for="tag in getEtfTags(info)" :key="tag.label"
                :color="tag.color" size="x-small" variant="tonal"
              >{{ tag.label }}</v-chip>
            </div>
            <div class="d-flex align-center ga-2 mt-1">
              <div class="text-body-2 font-weight-bold">{{ info.ticker }}</div>
              <div class="text-body-2 font-weight-bold text-primary">{{ fmt.price(info.currentPrice, info.currency) }}</div>
            </div>
            <div class="text-caption text-medium-emphasis mt-0" style="line-height:1.3">
              {{ getTickerDisplayName(info.ticker) !== info.ticker ? getTickerDisplayName(info.ticker) : (info.name ?? '') }}
            </div>
            <v-tooltip v-if="info.fundFamily" :text="info.fundFamily" location="bottom" open-on-click open-on-hover>
              <template #activator="{ props }">
                <div v-bind="props" class="fund-family-label text-caption text-medium-emphasis mt-1">{{ info.fundFamily }}</div>
              </template>
            </v-tooltip>
          </div>
        </template>
      </div>

      <!-- 기본 정보 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="col-header-row d-flex align-center px-4 pt-3 pb-1">
          <div class="metric-label section-title">기본 정보</div>
          <div class="col-header">{{ dataA!.ticker }}</div>
          <div v-if="dataB" class="col-header">{{ dataB.ticker }}</div>
        </div>

        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption">운용자산 (AUM)</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.aum(dataA!.totalAssets, dataA!.currency) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.aum(dataB.totalAssets, dataB.currency) }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption">상장일</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.date(dataA!.inceptionDate) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.date(dataB.inceptionDate) }}</div>
        </div>
      </v-card>

      <!-- 공통 구간 안내 배너 -->
      <div v-if="commonPeriod && dataB" class="common-period-banner mb-3">
        <v-icon size="14" color="primary">mdi-calendar-sync-outline</v-icon>
        <span>
          상장일이 달라 <strong>{{ commonPeriod.startDate.replace('-', '년 ') }}월</strong> 이후 공통 구간 기준으로 CAGR · MDD · 변동성을 비교합니다.
        </span>
      </div>

      <!-- 수익률 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="col-header-row d-flex align-center px-4 pt-3 pb-1">
          <div class="metric-label section-title">수익률</div>
          <div class="col-header">{{ dataA!.ticker }}</div>
          <div v-if="dataB" class="col-header">{{ dataB.ticker }}</div>
        </div>

        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption d-flex align-center ga-1">
            CAGR (연평균 수익률)
            <v-tooltip :text="tooltips.cagr" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dispA?.cagr ?? null, dispB?.cagr ?? null, true, 'a')">
            {{ fmt.pct(dispA?.cagr ?? null) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dispA?.cagr ?? null, dispB?.cagr ?? null, true, 'b')">
            {{ fmt.pct(dispB?.cagr ?? null) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption">52주 최고</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataA!.week52High, dataA!.currency) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataB.week52High, dataB.currency) }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption">52주 최저</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataA!.week52Low, dataA!.currency) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataB.week52Low, dataB.currency) }}</div>
        </div>
      </v-card>

      <!-- 리스크 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="col-header-row d-flex align-center px-4 pt-3 pb-1">
          <div class="metric-label section-title">리스크</div>
          <div class="col-header">{{ dataA!.ticker }}</div>
          <div v-if="dataB" class="col-header">{{ dataB.ticker }}</div>
        </div>

        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption d-flex align-center ga-1">
            MDD (최대 낙폭)
            <v-tooltip :text="tooltips.mdd" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <!-- MDD는 음수값 → 0에 가까울수록(높을수록) 낙폭 적음 → higherIsBetter: true -->
          <div class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dispA?.mdd ?? null, dispB?.mdd ?? null, true, 'a')">
            {{ fmt.pct(dispA?.mdd ?? null) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dispA?.mdd ?? null, dispB?.mdd ?? null, true, 'b')">
            {{ fmt.pct(dispB?.mdd ?? null) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption d-flex align-center ga-1">
            연간 변동성
            <v-tooltip :text="tooltips.volatility" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dispA?.volatility ?? null, dispB?.volatility ?? null, false, 'a')">
            {{ fmt.pct(dispA?.volatility ?? null) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dispA?.volatility ?? null, dispB?.volatility ?? null, false, 'b')">
            {{ fmt.pct(dispB?.volatility ?? null) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption d-flex align-center ga-1">
            베타
            <v-tooltip :text="tooltips.beta" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dataA!.beta, dataB?.beta ?? null, false, 'a')">
            
            {{ fmt.num(dataA!.beta) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dataA!.beta, dataB.beta, false, 'b')">
            
            {{ fmt.num(dataB.beta) }}
          </div>
        </div>
      </v-card>

      <!-- 배당 & 비용 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="col-header-row d-flex align-center px-4 pt-3 pb-1">
          <div class="metric-label section-title">배당 & 비용</div>
          <div class="col-header">{{ dataA!.ticker }}</div>
          <div v-if="dataB" class="col-header">{{ dataB.ticker }}</div>
        </div>

        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption d-flex align-center ga-1">
            배당률
            <v-tooltip :text="tooltips.dividendYield" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dataA!.dividendYield, dataB?.dividendYield ?? null, true, 'a')">
            
            {{ fmt.pct(dataA!.dividendYield) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dataA!.dividendYield, dataB.dividendYield, true, 'b')">
            
            {{ fmt.pct(dataB.dividendYield) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption d-flex align-center ga-1">
            운용보수 (TER)
            <v-tooltip :text="tooltips.ter" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dataA!.expenseRatio, dataB?.expenseRatio ?? null, false, 'a', 2)">
            
            {{ dataA!.expenseRatio != null ? fmt.pct(dataA!.expenseRatio, 2) : '-' }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1 text-body-2" :class="cls(dataA!.expenseRatio, dataB.expenseRatio, false, 'b', 2)">
            
            {{ dataB.expenseRatio != null ? fmt.pct(dataB.expenseRatio, 2) : '-' }}
          </div>
        </div>
      </v-card>

      <!-- AI 요약 -->
      <v-card v-if="aiData" rounded="xl" class="mb-4 ai-card pa-4">
        <div class="d-flex align-center ga-2 mb-3">
          <v-icon size="18" color="primary">mdi-creation</v-icon>
          <div class="text-caption font-weight-bold" style="color: rgb(var(--v-theme-primary))">AI 종합 분석</div>
        </div>

        <!-- 단일 ETF -->
        <div v-if="aiData.mode === 'single'" class="text-body-2" style="line-height:1.7">{{ aiData.summary }}</div>

        <!-- 비교 모드 -->
        <template v-else>
          <div v-if="!aiData.tied" class="ai-winner-row d-flex align-center ga-2 mb-3 pa-3">
            <span style="font-size:20px">🏆</span>
            <div>
              <div class="text-caption text-medium-emphasis">추천 ETF</div>
              <div class="text-body-1 font-weight-bold">{{ aiData.winner }}</div>
            </div>
          </div>

          <div v-for="reason in aiData.reasons" :key="reason" class="d-flex align-center ga-2 mb-1">
            <v-icon size="15" color="success">mdi-check-circle-outline</v-icon>
            <div class="text-body-2">{{ reason }}</div>
          </div>

          <div class="text-body-2 text-medium-emphasis mt-3">{{ aiData.closing }}</div>
        </template>
      </v-card>

      <div class="text-caption text-medium-emphasis">
        * Yahoo Finance 데이터 기반 · 투자 판단의 참고 자료로만 활용하세요.
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.etf-card {
  background: rgba(var(--v-theme-primary), 0.05);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
  border-radius: 16px;
  flex: 1 1 0;
  min-width: 0;
}
.common-period-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  line-height: 1.5;
}
.section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.col-header-row {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.metric-row {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.metric-label {
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.5);
  white-space: nowrap;
}
.metric-val {
  min-width: 80px;
  padding-left: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.col-header {
  min-width: 80px;
  padding-left: 12px;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
.tooltip-icon {
  color: rgba(var(--v-theme-on-surface), 0.35);
  cursor: pointer;
}
.winner {
  color: rgb(var(--v-theme-success));
  font-weight: 700;
}
.loser {
  color: rgb(var(--v-theme-error));
}
.trophy-slot {
  width: 18px;
  font-size: 12px;
  flex-shrink: 0;
}
.ai-card {
  background: rgba(var(--v-theme-primary), 0.04);
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
}
.ai-winner-row {
  background: rgba(var(--v-theme-primary), 0.08);
  border-radius: 12px;
}
.fire-score-card {
  background: rgba(var(--v-theme-primary), 0.05);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
  border-radius: 14px;
}
.fire-stars {
  font-size: 18px;
  letter-spacing: 2px;
  color: var(--fp-warning);
}
.fund-family-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
  max-width: 130px;
}
</style>
