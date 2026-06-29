<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'

const router = useRouter()

interface MonthlyPoint {
  ym: string
  price: number
  totalInvested: number
  evalAmount: number
  shares: number
}

interface BacktestResult {
  ticker: string
  name: string
  currency: string
  monthly: MonthlyPoint[]
  summary: {
    totalInvested: number
    evalAmount: number
    profit: number
    totalReturn: number
    cagr: number
    mdd: number
    mddYm: string
    peakEval: number
    peakYm: string
    months: number
    startYm: string
    endYm: string
  }
}

// ── 환율 ─────────────────────────────────────────────
const exchangeRate = ref(1350)

// ── 입력 ─────────────────────────────────────────────
const tickerInput = ref('')
const compareInput = ref('')
const monthlyAmount = ref<number | null>(100)
const startYm = ref('')
const loading = ref(false)
const result = ref<BacktestResult | null>(null)
const compareResult = ref<BacktestResult | null>(null)

// DCA 툴팁 제어 (스크롤 시 닫기)
const dcaOpen = ref(false)
const closeDca = () => { dcaOpen.value = false }

// ── 최근 사용 ETF ─────────────────────────────────────
const RECENT_KEY = 'etf-backtest-recent'
const MAX_RECENT = 5
const recentTickers = ref<string[]>([])

