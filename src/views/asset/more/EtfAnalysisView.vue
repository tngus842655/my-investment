<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { getTickerDisplayName } from '@/utils/tickerNames'
import { KR_ETF_NAMES } from '@/utils/tickerNames.kr'
import { useI18n } from 'vue-i18n'
import { formatYearMonth } from '@/utils/dateFormat'
import { formatMoneyIn } from '@/utils/numberFormat'
import { isKoLocale } from '@/plugins/i18n'

const router = useRouter()
const { t } = useI18n()

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
  if (!tA) { showMessage(t('etfAnalysis.enterTicker'), 'warning'); return }
  if (tB && tA === tB) { showMessage(t('etfAnalysis.sameTickers'), 'warning'); return }

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
    showMessage(t('etfAnalysis.loadError'), 'error')
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
      // ko 외 로케일은 한글 단위(조/억) 대신 국제 축약 표기 (₩1.5T / ₩123B)
      if (!isKoLocale()) return formatMoneyIn(v, 'KRW', 'short')
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
  const tags: Array<{ labelKey: string; color: string }> = []
  const name = (info.name ?? '').toLowerCase()
  const cat = (info.category ?? '').toLowerCase()

  if (/^\d{6}$/.test(info.ticker)) tags.push({ labelKey: 'etfAnalysis.domestic', color: 'blue' })
  else tags.push({ labelKey: 'etfAnalysis.overseas', color: 'indigo' })

  if (cat.includes('leveraged') || name.includes('2x') || name.includes('3x') || name.includes('ultra') || name.includes('레버'))
    tags.push({ labelKey: 'etfAnalysis.tags.leverage', color: 'orange' })
  else if (cat.includes('inverse') || name.includes('inverse') || name.includes('short') || name.includes('인버'))
    tags.push({ labelKey: 'etfAnalysis.tags.inverse', color: 'red' })
  else if (name.includes('dividend') || name.includes('income') || name.includes('yield') || name.includes('배당') || cat.includes('dividend'))
    tags.push({ labelKey: 'etfAnalysis.tags.dividend', color: 'green' })

  if (cat.includes('bond') || name.includes('bond') || name.includes('treasury') || name.includes('채권'))
    tags.push({ labelKey: 'etfAnalysis.tags.bond', color: 'teal' })

  return tags
}

const tooltips = computed<Record<string, string>>(() => ({
  cagr: t('etfAnalysis.tooltips.cagr'),
  mdd: t('etfAnalysis.tooltips.mdd'),
  volatility: t('etfAnalysis.tooltips.volatility'),
  beta: t('etfAnalysis.tooltips.beta'),
  ter: t('etfAnalysis.tooltips.ter'),
  dividendYield: t('etfAnalysis.tooltips.dividendYield'),
}))

