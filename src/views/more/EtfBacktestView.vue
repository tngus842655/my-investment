<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

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
    months: number
    startYm: string
    endYm: string
  }
}

const tickerInput = ref('')
const monthlyAmount = ref<number | null>(100)
const startYm = ref('')
const loading = ref(false)
const result = ref<BacktestResult | null>(null)

const tooltips = {
  dca: '매월 일정 금액을 꾸준히 투자하는 전략. 가격이 쌀 때 더 많이, 비쌀 때 더 적게 매수하여 평균 단가를 낮추는 효과가 있습니다.',
  cagr: '연평균 복리 수익률. 투자 기간 전체 수익률을 연 단위로 환산한 값. 높을수록 좋습니다.',
  mdd: '최대 낙폭(Max Drawdown). 투자 기간 중 고점 대비 최대로 하락한 비율. 절대값이 작을수록 리스크가 낮습니다.',
  totalReturn: '투자 원금 대비 현재 평가금액의 총 수익률입니다.',
}

const ymOptions = computed(() => {
  const opts: { title: string; value: string }[] = []
  const end = new Date()
  end.setMonth(end.getMonth() - 1)
  const cur = new Date(1993, 0, 1)
  while (cur <= end) {
    const ym = cur.toISOString().slice(0, 7)
    opts.push({ title: ym, value: ym })
    cur.setMonth(cur.getMonth() + 1)
  }
  return opts.reverse()
})

onMounted(() => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 10)
  startYm.value = d.toISOString().slice(0, 7)
})

const sanitizeTicker = (v: string) => v.replace(/[^A-Za-z0-9.-]/g, '').toUpperCase()

const canRun = computed(() =>
  tickerInput.value.trim().length > 0 &&
  (monthlyAmount.value ?? 0) > 0 &&
  startYm.value.length > 0
)