const loadRecent = () => {
  try { recentTickers.value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') }
  catch { recentTickers.value = [] }
}
const saveRecent = (ticker: string) => {
  const list = [ticker, ...recentTickers.value.filter((t) => t !== ticker)].slice(0, MAX_RECENT)
  recentTickers.value = list
  localStorage.setItem(RECENT_KEY, JSON.stringify(list))
}

// 최근 조회 칩이 어느 인풋을 채울지 (null=주 티커, 'compare'=비교 티커)
const recentTarget = ref<'main' | 'compare'>('main')

const tooltips = {
  dca: '매월 일정 금액을 꾸준히 투자하는 전략. 가격이 쌀 때 더 많이, 비쌀 때 더 적게 매수하여 평균 단가를 낮추는 효과가 있습니다.',
  cagr: '연평균 복리 수익률. 투자 기간 전체 수익률을 연 단위로 환산한 값. 높을수록 좋습니다.',
  mdd: '최대 낙폭(Max Drawdown). 투자 기간 중 고점 대비 최대로 하락한 비율. 절대값이 작을수록 리스크가 낮습니다.',
  totalReturn: '투자 원금 대비 현재 평가금액의 총 수익률입니다.',
}

// ── 시작일 선택 ───────────────────────────────────────
type QuickPeriod = '1y' | '3y' | '5y' | '10y' | 'all'
const activePeriod = ref<QuickPeriod | null>('10y')

const quickPeriods: { label: string; value: QuickPeriod }[] = [
  { label: '1년', value: '1y' },
  { label: '3년', value: '3y' },
  { label: '5년', value: '5y' },
  { label: '10년', value: '10y' },
  { label: '전체', value: 'all' },
]


const startYear = ref(new Date().getFullYear() - 10)
const startMonth = ref(new Date().getMonth() + 1)

const yearOptions = computed(() => {
  const end = new Date().getFullYear()
  const opts = []
  for (let y = end; y >= 1990; y--) opts.push({ title: `${y}년`, value: y })
  return opts
})

const monthOptions = Array.from({ length: 12 }, (_, i) => ({ title: `${i + 1}월`, value: i + 1 }))

const applyQuickPeriod = (p: QuickPeriod) => {
  activePeriod.value = p
  const d = new Date()
  if (p === 'all') {
    startYear.value = 1990
    startMonth.value = 1
  } else {
    const years = p === '1y' ? 1 : p === '3y' ? 3 : p === '5y' ? 5 : 10
    d.setFullYear(d.getFullYear() - years)
    startYear.value = d.getFullYear()
    startMonth.value = d.getMonth() + 1
  }
  syncStartYm()
}

const syncStartYm = () => {
  startYm.value = `${startYear.value}-${String(startMonth.value).padStart(2, '0')}`
}

const onManualChange = () => {
  activePeriod.value = null
  syncStartYm()
}

onMounted(async () => {
  applyQuickPeriod('10y')
  loadRecent()
  window.addEventListener('scroll', closeDca, { passive: true })
  exchangeRate.value = await getCachedExchangeRate()
})

onUnmounted(() => {
  window.removeEventListener('scroll', closeDca)
})

const sanitizeTicker = (v: string) => v.replace(/[^A-Za-z0-9.-]/g, '').toUpperCase()

const isUsdMode = computed(() => result.value?.currency !== 'KRW')

const MAX_USD = 100_000  // $100,000
const MAX_KRW = 100_000_000  // 1억원

const monthlyAmountError = computed(() => {
  const v = monthlyAmount.value
  if (v === null || v === undefined || String(v) === '') return ''
  if (!Number.isFinite(v) || v <= 0) return '0보다 큰 금액을 입력해주세요.'
  if (!Number.isInteger(v)) return '소수점 없이 정수로 입력해주세요.'
  if (isUsdMode.value && v > MAX_USD) return `최대 $${MAX_USD.toLocaleString()}까지 입력 가능합니다.`
  if (!isUsdMode.value && v > MAX_KRW) return `최대 ${(MAX_KRW / 10000).toLocaleString()}만원까지 입력 가능합니다.`
  return ''
})

const canRun = computed(() =>
  tickerInput.value.trim().length > 0 &&
  (monthlyAmount.value ?? 0) > 0 &&
  !monthlyAmountError.value &&
  startYm.value.length > 0
)

const fetchBacktest = async (ticker: string): Promise<BacktestResult> => {
  const { data, error } = await supabase.functions.invoke('etf-backtest', {
    body: { ticker, monthly_amount: monthlyAmount.value, start_ym: startYm.value },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as BacktestResult
}

const run = async () => {
  const ticker = sanitizeTicker(tickerInput.value.trim())
  const cTicker = sanitizeTicker(compareInput.value.trim())
  if (!ticker) { showMessage('티커를 입력해주세요.', 'warning'); return }
  if (!monthlyAmount.value || monthlyAmount.value <= 0) { showMessage('월 투자금을 입력해주세요.', 'warning'); return }
  if (cTicker && cTicker === ticker) { showMessage('비교 티커가 기준 티커와 동일합니다.', 'warning'); return }

  loading.value = true
  result.value = null
  compareResult.value = null

  try {
    const tasks = [fetchBacktest(ticker)]
    if (cTicker) tasks.push(fetchBacktest(cTicker))
    const [r, c] = await Promise.all(tasks)
    result.value = r!
    compareResult.value = c ?? null
    saveRecent(ticker)
    if (cTicker) saveRecent(cTicker)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('ticker_not_found') || msg.includes('No data') || msg.includes('No valid')) {
      showMessage('존재하지 않는 티커입니다. 티커를 확인해주세요.', 'warning')
    } else {
      showMessage('데이터를 불러오는 중 오류가 발생했습니다.', 'error')
    }
  } finally {
    loading.value = false
  }
}

// ── 포맷터 ───────────────────────────────────────────
const fmtMoney = (v: number, currency: string) => {
  if (currency === 'KRW') return `₩${Math.round(v).toLocaleString()}`
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
const fmtMoneyKrw = (v: number, currency: string): string | null => {
  if (currency !== 'USD') return null
  const krw = Math.round(v * exchangeRate.value)
  if (krw >= 1e8) return `≈ ₩${(krw / 1e8).toFixed(1)}억`
  if (krw >= 1e4) return `≈ ₩${Math.round(krw / 1e4).toLocaleString()}만`
  return `≈ ₩${krw.toLocaleString()}`
}
const fmtPct = (v: number, digits = 1) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`
const fmtYm = (ym: string) => { const [y, m] = ym.split('-'); return `${y}년 ${Number(m)}월` }
const profitColor = (v: number) => (v >= 0 ? 'success' : 'error')

const periodText = computed(() => {
  const s = result.value?.summary
  if (!s) return ''
  const y = Math.floor(s.months / 12), m = s.months % 12
  if (y === 0) return `${m}개월`
  if (m === 0) return `${y}년`
  return `${y}년 ${m}개월`
})

const summaryText = computed(() => {
  const r = result.value; if (!r) return null
  const s = r.summary
  return {
    intro: `${fmtYm(s.startYm)}부터 매월 ${fmtMoney(monthlyAmount.value ?? 0, r.currency)}씩 ${r.ticker}에 투자했다면`,
    invested: `총 ${fmtMoney(s.totalInvested, r.currency)}를 투자하여`,
    eval: `현재 ${fmtMoney(s.evalAmount, r.currency)}가 되었으며`,
    returns: `총 수익률은 ${fmtPct(s.totalReturn)}, 연평균 수익률은 ${fmtPct(s.cagr)}입니다.`,
  }
})

const mddText = computed(() => result.value?.summary.mddYm ? fmtYm(result.value.summary.mddYm) : null)

// ── 비교 테이블 ──────────────────────────────────────
const compareRows = computed(() => {
  const a = result.value
  const b = compareResult.value
  if (!a || !b) return null
  const sa = a.summary, sb = b.summary
  const better = (va: number, vb: number, higherIsBetter: boolean) =>
    higherIsBetter ? (va >= vb ? 'a' : 'b') : (va <= vb ? 'a' : 'b')
  return [
    {
      label: '최종 평가금액',
      a: fmtMoney(sa.evalAmount, a.currency),
      b: fmtMoney(sb.evalAmount, b.currency),
      win: better(sa.evalAmount, sb.evalAmount, true),
      colorA: profitColor(sa.profit),
      colorB: profitColor(sb.profit),
    },
    {
      label: '총 수익률',
      a: fmtPct(sa.totalReturn),
      b: fmtPct(sb.totalReturn),
      win: better(sa.totalReturn, sb.totalReturn, true),
      colorA: profitColor(sa.totalReturn),
      colorB: profitColor(sb.totalReturn),
    },
    {
      label: 'CAGR',
      a: fmtPct(sa.cagr),
      b: fmtPct(sb.cagr),
      win: better(sa.cagr, sb.cagr, true),
      colorA: profitColor(sa.cagr),
      colorB: profitColor(sb.cagr),
    },
    {
      label: 'MDD',
      a: fmtPct(sa.mdd),
      b: fmtPct(sb.mdd),
      win: better(sa.mdd, sb.mdd, false),
      colorA: 'error',
      colorB: 'error',
    },
  ]
})

// ── SVG 차트 ─────────────────────────────────────────
const VW = 320
const VH = 200
const PAD = { top: 12, right: 16, bottom: 28, left: 12 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

watch(() => result.value, () => { showRecentOnly.value = true })

const filteredPts = computed(() => result.value?.monthly ?? [])
const filteredCmpPts = computed(() => compareResult.value?.monthly ?? [])

// ── 차트 모드 ─────────────────────────────────────────
type ChartMode = 'amount' | 'rate'
const chartMode = ref<ChartMode>('amount')

const returnRate = (p: MonthlyPoint) => (p.evalAmount - p.totalInvested) / p.totalInvested

const buildChart = (pts: MonthlyPoint[], cmpPts: MonthlyPoint[]) => {
  if (pts.length < 2) return null

  const isRate = chartMode.value === 'rate'

  const toVal = (p: MonthlyPoint) => isRate ? returnRate(p) : p.evalAmount
  const toInvest = (p: MonthlyPoint) => isRate ? 0 : p.totalInvested

  const allVals = [
    ...pts.map(toVal),
    ...pts.map(toInvest),
    ...cmpPts.map(toVal),
  ]
  const minY = Math.min(...allVals, isRate ? -0.05 : 0)
  const maxY = Math.max(...allVals) * 1.08
  const rangeY = maxY - minY

  const toX = (i: number, total: number) => PAD.left + (i / (total - 1)) * PW
  const toY = (v: number) => PAD.top + PH - ((v - minY) / rangeY) * PH

  const buildPaths = (data: MonthlyPoint[]) => {
    if (data.length < 2) return { evalPath: '', evalFill: '', investPath: '' }
    const evalPath = data.reduce((acc, p, i) => {
      const x = toX(i, data.length), y = toY(toVal(p))
      return i === 0 ? `M ${x},${y}` : acc + ` L ${x},${y}`
    }, '')
    const investPath = data.reduce((acc, p, i) => {
      const x = toX(i, data.length), y = toY(toInvest(p))
      return i === 0 ? `M ${x},${y}` : acc + ` L ${x},${y}`
    }, '')
    const baseY = toY(isRate ? 0 : minY)
    const evalFill = evalPath + ` L ${toX(data.length - 1, data.length)},${baseY} L ${toX(0, data.length)},${baseY} Z`
    return { evalPath, evalFill, investPath }
  }

  const main = buildPaths(pts)
  const cmp = buildPaths(cmpPts)

  // 수익률 모드 0% 기준선
  const zeroY = isRate ? toY(0) : null

  const yearTicks: { x: number; label: string }[] = []
  let lastYear = ''
  pts.forEach((p, i) => {
    const y = p.ym.slice(0, 4)
    if (y !== lastYear) { lastYear = y; yearTicks.push({ x: toX(i, pts.length), label: y }) }
  })
  const step = Math.max(1, Math.ceil(yearTicks.length / 6))
  const xLabels = yearTicks.filter((_, i) => i % step === 0)

  return { ...main, cmp, xLabels, zeroY, toX: (i: number) => toX(i, pts.length), toY, isRate }
}

const chartSvg = computed(() => buildChart(filteredPts.value, filteredCmpPts.value))

// ── 터치 인터랙션 ─────────────────────────────────────
const svgEl = ref<SVGSVGElement | null>(null)
interface TooltipState {
  visible: boolean; x: number; dotY: number; pt: MonthlyPoint; alignRight: boolean
}
const tooltip = ref<TooltipState | null>(null)

const getIndexFromClientX = (clientX: number, total: number): number => {
  const el = svgEl.value; if (!el) return 0
  const rect = el.getBoundingClientRect()
  const ratio = (clientX - rect.left) / rect.width
  const svgX = ratio * VW
  return Math.max(0, Math.min(total - 1, Math.round((svgX - PAD.left) / PW * (total - 1))))
}

const showTooltip = (clientX: number) => {
  const chart = chartSvg.value; const pts = filteredPts.value
  if (!chart || pts.length < 2) return
  const idx = getIndexFromClientX(clientX, pts.length)
  const pt = pts[idx]!
  const x = chart.toX(idx)
  const dotVal = chart.isRate ? (pt.evalAmount - pt.totalInvested) / pt.totalInvested : pt.evalAmount
  tooltip.value = { visible: true, x, dotY: chart.toY(dotVal), pt, alignRight: x > VW / 2 }
}

const hideTooltip = () => { tooltip.value = null }
const onTouchMove = (e: TouchEvent) => { e.preventDefault(); showTooltip(e.touches[0]!.clientX) }
const onMouseMove = (e: MouseEvent) => { showTooltip(e.clientX) }

// ── 연도별 테이블 ─────────────────────────────────────
const showRecentOnly = ref(true)

const yearlyRows = computed(() => {
  if (!result.value) return []
  const map = new Map<string, MonthlyPoint>()
  for (const m of result.value.monthly) { map.set(m.ym.slice(0, 4), m) }
  const all = [...map.values()]
  return showRecentOnly.value ? all.slice(-5) : all
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex align-center ga-2 mb-5">
      <v-btn icon variant="text" size="small" @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="flex-grow-1">
        <div class="text-h6 font-weight-bold">ETF 백테스트</div>
        <div class="d-flex align-center ga-1 text-caption text-medium-emphasis">
          과거
          <v-tooltip :model-value="dcaOpen" :text="tooltips.dca" location="bottom" max-width="260">
            <template #activator="{ props }">
              <span v-bind="props" class="tooltip-term" @click.stop="dcaOpen = !dcaOpen">DCA</span>
            </template>
          </v-tooltip>
          투자 수익률 시뮬레이션
        </div>
      </div>
    </div>

    <!-- 입력 카드 -->
    <v-card class="glass-card pa-4 mb-4" rounded="xl">
      <div class="d-flex flex-column ga-3">
        <!-- 최근 조회 -->
        <template v-if="recentTickers.length > 0">
          <div>
            <div class="recent-label">최근 조회</div>
            <div class="d-flex flex-wrap ga-2 mt-1">
              <button
                v-for="t in recentTickers"
                :key="t"
                class="recent-chip"
                @click="recentTarget === 'compare' ? (compareInput = t) : (tickerInput = t)"
              >{{ t }}</button>
            </div>
          </div>
        </template>

        <!-- 기준 티커 -->
        <v-text-field
          v-model="tickerInput"
          label="기준 티커 (예: QQQ)"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          :disabled="loading"
          @focus="recentTarget = 'main'"
          @input="(e: Event) => { tickerInput = sanitizeTicker((e.target as HTMLInputElement).value) }"
          @keyup.enter="run"
        />

        <!-- 비교 티커 (선택) -->
        <v-text-field
          v-model="compareInput"
          label="비교 티커 (선택, 예: SPY)"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          :disabled="loading"
          @focus="recentTarget = 'compare'"
          @input="(e: Event) => { compareInput = sanitizeTicker((e.target as HTMLInputElement).value) }"
          @keyup.enter="run"
        />

        <div>
          <v-text-field
            v-model.number="monthlyAmount"
            label="월 투자금"
            variant="outlined"
            density="compact"
            rounded="lg"
            type="number"
            min="1"
            :disabled="loading"
            :error-messages="monthlyAmountError"
            @keyup.enter="run"
          >
            <template #append-inner>
              <span class="text-caption text-medium-emphasis">
                {{ result?.currency === 'KRW' ? '원' : 'USD' }}
              </span>
            </template>
          </v-text-field>
          <div v-if="!monthlyAmountError && result?.currency !== 'KRW' && monthlyAmount && monthlyAmount > 0" class="monthly-krw-hint">
            ≈ ₩{{ Math.round((monthlyAmount ?? 0) * exchangeRate).toLocaleString() }}원/월
          </div>
        </div>

        <!-- 빠른 선택 -->
        <div>
          <div class="quick-label">시작일 빠른 선택</div>
          <div class="d-flex ga-2 mt-1 flex-wrap">
            <button
              v-for="opt in quickPeriods"
              :key="opt.value"
              class="quick-btn"
              :class="{ 'quick-btn--active': activePeriod === opt.value }"
              :disabled="loading"
              @click="applyQuickPeriod(opt.value)"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- 직접 선택 -->
        <div class="d-flex ga-2">
          <v-select
            v-model="startYear"
            :items="yearOptions"
            label="시작 연도"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            :disabled="loading"
            style="flex: 1.4"
            @update:model-value="onManualChange"
          />
          <v-select
            v-model="startMonth"
            :items="monthOptions"
            label="시작 월"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            :disabled="loading"
            style="flex: 1"
            @update:model-value="onManualChange"
          />
        </div>

        <v-btn color="primary" rounded="lg" :disabled="!canRun || loading" :loading="loading" @click="run">
          백테스트 실행
        </v-btn>
      </div>
      <div class="text-caption text-medium-emphasis mt-3">
        * 해외 ETF/주식 전용 · 배당 재투자 포함 근사치 · 세금/수수료 미포함
      </div>
    </v-card>

    <!-- 결과 -->
    <template v-if="result">
      <!-- 기간 헤더 -->
      <div class="d-flex align-center justify-space-between mb-3 px-1">
        <div class="text-body-2 font-weight-bold">
          {{ result.name }} ({{ result.ticker }})
        </div>
        <div class="period-badge">
          {{ fmtYm(result.summary.startYm) }} ~ {{ fmtYm(result.summary.endYm) }}
          <span class="period-duration">{{ periodText }}</span>
        </div>
      </div>

      <!-- ① 최종 평가금액 (강조, 전폭) -->
      <div class="highlight-card-full glass-card rounded-xl pa-4 mb-2">
        <div class="stat-label">최종 평가금액</div>
        <div class="highlight-value text-success">
          {{ fmtMoney(result.summary.evalAmount, result.currency) }}
        </div>
        <div v-if="fmtMoneyKrw(result.summary.evalAmount, result.currency)" class="krw-hint">
          {{ fmtMoneyKrw(result.summary.evalAmount, result.currency) }}
        </div>
        <div class="peak-hint">
          최고 {{ fmtMoney(result.summary.peakEval, result.currency) }} · {{ fmtYm(result.summary.peakYm) }}
        </div>
      </div>

      <!-- ② 총 수익금 + 총 수익률 -->
      <div class="summary-grid mb-2">
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">총 수익금</div>
          <div class="stat-value" :class="`text-${profitColor(result.summary.profit)}`">
            {{ fmtMoney(result.summary.profit, result.currency) }}
          </div>
          <div v-if="fmtMoneyKrw(result.summary.profit, result.currency)" class="stat-krw">
            {{ fmtMoneyKrw(result.summary.profit, result.currency) }}
          </div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label d-flex align-center justify-center ga-1">
            총 수익률
            <v-tooltip :text="tooltips.totalReturn" location="bottom" open-on-click max-width="240">
              <template #activator="{ props }">
                <v-icon v-bind="props" size="12" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="stat-value" :class="`text-${profitColor(result.summary.totalReturn)}`">
            {{ fmtPct(result.summary.totalReturn) }}
          </div>
        </div>
      </div>

      <!-- ③ CAGR + 투자원금 -->
      <div class="summary-grid mb-2">
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label d-flex align-center justify-center ga-1">
            CAGR
            <v-tooltip :text="tooltips.cagr" location="bottom" open-on-click max-width="240">
              <template #activator="{ props }">
                <v-icon v-bind="props" size="12" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="stat-value" :class="`text-${profitColor(result.summary.cagr)}`">
            {{ fmtPct(result.summary.cagr) }}
          </div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">투자원금</div>
          <div class="stat-value">{{ fmtMoney(result.summary.totalInvested, result.currency) }}</div>
          <div v-if="fmtMoneyKrw(result.summary.totalInvested, result.currency)" class="stat-krw">
            {{ fmtMoneyKrw(result.summary.totalInvested, result.currency) }}
          </div>
        </div>
      </div>

      <!-- ④ 투자기간 + MDD -->
      <div class="summary-grid mb-2">
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">투자기간</div>
          <div class="stat-value">{{ periodText }}</div>
          <div class="stat-sub">{{ result.summary.months }}개월</div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label d-flex align-center justify-center ga-1">
            MDD
            <v-tooltip :text="tooltips.mdd" location="bottom" open-on-click max-width="240">
              <template #activator="{ props }">
                <v-icon v-bind="props" size="12" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="stat-value text-error">{{ fmtPct(result.summary.mdd) }}</div>
          <div v-if="mddText" class="mdd-date">{{ mddText }}</div>
        </div>
      </div>

      <!-- ETF 비교 테이블 -->
      <v-card v-if="compareResult && compareRows" class="glass-card pa-4 mb-4" rounded="xl">
        <div class="text-body-2 font-weight-bold mb-3">ETF 비교</div>
        <div class="cmp-header">
          <span />
          <span class="cmp-ticker cmp-ticker--a">{{ result.ticker }}</span>
          <span class="cmp-ticker cmp-ticker--b">{{ compareResult.ticker }}</span>
        </div>
        <div v-for="row in compareRows" :key="row.label" class="cmp-row">
          <span class="cmp-label">{{ row.label }}</span>
          <span
            class="cmp-val"
            :class="[`text-${row.colorA}`, row.win === 'a' ? 'cmp-win' : '']"
          >
            {{ row.a }}
            <v-icon v-if="row.win === 'a'" size="12" color="primary">mdi-crown</v-icon>
          </span>
          <span
            class="cmp-val"
            :class="[`text-${row.colorB}`, row.win === 'b' ? 'cmp-win' : '']"
          >
            {{ row.b }}
            <v-icon v-if="row.win === 'b'" size="12" color="primary">mdi-crown</v-icon>
          </span>
        </div>
      </v-card>

      <!-- 자연어 요약 -->
      <v-card v-if="summaryText" class="glass-card pa-4 mb-4" rounded="xl">
        <div class="d-flex align-start ga-3">
          <v-icon size="18" color="primary" class="mt-1 flex-shrink-0">mdi-text-box-outline</v-icon>
          <div class="summary-text">
            <div class="summary-intro">{{ summaryText.intro }}</div>
            <div class="summary-body">
              {{ summaryText.invested }}<br>
              {{ summaryText.eval }}<br>
              <span class="summary-returns">{{ summaryText.returns }}</span>
            </div>
          </div>
        </div>
      </v-card>

      <!-- SVG 차트 -->
      <v-card class="glass-card pa-4 mb-4" rounded="xl">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="text-body-2 font-weight-bold">누적 자산 추이</div>
        </div>
        <div class="d-flex ga-1 mb-3">
          <button class="mode-btn" :class="{ 'mode-btn--active': chartMode === 'amount' }" @click="chartMode = 'amount'">금액</button>
          <button class="mode-btn" :class="{ 'mode-btn--active': chartMode === 'rate' }" @click="chartMode = 'rate'">수익률</button>
        </div>
        <template v-if="chartSvg">
          <div class="chart-wrap">
            <svg
              ref="svgEl"
              :viewBox="`0 0 ${VW} ${VH}`"
              width="100%"
              :height="VH"
              style="overflow: visible; display: block; touch-action: none"
              @mousemove="onMouseMove"
              @mouseleave="hideTooltip"
              @touchmove.prevent="onTouchMove"
              @touchend="hideTooltip"
            >
              <defs>
                <linearGradient id="btEvalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0.2" />
                  <stop offset="100%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0" />
                </linearGradient>
              </defs>

              <!-- 0% 기준선 (수익률 모드) -->
              <line v-if="chartSvg.zeroY !== null" :x1="PAD.left" :y1="chartSvg.zeroY" :x2="PAD.left + PW" :y2="chartSvg.zeroY" stroke="rgba(var(--v-theme-on-surface), 0.2)" stroke-width="1" stroke-dasharray="4 3" />

              <!-- 투자원금 점선 (금액 모드만) -->
              <path v-if="!chartSvg.isRate" :d="chartSvg.investPath" fill="none" stroke="rgba(var(--v-theme-on-surface), 0.25)" stroke-width="1.5" stroke-dasharray="5 3" />

              <!-- 비교 ETF 라인 -->
              <path v-if="compareResult && chartSvg.cmp.evalPath" :d="chartSvg.cmp.evalPath" fill="none" stroke="rgb(var(--v-theme-warning))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />

              <!-- 기준 ETF 채우기 + 라인 -->
              <path :d="chartSvg.evalFill" fill="url(#btEvalFill)" />
              <path :d="chartSvg.evalPath" fill="none" stroke="rgb(var(--v-theme-primary))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

              <!-- X축 레이블 -->
              <g v-for="tick in chartSvg.xLabels" :key="tick.label">
                <text :x="tick.x" :y="VH - 4" text-anchor="middle" font-size="9" fill="rgba(var(--v-theme-on-surface), 0.4)">{{ tick.label }}</text>
              </g>

              <!-- 터치 가이드 -->
              <template v-if="tooltip">
                <line :x1="tooltip.x" :y1="PAD.top" :x2="tooltip.x" :y2="PAD.top + PH" stroke="rgba(var(--v-theme-on-surface), 0.2)" stroke-width="1" stroke-dasharray="3 2" />
                <circle :cx="tooltip.x" :cy="tooltip.dotY" r="4" fill="rgb(var(--v-theme-primary))" stroke="var(--fp-surface)" stroke-width="2" />
              </template>
            </svg>

            <!-- 툴팁 박스 -->
            <div
              v-if="tooltip"
              class="chart-tooltip"
              :style="{
                left: tooltip.alignRight ? 'auto' : `${tooltip.x / VW * 100}%`,
                right: tooltip.alignRight ? `${(1 - tooltip.x / VW) * 100}%` : 'auto',
              }"
            >
              <div class="ct-date">{{ fmtYm(tooltip.pt.ym) }}</div>
              <template v-if="chartMode === 'amount'">
                <div class="ct-row"><span class="ct-label">투자원금</span><span class="ct-val">{{ fmtMoney(tooltip.pt.totalInvested, result!.currency) }}</span></div>
                <div class="ct-row">
                  <span class="ct-label">평가금액</span>
                  <span class="ct-val" :class="`text-${profitColor(tooltip.pt.evalAmount - tooltip.pt.totalInvested)}`">{{ fmtMoney(tooltip.pt.evalAmount, result!.currency) }}</span>
                </div>
                <div class="ct-row">
                  <span class="ct-label">수익률</span>
                  <span class="ct-val" :class="`text-${profitColor(tooltip.pt.evalAmount - tooltip.pt.totalInvested)}`">{{ fmtPct((tooltip.pt.evalAmount - tooltip.pt.totalInvested) / tooltip.pt.totalInvested) }}</span>
                </div>
              </template>
              <template v-else>
                <div class="ct-row">
                  <span class="ct-label">수익률</span>
                  <span class="ct-val" :class="`text-${profitColor(tooltip.pt.evalAmount - tooltip.pt.totalInvested)}`">{{ fmtPct((tooltip.pt.evalAmount - tooltip.pt.totalInvested) / tooltip.pt.totalInvested) }}</span>
                </div>
                <div class="ct-row">
                  <span class="ct-label">평가금액</span>
                  <span class="ct-val">{{ fmtMoney(tooltip.pt.evalAmount, result!.currency) }}</span>
                </div>
              </template>
            </div>
          </div>

          <!-- 범례 -->
          <div class="d-flex ga-4 mt-2 justify-center flex-wrap">
            <div class="d-flex align-center ga-1">
              <div class="legend-line legend-solid" />
              <span class="text-caption text-medium-emphasis">{{ result.ticker }} 평가금액</span>
            </div>
            <div v-if="compareResult" class="d-flex align-center ga-1">
              <div class="legend-line legend-cmp" />
              <span class="text-caption text-medium-emphasis">{{ compareResult.ticker }} 평가금액</span>
            </div>
            <div v-if="chartMode === 'amount'" class="d-flex align-center ga-1">
              <div class="legend-line legend-dash" />
              <span class="text-caption text-medium-emphasis">투자원금</span>
            </div>
            <div v-if="chartMode === 'rate'" class="d-flex align-center ga-1">
              <div class="legend-line legend-dash" />
              <span class="text-caption text-medium-emphasis">0% 기준선</span>
            </div>
          </div>
        </template>
      </v-card>

      <!-- 연도별 테이블 -->
      <v-card class="glass-card pa-4" rounded="xl">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="text-body-2 font-weight-bold">연도별 스냅샷 (연말 기준)</div>
          <button class="toggle-btn" @click="showRecentOnly = !showRecentOnly">
            {{ showRecentOnly ? '전체 보기' : '최근 5년' }}
          </button>
        </div>
        <div class="yearly-table">
          <div class="yearly-header">
            <span>연도</span><span>투자원금</span><span>평가금액</span><span>수익률</span>
          </div>
          <div v-for="row in yearlyRows" :key="row.ym" class="yearly-row">
            <span class="font-weight-medium">{{ row.ym.slice(0, 4) }}</span>
            <span>{{ fmtMoney(row.totalInvested, result.currency) }}</span>
            <span :class="`text-${profitColor(row.evalAmount - row.totalInvested)}`">{{ fmtMoney(row.evalAmount, result.currency) }}</span>
            <span :class="`text-${profitColor(row.evalAmount - row.totalInvested)}`">{{ fmtPct((row.evalAmount - row.totalInvested) / row.totalInvested) }}</span>
          </div>
        </div>
      </v-card>
    </template>
  </v-container>
</template>

<style scoped>
.glass-card {
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
}

/* ── 빠른 선택 ──────────────────────────────────── */
.quick-label {
  font-size: 11px;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.4);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.quick-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 99px;
  border: 1px solid var(--fp-outline);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.65);
  cursor: pointer;
  transition: all 0.15s;
}

.quick-btn:disabled { opacity: 0.4; cursor: default; }

.quick-btn--active {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: #fff;
}

/* ── 최근 조회 ──────────────────────────────────── */
.recent-label {
  font-size: 11px;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.4);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.recent-chip {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 99px;
  border: 1px solid var(--fp-outline);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.65);
  cursor: pointer;
  transition: all 0.15s;
}

.recent-chip:active { opacity: 0.7; }

/* ── 기간 헤더 ──────────────────────────────────── */
.period-badge {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  text-align: right;
  line-height: 1.5;
}

.period-duration {
  display: block;
  font-weight: 700;
  font-size: 12px;
  color: rgb(var(--v-theme-primary));
}

/* ── 지표 카드 ──────────────────────────────────── */
.highlight-card-full {
  text-align: center;
  margin-bottom: 8px;
}

.krw-hint {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-top: 2px;
}

.monthly-krw-hint {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-top: 4px;
  padding-left: 4px;
}

.stat-krw {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  margin-top: 2px;
}

.peak-hint {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  margin-top: 6px;
}

.highlight-value {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.5px;
  line-height: 1.2;
  margin-top: 4px;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 13px;
  font-weight: 700;
}

.stat-sub {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  margin-top: 2px;
}

.mdd-date {
  font-size: 10px;
  color: rgba(var(--v-theme-error), 0.7);
  margin-top: 2px;
}

/* ── ETF 비교 테이블 ────────────────────────────── */
.cmp-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--fp-outline);
  margin-bottom: 4px;
}

.cmp-ticker {
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.cmp-ticker--a { color: rgb(var(--v-theme-primary)); }
.cmp-ticker--b { color: rgb(var(--v-theme-warning)); }

.cmp-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
  align-items: center;
}

.cmp-row:last-child { border-bottom: none; }

.cmp-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.cmp-val {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.cmp-win { font-weight: 800; }

/* ── 자연어 요약 ────────────────────────────────── */
.summary-text { flex: 1; }

.summary-intro {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 6px;
}

.summary-body {
  font-size: 13px;
  line-height: 1.8;
  color: var(--fp-text);
}

.summary-returns {
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
}

/* ── 차트 모드 토글 ─────────────────────────────── */
.mode-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 99px;
  border: 1px solid var(--fp-outline);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  cursor: pointer;
  transition: all 0.15s;
}

.mode-btn--active {
  background: rgba(var(--v-theme-primary), 0.12);
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
}

/* ── 차트 ───────────────────────────────────────── */
.chart-wrap { position: relative; }

.legend-line { width: 20px; height: 2px; }

.legend-solid {
  background: rgb(var(--v-theme-primary));
  border-radius: 1px;
}

.legend-cmp {
  background: rgb(var(--v-theme-warning));
  border-radius: 1px;
}

.legend-dash {
  background: repeating-linear-gradient(
    90deg,
    rgba(var(--v-theme-on-surface), 0.35) 0px,
    rgba(var(--v-theme-on-surface), 0.35) 4px,
    transparent 4px,
    transparent 7px
  );
}

/* ── 차트 툴팁 ──────────────────────────────────── */
.chart-tooltip {
  position: absolute;
  top: 8px;
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
  border-radius: 10px;
  padding: 8px 10px;
  pointer-events: none;
  min-width: 148px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}

.ct-date { font-size: 11px; font-weight: 700; color: var(--fp-text); margin-bottom: 5px; }
.ct-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 2px; }
.ct-label { font-size: 11px; color: rgba(var(--v-theme-on-surface), 0.5); }
.ct-val { font-size: 11px; font-weight: 600; color: var(--fp-text); }


/* ── 연도별 테이블 ──────────────────────────────── */
.toggle-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 99px;
  border: 1px solid var(--fp-outline);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  cursor: pointer;
}

.yearly-table { font-size: 12px; }

.yearly-header {
  display: grid;
  grid-template-columns: 1fr 1.6fr 1.6fr 1fr;
  gap: 4px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-weight: 600;
  font-size: 11px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--fp-outline);
  margin-bottom: 4px;
}

.yearly-row {
  display: grid;
  grid-template-columns: 1fr 1.6fr 1.6fr 1fr;
  gap: 4px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
  align-items: center;
}

.yearly-row:last-child { border-bottom: none; }

/* ── 툴팁 용어 ──────────────────────────────────── */
.tooltip-term {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  cursor: pointer;
}

.tooltip-icon {
  color: rgba(var(--v-theme-on-surface), 0.35);
  cursor: pointer;
  flex-shrink: 0;
}
</style>