const aiData = computed(() => {
  const a = dataA.value
  const b = dataB.value
  if (!a) return null

  if (!b) {
    const parts: string[] = []
    if (a.cagr != null) parts.push(`CAGR ${fmt.pct(a.cagr)}`)
    if (a.mdd != null) parts.push(`MDD ${fmt.pct(a.mdd)}`)
    if (a.expenseRatio != null) parts.push(`${t('etfAnalysis.expenseLabel')} ${fmt.pct(a.expenseRatio, 2)}`)
    const risk = a.mdd == null ? '' : a.mdd > -0.2 ? t('etfAnalysis.riskLow') : a.mdd > -0.4 ? t('etfAnalysis.riskMid') : t('etfAnalysis.riskHigh')
    return { mode: 'single' as const, summary: t('etfAnalysis.singleSummary', { ticker: a.ticker, parts: parts.join(', '), risk }) }
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
  if (ws && cagrW === ws && dA?.cagr != null) reasons.push(t('etfAnalysis.reasonCagr'))
  if (ws && mddW  === ws && dA?.mdd  != null) reasons.push(t('etfAnalysis.reasonMdd'))
  if (ws && terW  === ws && a.expenseRatio != null) reasons.push(t('etfAnalysis.reasonTer'))
  if (ws && divW  === ws && (a.dividendYield ?? 0) > 0) reasons.push(t('etfAnalysis.reasonDiv'))

  const closing = tied ? t('etfAnalysis.closingTied')
    : (winnerInfo.expenseRatio ?? 1) < 0.003 && (winnerInfo.dividendYield ?? 0) < 0.01
      ? t('etfAnalysis.closingLongTerm')
      : (winnerInfo.dividendYield ?? 0) > 0.01
        ? t('etfAnalysis.closingDividend')
        : t('etfAnalysis.closingOverall')

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
        <div class="font-weight-bold">{{ $t('etfAnalysis.title') }}</div>
        <div class="text-medium-emphasis">{{ $t('etfAnalysis.subtitle') }}</div>
      </div>
    </div>

    <!-- 입력 -->
    <v-card rounded="xl" class="pa-4 mb-4">

      <!-- 둘 다 해외일 때: 기존 1줄 레이아웃 -->
      <template v-if="marketA === 'overseas' && marketB === 'overseas'">
        <div class="d-flex align-center ga-2 mb-3">
          <v-text-field
            v-model="inputA"
            :label="$t('etfAnalysis.tickerHint')"
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
          <div class="font-weight-bold text-medium-emphasis">vs</div>
          <v-text-field
            v-model="inputB"
            :label="$t('etfAnalysis.compareTickerLabel')"
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
            <v-btn value="overseas" size="x-small" style="flex:1">{{ $t('etfAnalysis.overseas') }}</v-btn>
            <v-btn value="domestic" size="x-small" style="flex:1">{{ $t('etfAnalysis.domestic') }}</v-btn>
          </v-btn-toggle>
          <div style="width:28px" />
          <v-btn-toggle v-model="marketB" density="compact" rounded="lg" mandatory color="primary" variant="outlined" style="flex:1">
            <v-btn value="overseas" size="x-small" style="flex:1">{{ $t('etfAnalysis.overseas') }}</v-btn>
            <v-btn value="domestic" size="x-small" style="flex:1">{{ $t('etfAnalysis.domestic') }}</v-btn>
          </v-btn-toggle>
        </div>
      </template>

      <!-- 하나라도 국내일 때: 2줄 레이아웃 -->
      <template v-else>
        <!-- 기준 ETF -->
        <div class="d-flex align-center justify-space-between mb-1">
          <div class="text-medium-emphasis">{{ $t('etfAnalysis.baseEtf') }}</div>
          <v-btn-toggle v-model="marketA" density="compact" rounded="lg" mandatory color="primary" variant="outlined">
            <v-btn value="overseas" size="x-small">{{ $t('etfAnalysis.overseas') }}</v-btn>
            <v-btn value="domestic" size="x-small">{{ $t('etfAnalysis.domestic') }}</v-btn>
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
            :label="$t('etfAnalysis.searchDomestic')"
            :placeholder="$t('etfAnalysis.searchDomesticPlaceholder')"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            clearable
            auto-select-first
            :no-data-text="$t('etfAnalysis.noSearchResults')"
            :custom-filter="krFilter"
            class="mb-3"
            @keyup.enter="fetchInfo"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="(item as any).raw?.value" />
            </template>
          </v-autocomplete>
          <v-text-field
            v-else
            v-model="inputA"
            :label="$t('etfAnalysis.tickerHint2')"
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
          <v-divider /><span class="text-medium-emphasis font-weight-bold">vs</span><v-divider />
        </div>

        <!-- 비교 ETF -->
        <div class="d-flex align-center justify-space-between mb-1">
          <div class="text-medium-emphasis">{{ $t('etfAnalysis.compareEtf') }} <span style="opacity:0.5">{{ $t('etfAnalysis.optional') }}</span></div>
          <v-btn-toggle v-model="marketB" density="compact" rounded="lg" mandatory color="primary" variant="outlined">
            <v-btn value="overseas" size="x-small">{{ $t('etfAnalysis.overseas') }}</v-btn>
            <v-btn value="domestic" size="x-small">{{ $t('etfAnalysis.domestic') }}</v-btn>
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
            :label="$t('etfAnalysis.searchDomestic')"
            :placeholder="$t('etfAnalysis.searchDomesticPlaceholder')"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            clearable
            auto-select-first
            :no-data-text="$t('etfAnalysis.noSearchResults')"
            :custom-filter="krFilter"
            class="mb-3"
            @keyup.enter="fetchInfo"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="(item as any).raw?.value" />
            </template>
          </v-autocomplete>
          <v-text-field
            v-else
            v-model="inputB"
            :label="$t('etfAnalysis.compareTickerLabel')"
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
        >{{ $t('etfAnalysis.reset') }}</v-btn>
        <v-spacer />
        <v-btn color="primary" rounded="lg" :loading="loading" @click="fetchInfo">{{ $t('etfAnalysis.analyze') }}</v-btn>
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
        <i18n-t keypath="etfAnalysis.notFoundBoth" tag="span" scope="global">
          <template #tickerA><strong>{{ inputA.trim().toUpperCase() }}</strong></template>
          <template #tickerB><strong>{{ inputB.trim().toUpperCase() }}</strong></template>
        </i18n-t>
      </template>
      <template v-else-if="notFoundA">
        <i18n-t keypath="etfAnalysis.notFoundA" tag="span" scope="global">
          <template #ticker><strong>{{ inputA.trim().toUpperCase() }}</strong></template>
        </i18n-t>
      </template>
      <template v-else>
        <i18n-t keypath="etfAnalysis.notFoundB" tag="span" scope="global">
          <template #ticker><strong>{{ inputB.trim().toUpperCase() }}</strong></template>
        </i18n-t>
      </template>
      <div class="mt-1 opacity-80">{{ $t('etfAnalysis.notFoundHint') }}</div>
    </v-alert>

    <!-- 빈 상태 -->
    <div v-else-if="!dataA" class="text-center py-12 text-medium-emphasis">
      <v-icon size="48" class="mb-3">mdi-chart-box-outline</v-icon>
      <div>{{ $t('etfAnalysis.enterTickerPrompt') }}</div>
      <div class="mt-1">{{ $t('etfAnalysis.supportHint') }}</div>
    </div>

    <template v-else>
      <!-- ETF 카드 -->
      <div class="d-flex ga-2 mb-3">
        <template v-for="info in ([dataA, dataB].filter(Boolean) as EtfInfo[])" :key="info.ticker">
          <div class="etf-card pa-2">
            <div class="d-flex align-center ga-1 mb-1 flex-wrap">
              <v-chip
                v-for="tag in getEtfTags(info)" :key="tag.labelKey"
                :color="tag.color" size="x-small" variant="tonal"
              >{{ $t(tag.labelKey) }}</v-chip>
            </div>
            <div class="d-flex align-center ga-2 mt-1">
              <div class="font-weight-bold">{{ info.ticker }}</div>
              <div class="font-weight-bold text-primary">{{ fmt.price(info.currentPrice, info.currency) }}</div>
            </div>
            <div class="text-medium-emphasis mt-0" style="line-height:1.3">
              {{ getTickerDisplayName(info.ticker) !== info.ticker ? getTickerDisplayName(info.ticker) : (info.name ?? '') }}
            </div>
            <v-tooltip v-if="info.fundFamily" :text="info.fundFamily" location="bottom" open-on-click open-on-hover>
              <template #activator="{ props }">
                <div v-bind="props" class="fund-family-label text-medium-emphasis mt-1">{{ info.fundFamily }}</div>
              </template>
            </v-tooltip>
          </div>
        </template>
      </div>

      <!-- 기본 정보 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="col-header-row d-flex align-center px-4 pt-3 pb-1">
          <div class="metric-label section-title">{{ $t('etfAnalysis.basicInfo') }}</div>
          <div class="col-header">{{ dataA!.ticker }}</div>
          <div v-if="dataB" class="col-header">{{ dataB.ticker }}</div>
        </div>

        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label">{{ $t('etfAnalysis.aum') }}</div>
          <div class="metric-val font-weight-medium text-right">{{ fmt.aum(dataA!.totalAssets, dataA!.currency) }}</div>
          <div v-if="dataB" class="metric-val font-weight-medium text-right">{{ fmt.aum(dataB.totalAssets, dataB.currency) }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label">{{ $t('etfAnalysis.listingDate') }}</div>
          <div class="metric-val font-weight-medium text-right">{{ fmt.date(dataA!.inceptionDate) }}</div>
          <div v-if="dataB" class="metric-val font-weight-medium text-right">{{ fmt.date(dataB.inceptionDate) }}</div>
        </div>
      </v-card>

      <!-- 공통 구간 안내 배너 -->
      <div v-if="commonPeriod && dataB" class="common-period-banner mb-3">
        <v-icon size="14" color="primary">mdi-calendar-sync-outline</v-icon>
        <span>
          <i18n-t keypath="etfAnalysis.commonPeriodNote" tag="span" scope="global">
            <template #date><strong>{{ formatYearMonth(Number(commonPeriod.startDate.split('-')[0]), Number(commonPeriod.startDate.split('-')[1])) }}</strong></template>
          </i18n-t>
        </span>
      </div>

      <!-- 수익률 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="col-header-row d-flex align-center px-4 pt-3 pb-1">
          <div class="metric-label section-title">{{ $t('etfAnalysis.returnSection') }}</div>
          <div class="col-header">{{ dataA!.ticker }}</div>
          <div v-if="dataB" class="col-header">{{ dataB.ticker }}</div>
        </div>

        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label d-flex align-center ga-1">
            {{ $t('etfAnalysis.cagrLabel') }}
            <v-tooltip :text="tooltips.cagr" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1" :class="cls(dispA?.cagr ?? null, dispB?.cagr ?? null, true, 'a')">
            {{ fmt.pct(dispA?.cagr ?? null) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1" :class="cls(dispA?.cagr ?? null, dispB?.cagr ?? null, true, 'b')">
            {{ fmt.pct(dispB?.cagr ?? null) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label">{{ $t('etfAnalysis.week52High') }}</div>
          <div class="metric-val font-weight-medium text-right">{{ fmt.price(dataA!.week52High, dataA!.currency) }}</div>
          <div v-if="dataB" class="metric-val font-weight-medium text-right">{{ fmt.price(dataB.week52High, dataB.currency) }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label">{{ $t('etfAnalysis.week52Low') }}</div>
          <div class="metric-val font-weight-medium text-right">{{ fmt.price(dataA!.week52Low, dataA!.currency) }}</div>
          <div v-if="dataB" class="metric-val font-weight-medium text-right">{{ fmt.price(dataB.week52Low, dataB.currency) }}</div>
        </div>
      </v-card>

      <!-- 리스크 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="col-header-row d-flex align-center px-4 pt-3 pb-1">
          <div class="metric-label section-title">{{ $t('etfAnalysis.riskSection') }}</div>
          <div class="col-header">{{ dataA!.ticker }}</div>
          <div v-if="dataB" class="col-header">{{ dataB.ticker }}</div>
        </div>

        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label d-flex align-center ga-1">
            {{ $t('etfAnalysis.mddLabel') }}
            <v-tooltip :text="tooltips.mdd" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <!-- MDD는 음수값 → 0에 가까울수록(높을수록) 낙폭 적음 → higherIsBetter: true -->
          <div class="metric-val d-flex align-center justify-end ga-1" :class="cls(dispA?.mdd ?? null, dispB?.mdd ?? null, true, 'a')">
            {{ fmt.pct(dispA?.mdd ?? null) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1" :class="cls(dispA?.mdd ?? null, dispB?.mdd ?? null, true, 'b')">
            {{ fmt.pct(dispB?.mdd ?? null) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label d-flex align-center ga-1">
            {{ $t('etfAnalysis.volatilityLabel') }}
            <v-tooltip :text="tooltips.volatility" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1" :class="cls(dispA?.volatility ?? null, dispB?.volatility ?? null, false, 'a')">
            {{ fmt.pct(dispA?.volatility ?? null) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1" :class="cls(dispA?.volatility ?? null, dispB?.volatility ?? null, false, 'b')">
            {{ fmt.pct(dispB?.volatility ?? null) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label d-flex align-center ga-1">
            {{ $t('etfAnalysis.betaLabel') }}
            <v-tooltip :text="tooltips.beta" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1" :class="cls(dataA!.beta, dataB?.beta ?? null, false, 'a')">
            
            {{ fmt.num(dataA!.beta) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1" :class="cls(dataA!.beta, dataB.beta, false, 'b')">
            
            {{ fmt.num(dataB.beta) }}
          </div>
        </div>
      </v-card>

      <!-- 배당 & 비용 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="col-header-row d-flex align-center px-4 pt-3 pb-1">
          <div class="metric-label section-title">{{ $t('etfAnalysis.dividendSection') }}</div>
          <div class="col-header">{{ dataA!.ticker }}</div>
          <div v-if="dataB" class="col-header">{{ dataB.ticker }}</div>
        </div>

        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label d-flex align-center ga-1">
            {{ $t('etfAnalysis.dividendYieldLabel') }}
            <v-tooltip :text="tooltips.dividendYield" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1" :class="cls(dataA!.dividendYield, dataB?.dividendYield ?? null, true, 'a')">
            
            {{ fmt.pct(dataA!.dividendYield) }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1" :class="cls(dataA!.dividendYield, dataB.dividendYield, true, 'b')">
            
            {{ fmt.pct(dataB.dividendYield) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label d-flex align-center ga-1">
            {{ $t('etfAnalysis.terLabel') }}
            <v-tooltip :text="tooltips.ter" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val d-flex align-center justify-end ga-1" :class="cls(dataA!.expenseRatio, dataB?.expenseRatio ?? null, false, 'a', 2)">
            
            {{ dataA!.expenseRatio != null ? fmt.pct(dataA!.expenseRatio, 2) : '-' }}
          </div>
          <div v-if="dataB" class="metric-val d-flex align-center justify-end ga-1" :class="cls(dataA!.expenseRatio, dataB.expenseRatio, false, 'b', 2)">
            
            {{ dataB.expenseRatio != null ? fmt.pct(dataB.expenseRatio, 2) : '-' }}
          </div>
        </div>
      </v-card>

      <!-- AI 요약 -->
      <v-card v-if="aiData" rounded="xl" class="mb-4 ai-card pa-4">
        <div class="d-flex align-center ga-2 mb-3">
          <v-icon size="18" color="primary">mdi-creation</v-icon>
          <div class="font-weight-bold" style="color: rgb(var(--v-theme-primary))">{{ $t('etfAnalysis.aiTitle') }}</div>
        </div>

        <!-- 단일 ETF -->
        <div v-if="aiData.mode === 'single'" style="line-height:1.7">{{ aiData.summary }}</div>

        <!-- 비교 모드 -->
        <template v-else>
          <div v-if="!aiData.tied" class="ai-winner-row d-flex align-center ga-2 mb-3 pa-3">
            <span style="font-size:1.25rem">🏆</span>
            <div>
              <div class="text-medium-emphasis">{{ $t('etfAnalysis.recommendedEtf') }}</div>
              <div class="font-weight-bold">{{ aiData.winner }}</div>
            </div>
          </div>

          <div v-for="reason in aiData.reasons" :key="reason" class="d-flex align-center ga-2 mb-1">
            <v-icon size="15" color="success">mdi-check-circle-outline</v-icon>
            <div>{{ reason }}</div>
          </div>

          <div class="text-medium-emphasis mt-3">{{ aiData.closing }}</div>
        </template>
      </v-card>

      <div class="text-medium-emphasis">
        {{ $t('etfAnalysis.disclaimer') }}
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
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  line-height: 1.5;
}
.section-title {
  font-size: 0.6875rem;
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
  font-size: 0.75rem;
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
  font-size: 0.75rem;
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
  font-size: 1.125rem;
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