const run = async () => {
  const ticker = sanitizeTicker(tickerInput.value.trim())
  if (!ticker) { showMessage('티커를 입력해주세요.', 'warning'); return }
  if (!monthlyAmount.value || monthlyAmount.value <= 0) { showMessage('월 투자금을 입력해주세요.', 'warning'); return }

  loading.value = true
  result.value = null

  try {
    const { data, error } = await supabase.functions.invoke('etf-backtest', {
      body: { ticker, monthly_amount: monthlyAmount.value, start_ym: startYm.value },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    result.value = data as BacktestResult
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

// ── 포맷터 ────────────────────────────────────────────
const fmtMoney = (v: number, currency: string) => {
  if (currency === 'KRW') return `₩${Math.round(v).toLocaleString()}`
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const fmtPct = (v: number, digits = 1) => {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(digits)}%`
}

const fmtYm = (ym: string) => {
  const [y, m] = ym.split('-')
  return `${y}년 ${Number(m)}월`
}

const profitColor = (v: number) => (v >= 0 ? 'success' : 'error')

// ── 투자기간 텍스트 ───────────────────────────────────
const periodText = computed(() => {
  const s = result.value?.summary
  if (!s) return ''
  const y = Math.floor(s.months / 12)
  const m = s.months % 12
  if (y === 0) return `${m}개월`
  if (m === 0) return `${y}년`
  return `${y}년 ${m}개월`
})

// ── 자연어 요약 ───────────────────────────────────────
const summaryText = computed(() => {
  const r = result.value
  if (!r) return null
  const s = r.summary
  const currency = r.currency
  return {
    intro: `${fmtYm(s.startYm)}부터 매월 ${fmtMoney(monthlyAmount.value ?? 0, currency)}씩 ${r.ticker}에 투자했다면`,
    invested: `총 ${fmtMoney(s.totalInvested, currency)}를 투자하여`,
    eval: `현재 ${fmtMoney(s.evalAmount, currency)}가 되었으며`,
    returns: `총 수익률은 ${fmtPct(s.totalReturn)}, 연평균 수익률은 ${fmtPct(s.cagr)}입니다.`,
  }
})

// ── MDD 시점 텍스트 ──────────────────────────────────
const mddText = computed(() => {
  const mddYm = result.value?.summary.mddYm
  if (!mddYm) return null
  return fmtYm(mddYm)
})

// ── SVG 차트 ─────────────────────────────────────────
const VW = 320
const VH = 200
const PAD = { top: 12, right: 16, bottom: 28, left: 12 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

const chartSvg = computed(() => {
  const pts = result.value?.monthly ?? []
  if (pts.length < 2) return null

  const maxY = Math.max(...pts.map((p) => p.evalAmount)) * 1.08

  const toX = (i: number) => PAD.left + (i / (pts.length - 1)) * PW
  const toY = (v: number) => PAD.top + PH - (v / maxY) * PH

  const evalPath = pts.reduce((acc, p, i) => {
    const x = toX(i); const y = toY(p.evalAmount)
    return i === 0 ? `M ${x},${y}` : acc + ` L ${x},${y}`
  }, '')

  const investPath = pts.reduce((acc, p, i) => {
    const x = toX(i); const y = toY(p.totalInvested)
    return i === 0 ? `M ${x},${y}` : acc + ` L ${x},${y}`
  }, '')

  const evalFill = evalPath + ` L ${toX(pts.length - 1)},${PAD.top + PH} L ${toX(0)},${PAD.top + PH} Z`

  const yearTicks: { x: number; label: string }[] = []
  let lastYear = ''
  pts.forEach((p, i) => {
    const y = p.ym.slice(0, 4)
    if (y !== lastYear) { lastYear = y; yearTicks.push({ x: toX(i), label: y }) }
  })
  const step = Math.max(1, Math.ceil(yearTicks.length / 6))
  const xLabels = yearTicks.filter((_, i) => i % step === 0)

  return { evalPath, evalFill, investPath, xLabels }
})

// ── 연도별 테이블 ─────────────────────────────────────
const yearlyRows = computed(() => {
  if (!result.value) return []
  const map = new Map<string, MonthlyPoint>()
  for (const m of result.value.monthly) {
    map.set(m.ym.slice(0, 4), m)
  }
  return [...map.values()]
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
          <v-tooltip :text="tooltips.dca" location="bottom" open-on-click max-width="260">
            <template #activator="{ props }">
              <span v-bind="props" class="tooltip-term">DCA</span>
            </template>
          </v-tooltip>
          투자 수익률 시뮬레이션
        </div>
      </div>
    </div>

    <!-- 입력 카드 -->
    <v-card class="glass-card pa-4 mb-4" rounded="xl">
      <div class="d-flex flex-column ga-3">
        <v-text-field
          v-model="tickerInput"
          label="해외 ETF/주식 티커 (예: SPY, QQQ, VTI)"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          :disabled="loading"
          @input="(e: Event) => { tickerInput = sanitizeTicker((e.target as HTMLInputElement).value) }"
          @keyup.enter="run"
        />
        <v-text-field
          v-model.number="monthlyAmount"
          label="월 투자금"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          type="number"
          min="1"
          :disabled="loading"
          @keyup.enter="run"
        >
          <template #append-inner>
            <span class="text-caption text-medium-emphasis">
              {{ result?.currency === 'KRW' ? '원' : 'USD' }}
            </span>
          </template>
        </v-text-field>
        <v-select
          v-model="startYm"
          :items="ymOptions"
          label="시작 연월"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          :disabled="loading"
        />
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

      <!-- 핵심 지표: 평가금액 + 수익률 강조 -->
      <div class="highlight-row mb-3">
        <div class="highlight-card glass-card rounded-xl pa-4">
          <div class="stat-label">최종 평가금액</div>
          <div class="highlight-value text-success">
            {{ fmtMoney(result.summary.evalAmount, result.currency) }}
          </div>
        </div>
        <div class="highlight-card glass-card rounded-xl pa-4">
          <div class="stat-label d-flex align-center ga-1">
            총 수익률
            <v-tooltip :text="tooltips.totalReturn" location="bottom" open-on-click max-width="240">
              <template #activator="{ props }">
                <v-icon v-bind="props" size="12" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="highlight-value" :class="`text-${profitColor(result.summary.totalReturn)}`">
            {{ fmtPct(result.summary.totalReturn) }}
          </div>
        </div>
      </div>

      <!-- 보조 지표 2x2 -->
      <div class="summary-grid mb-3">
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">총 투자원금</div>
          <div class="stat-value">{{ fmtMoney(result.summary.totalInvested, result.currency) }}</div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">수익금</div>
          <div class="stat-value" :class="`text-${profitColor(result.summary.profit)}`">
            {{ fmtMoney(result.summary.profit, result.currency) }}
          </div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label d-flex align-center justify-center ga-1">
            연 환산 (CAGR)
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
          <div class="stat-label d-flex align-center justify-center ga-1">
            최대 낙폭 (MDD)
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
        <div class="text-body-2 font-weight-bold mb-3">누적 자산 추이</div>
        <template v-if="chartSvg">
          <svg :viewBox="`0 0 ${VW} ${VH}`" width="100%" :height="VH" style="overflow: visible">
            <defs>
              <linearGradient id="btEvalFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0.25" />
                <stop offset="100%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path :d="chartSvg.evalFill" fill="url(#btEvalFill)" />
            <path :d="chartSvg.investPath" fill="none" stroke="rgba(var(--v-theme-on-surface), 0.28)" stroke-width="1.5" stroke-dasharray="5 3" />
            <path :d="chartSvg.evalPath" fill="none" stroke="rgb(var(--v-theme-primary))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <g v-for="tick in chartSvg.xLabels" :key="tick.label">
              <text :x="tick.x" :y="VH - 4" text-anchor="middle" font-size="9" fill="rgba(var(--v-theme-on-surface), 0.4)">{{ tick.label }}</text>
            </g>
          </svg>
          <div class="d-flex ga-4 mt-1 justify-center">
            <div class="d-flex align-center ga-1">
              <div class="legend-line legend-solid" />
              <span class="text-caption text-medium-emphasis">평가금액</span>
            </div>
            <div class="d-flex align-center ga-1">
              <div class="legend-line legend-dash" />
              <span class="text-caption text-medium-emphasis">투자원금</span>
            </div>
          </div>
        </template>
      </v-card>

      <!-- 연도별 테이블 -->
      <v-card class="glass-card pa-4" rounded="xl">
        <div class="text-body-2 font-weight-bold mb-3">연도별 스냅샷 (연말 기준)</div>
        <div class="yearly-table">
          <div class="yearly-header">
            <span>연도</span>
            <span>투자원금</span>
            <span>평가금액</span>
            <span>수익률</span>
          </div>
          <div v-for="row in yearlyRows" :key="row.ym" class="yearly-row">
            <span class="font-weight-medium">{{ row.ym.slice(0, 4) }}</span>
            <span>{{ fmtMoney(row.totalInvested, result.currency) }}</span>
            <span :class="`text-${profitColor(row.evalAmount - row.totalInvested)}`">
              {{ fmtMoney(row.evalAmount, result.currency) }}
            </span>
            <span :class="`text-${profitColor(row.evalAmount - row.totalInvested)}`">
              {{ fmtPct((row.evalAmount - row.totalInvested) / row.totalInvested) }}
            </span>
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

/* ── 기간 헤더 ─────────────────────────────────── */
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

/* ── 핵심 지표 강조 ─────────────────────────────── */
.highlight-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.highlight-card {
  text-align: center;
}

.highlight-value {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  line-height: 1.2;
  margin-top: 4px;
}

/* ── 보조 지표 ──────────────────────────────────── */
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

.mdd-date {
  font-size: 10px;
  color: rgba(var(--v-theme-error), 0.7);
  margin-top: 2px;
}

/* ── 자연어 요약 ────────────────────────────────── */
.summary-text {
  flex: 1;
}

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

/* ── 차트 범례 ──────────────────────────────────── */
.legend-line {
  width: 20px;
  height: 2px;
}

.legend-solid {
  background: rgb(var(--v-theme-primary));
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

/* ── 연도별 테이블 ──────────────────────────────── */
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
