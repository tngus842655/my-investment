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
    if (msg.includes('No data') || msg.includes('not found') || msg.includes('No valid')) {
      showMessage('해당 티커의 데이터를 찾을 수 없습니다.', 'warning')
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
  const minY = 0

  const toX = (i: number) => PAD.left + (i / (pts.length - 1)) * PW
  const toY = (v: number) => PAD.top + PH - ((v - minY) / (maxY - minY)) * PH

  const evalPath = pts.reduce((acc, p, i) => {
    const x = toX(i)
    const y = toY(p.evalAmount)
    return i === 0 ? `M ${x},${y}` : acc + ` L ${x},${y}`
  }, '')

  const investPath = pts.reduce((acc, p, i) => {
    const x = toX(i)
    const y = toY(p.totalInvested)
    return i === 0 ? `M ${x},${y}` : acc + ` L ${x},${y}`
  }, '')

  const evalFill = evalPath + ` L ${toX(pts.length - 1)},${PAD.top + PH} L ${toX(0)},${PAD.top + PH} Z`

  // X축 레이블: 연도가 바뀌는 지점, 최대 6개
  const yearTicks: { x: number; label: string }[] = []
  let lastYear = ''
  pts.forEach((p, i) => {
    const y = p.ym.slice(0, 4)
    if (y !== lastYear) { lastYear = y; yearTicks.push({ x: toX(i), label: y }) }
  })
  const step = Math.max(1, Math.ceil(yearTicks.length / 6))
  const xLabels = yearTicks.filter((_, i) => i % step === 0)

  // Y축 레이블: 3단계
  const yTicks = [0, 0.5, 1].map((r) => ({
    y: toY(maxY * r),
    label: fmtMoney(maxY * r, result.value!.currency),
  }))

  return { evalPath, evalFill, investPath, xLabels, yTicks, lastX: toX(pts.length - 1) }
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
      <div>
        <div class="text-h6 font-weight-bold">ETF 백테스트</div>
        <div class="text-caption text-medium-emphasis">과거 DCA 투자 수익률 시뮬레이션</div>
      </div>
    </div>

    <!-- 입력 카드 -->
    <v-card class="glass-card pa-4 mb-4" rounded="xl">
      <div class="d-flex flex-column ga-3">
        <v-text-field
          v-model="tickerInput"
          label="티커 (예: SPY, QQQ, VTI)"
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

        <v-btn
          color="primary"
          rounded="lg"
          :disabled="!canRun || loading"
          :loading="loading"
          @click="run"
        >
          백테스트 실행
        </v-btn>
      </div>

      <div class="text-caption text-medium-emphasis mt-3">
        * adjclose(배당·분할 조정 종가) 기준 · 배당 재투자 포함 근사치 · 세금/수수료 미포함
      </div>
    </v-card>

    <!-- 결과 -->
    <template v-if="result">
      <div class="text-body-2 font-weight-bold mb-3 px-1">
        {{ result.name }} ({{ result.ticker }}) &nbsp;·&nbsp; {{ fmtYm(result.summary.startYm) }} ~ {{ fmtYm(result.summary.endYm) }}
      </div>

      <!-- 요약 카드 2x3 -->
      <div class="summary-grid mb-4">
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">총 투자원금</div>
          <div class="stat-value">{{ fmtMoney(result.summary.totalInvested, result.currency) }}</div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">최종 평가금액</div>
          <div class="stat-value" :class="`text-${profitColor(result.summary.profit)}`">
            {{ fmtMoney(result.summary.evalAmount, result.currency) }}
          </div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">수익금</div>
          <div class="stat-value" :class="`text-${profitColor(result.summary.profit)}`">
            {{ fmtMoney(result.summary.profit, result.currency) }}
          </div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">총 수익률</div>
          <div class="stat-value" :class="`text-${profitColor(result.summary.totalReturn)}`">
            {{ fmtPct(result.summary.totalReturn) }}
          </div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">연 환산 (CAGR)</div>
          <div class="stat-value" :class="`text-${profitColor(result.summary.cagr)}`">
            {{ fmtPct(result.summary.cagr) }}
          </div>
        </div>
        <div class="glass-card pa-3 rounded-xl text-center">
          <div class="stat-label">최대 낙폭 (MDD)</div>
          <div class="stat-value text-error">{{ fmtPct(result.summary.mdd) }}</div>
        </div>
      </div>

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

            <!-- 평가금액 채우기 -->
            <path :d="chartSvg.evalFill" fill="url(#btEvalFill)" />

            <!-- 투자원금 점선 -->
            <path
              :d="chartSvg.investPath"
              fill="none"
              stroke="rgba(var(--v-theme-on-surface), 0.28)"
              stroke-width="1.5"
              stroke-dasharray="5 3"
            />

            <!-- 평가금액 실선 -->
            <path
              :d="chartSvg.evalPath"
              fill="none"
              stroke="rgb(var(--v-theme-primary))"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <!-- X축 레이블 -->
            <g v-for="tick in chartSvg.xLabels" :key="tick.label">
              <text
                :x="tick.x"
                :y="VH - 4"
                text-anchor="middle"
                font-size="9"
                fill="rgba(var(--v-theme-on-surface), 0.4)"
              >{{ tick.label }}</text>
            </g>
          </svg>

          <!-- 범례 -->
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

.yearly-table {
  font-size: 12px;
}

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

.yearly-row:last-child {
  border-bottom: none;
}
</style>
