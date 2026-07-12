<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useUserDataStore } from '@/stores/userData'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { convertMoney } from '@/utils/portfolioMath'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { useI18n } from 'vue-i18n'
import { formatYearMonth } from '@/utils/dateFormat'

const router = useRouter()
const { t } = useI18n()
const userDataStore = useUserDataStore()
const loading = ref(true)
const exchangeRate = ref(1350)
const { baseCurrency, money, moneyOr } = useBaseCurrency()
const formatMoney = (v: number) => money(v, exchangeRate.value, 'bare')

interface HistoryPoint {
  recorded_at: string
  current_asset: number
}

const history = ref<HistoryPoint[]>([])
const investmentPrincipal = ref(0)
const currentAssetNow = ref(0)
const monthlyInvestment = ref(0)
const annualReturn = ref<number | null>(null)

onMounted(async () => {
  try {
    const [histRes, goal, summary, rate] = await Promise.all([
      supabase.from('asset_history').select('recorded_at, current_asset, base_currency').order('recorded_at', { ascending: true }),
      userDataStore.ensureGoals(),
      userDataStore.ensureAssetSummary(),
      getCachedExchangeRate(),
    ])
    if (histRes.error) throw histRes.error
    exchangeRate.value = rate
    // 기준통화 변경 이전의 스냅샷은 행별 통화가 다를 수 있어 표시 시점 환율로 환산 (GLOBALIZATION.md 2-4 정책)
    history.value = (histRes.data ?? []).map((p: HistoryPoint & { base_currency?: string }) => ({
      ...p,
      current_asset: Math.round(convertMoney(p.current_asset, p.base_currency ?? 'KRW', baseCurrency.value, rate)),
    }))
    monthlyInvestment.value = goal?.monthly_investment ?? 0
    annualReturn.value = goal?.annual_return ?? null
    currentAssetNow.value = summary?.current_asset ?? 0
    investmentPrincipal.value = summary?.investment_principal ?? 0
  } catch {
    showMessage(t('assetGrowth.loadError'), 'error')
  } finally {
    loading.value = false
  }
})

// 올해 목표 (미래예측 화면과 동일한 방식: 현재 자산 + 월 투자금을 연말까지 복리 계산)
const calcAsset = (C: number, M: number, r: number, n: number) => {
  if (r === 0) return C + M * n
  return C * Math.pow(1 + r, n) + (M * (Math.pow(1 + r, n) - 1)) / r
}

const thisYearTarget = computed(() => {
  const now = new Date()
  const monthsToYearEnd = 12 - (now.getMonth() + 1)
  if (monthsToYearEnd <= 0) return currentAssetNow.value
  const r = (annualReturn.value ?? 0) / 100 / 12
  return Math.round(calcAsset(currentAssetNow.value, monthlyInvestment.value, r, monthsToYearEnd))
})

// 일별 데이터를 월별로 집계 (해당 월 마지막 기록값 사용)
interface MonthlyPoint {
  month: string
  label: string
  asset: number
  change: number
}

const monthlyData = computed<MonthlyPoint[]>(() => {
  const all = history.value
  if (!all.length) return []

  const map = new Map<string, number>()
  for (const p of all) {
    const month = p.recorded_at.slice(0, 7)
    map.set(month, p.current_asset)
  }

  const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  return sorted.map(([month, asset], i) => {
    const prev = i > 0 ? sorted[i - 1]![1] : asset
    return {
      month,
      label: month.slice(2).replace('-', '.'),
      asset,
      change: i === 0 ? 0 : asset - prev,
    }
  })
})

const selectedPeriod = ref<'6M' | '1Y' | 'ALL'>('1Y')
const periods = [
  { labelKey: 'assetGrowth.period6M', value: '6M' },
  { labelKey: 'assetGrowth.period1Y', value: '1Y' },
  { labelKey: 'assetGrowth.periodAll', value: 'ALL' },
] as const

const filteredData = computed(() => {
  const all = monthlyData.value
  if (!all.length) return []
  if (selectedPeriod.value === 'ALL') return all
  const count = selectedPeriod.value === '6M' ? 6 : 12
  return all.slice(-count)
})

// ── SVG 바 차트 ────────────────────────────────────
const VW = 300
const VH = 200
const PAD = { top: 24, right: 8, bottom: 36, left: 44 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

const chartData = computed(() => {
  const pts = filteredData.value
  if (!pts.length) return null

  // Y축 최대값은 올해 목표 기준. 단, 실제 자산이 목표를 넘어서면 잘리지 않도록 그 값도 함께 반영
  const maxAsset = Math.max(...pts.map((p) => p.asset), 1)
  const yMax = Math.max(thisYearTarget.value, maxAsset) * 1.08
  const barW = Math.max(4, PW / pts.length - 5)

  const toX = (i: number) => PAD.left + (i / pts.length) * PW + PW / pts.length / 2
  const toH = (v: number) => (v / yMax) * PH
  const toY = (v: number) => PAD.top + PH - toH(v)

  // Y축 눈금 3개
  const yTicks = [0, yMax / 2, yMax].map((v) => ({
    value: v,
    y: toY(v),
    label: formatShort(v),
  }))

  // X축 레이블 (최대 6개)
  const step = Math.ceil(pts.length / 6)
  const xLabels = pts
    .map((p, i) => ({ x: toX(i), label: p.label }))
    .filter((_, i) => i % step === 0 || i === pts.length - 1)

  // 올해 목표 기준선 (Y축 최대값 산정에 포함되므로 항상 차트 범위 안에 표시됨)
  const targetY = thisYearTarget.value > 0 ? toY(thisYearTarget.value) : null

  // 최고 자산 달 인덱스
  const maxIdx = pts.reduce((mi, p, i) => (p.asset > pts[mi]!.asset ? i : mi), 0)

  return { pts, barW, toX, toH, toY, yTicks, xLabels, targetY, maxIdx }
})

// 툴팁 + 선택된 월
const tooltip = ref<{ x: number; y: number; pt: MonthlyPoint } | null>(null)
const selectedMonth = ref<string | null>(null)
// 일별 상세 헤더 표시용 — selectedMonth("YYYY-MM")를 로케일 표기로 변환
const selectedMonthLabel = computed(() => {
  if (!selectedMonth.value) return ''
  const [y, m] = selectedMonth.value.split('-')
  return formatYearMonth(Number(y), Number(m))
})

const onChartClick = (pt: MonthlyPoint, x: number, y: number) => {
  if (tooltip.value?.pt.month === pt.month) {
    tooltip.value = null
    selectedMonth.value = null
  } else {
    tooltip.value = { x, y, pt }
    selectedMonth.value = pt.month
  }
}

// 선택된 월의 일별 상세 (월초 데이터는 전월 마지막 기록과 비교)
const dailyDetail = computed(() => {
  if (!selectedMonth.value) return []
  const all = history.value // recorded_at 오름차순 정렬된 전체 기록
  return all
    .map((p, i) => ({ p, prevAsset: i > 0 ? all[i - 1]!.current_asset : null }))
    .filter(({ p }) => p.recorded_at.startsWith(selectedMonth.value!))
    .map(({ p, prevAsset }) => ({
      date: p.recorded_at,
      asset: p.current_asset,
      change: prevAsset === null ? 0 : p.current_asset - prevAsset,
    }))
    .reverse()
})

// ── 요약 통계 ────────────────────────────────────
const latestAsset = computed(() => filteredData.value[filteredData.value.length - 1]?.asset ?? 0)

const totalGrowth = computed(() => {
  const pts = filteredData.value
  if (pts.length < 2) return null
  const first = pts[0]!.asset
  const last = pts[pts.length - 1]!.asset
  return { amount: last - first, pct: first > 0 ? ((last - first) / first) * 100 : 0 }
})

const avgMonthlyGrowth = computed(() => {
  const pts = filteredData.value
  const changes = pts.slice(1).map((p) => p.change)
  if (!changes.length) return 0
  return changes.reduce((s, v) => s + v, 0) / changes.length
})

const bestMonth = computed(() => {
  const pts = filteredData.value.slice(1)
  if (!pts.length) return null
  return pts.reduce((best, p) => (p.change > best.change ? p : best), pts[0]!)
})

// 원금 vs 수익
const profitAmount = computed(() => latestAsset.value - investmentPrincipal.value)

function formatShort(v: number) {
  return moneyOr(v, exchangeRate.value, formatShortKrw)
}

function formatShortKrw(v: number) {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}억`
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(1)}천만`
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString()}만`
  return `${sign}${abs.toLocaleString()}`
}

function formatFull(v: number) {
  return money(v, exchangeRate.value, 'full')
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div class="d-flex align-center ga-2">
        <v-btn icon size="small" variant="text" @click="router.back()">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <div>
          <div class="font-weight-bold">{{ $t('assetGrowth.title') }}</div>
          <div class="text-medium-emphasis">{{ $t('assetGrowth.subtitle') }}</div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else>
      <div v-if="monthlyData.length < 1" class="text-center py-12 text-medium-emphasis">
        <v-icon size="48" class="mb-3">mdi-chart-bar</v-icon>
        <div>{{ $t('assetGrowth.empty') }}</div>
        <div class="mt-1">{{ $t('assetGrowth.emptyHint') }}</div>
      </div>

      <template v-else>
        <!-- 요약 카드 4개 -->
        <div class="summary-grid mb-4">
          <v-card rounded="xl" class="summary-card pa-4 text-center">
            <div class="text-medium-emphasis mb-1">{{ $t('assetGrowth.currentAsset') }}</div>
            <div class="font-weight-bold text-primary">{{ formatShort(latestAsset) }}</div>
          </v-card>
          <v-card rounded="xl" class="summary-card pa-4 text-center">
            <div class="text-medium-emphasis mb-1">{{ $t('assetGrowth.periodChange') }}</div>
            <div
              v-if="totalGrowth"
              class="font-weight-bold"
              :class="totalGrowth.amount >= 0 ? 'text-success' : 'text-error'"
            >
              {{ totalGrowth.amount >= 0 ? '+' : '' }}{{ totalGrowth.pct.toFixed(1) }}%
            </div>
            <div v-else class="font-weight-bold text-medium-emphasis">-</div>
          </v-card>
          <v-card rounded="xl" class="summary-card pa-4 text-center">
            <div class="text-medium-emphasis mb-1">{{ $t('assetGrowth.avgMonthly') }}</div>
            <div
              class="font-weight-bold"
              :class="avgMonthlyGrowth >= 0 ? 'text-success' : 'text-error'"
            >
              {{ avgMonthlyGrowth >= 0 ? '+' : '' }}{{ formatShort(avgMonthlyGrowth) }}
            </div>
          </v-card>
          <v-card rounded="xl" class="summary-card pa-4 text-center">
            <div class="text-medium-emphasis mb-1">{{ $t('assetGrowth.bestMonth') }}</div>
            <div v-if="bestMonth" class="font-weight-bold text-success">
              {{ bestMonth.label }}
            </div>
            <div v-else class="font-weight-bold text-medium-emphasis">-</div>
          </v-card>
        </div>

        <!-- 원금 vs 수익 바 -->
        <v-card v-if="investmentPrincipal > 0" rounded="xl" class="pa-4 mb-4">
          <div class="d-flex justify-space-between align-center mb-2">
            <div class="font-weight-medium">{{ $t('assetGrowth.principalVsProfit') }}</div>
            <div :class="profitAmount >= 0 ? 'text-success' : 'text-error'">
              {{ $t('assetGrowth.profitInline', { sign: profitAmount >= 0 ? '+' : '', amount: formatShort(profitAmount) }) }}
            </div>
          </div>
          <div class="profit-bar-wrap">
            <div
              class="profit-bar-principal"
              :style="{ width: latestAsset > 0 ? (investmentPrincipal / latestAsset * 100).toFixed(1) + '%' : '100%' }"
            />
            <div
              v-if="profitAmount > 0"
              class="profit-bar-profit"
              :style="{ width: (profitAmount / latestAsset * 100).toFixed(1) + '%' }"
            />
          </div>
          <div class="d-flex ga-3 mt-2">
            <div class="d-flex align-center ga-1">
              <span class="legend-dot principal" />
              <span class="text-medium-emphasis">{{ $t('assetGrowth.principal', { amount: formatShort(investmentPrincipal) }) }}</span>
            </div>
            <div class="d-flex align-center ga-1">
              <span class="legend-dot profit" />
              <span class="text-medium-emphasis">{{ $t('assetGrowth.profit', { amount: formatShort(Math.max(profitAmount, 0)) }) }}</span>
            </div>
          </div>
        </v-card>

        <!-- 기간 탭 -->
        <div class="d-flex ga-2 mb-3">
          <button
            v-for="p in periods"
            :key="p.value"
            class="period-btn"
            :class="{ active: selectedPeriod === p.value }"
            @click="selectedPeriod = p.value; tooltip = null; selectedMonth = null"
          >
            {{ $t(p.labelKey) }}
          </button>
        </div>

        <!-- 바 차트 -->
        <v-card rounded="xl" class="pa-4 mb-4">
          <div v-if="!chartData || filteredData.length < 1" class="text-center text-medium-emphasis py-6">
            {{ $t('assetGrowth.insufficientData') }}
          </div>
          <svg
            v-else
            :viewBox="`0 0 ${VW} ${VH}`"
            width="100%"
            style="overflow: visible"
          >
            <!-- Y축 눈금선 -->
            <template v-for="tick in chartData.yTicks" :key="tick.value">
              <line
                :x1="PAD.left" :y1="tick.y"
                :x2="VW - PAD.right" :y2="tick.y"
                stroke="rgba(var(--v-theme-on-surface), 0.07)" stroke-width="1"
              />
              <text
                :x="PAD.left - 4" :y="tick.y + 4"
                text-anchor="end" font-size="8"
                fill="rgba(var(--v-theme-on-surface), 0.4)"
              >{{ tick.label }}</text>
            </template>

            <!-- 올해 목표 기준선 -->
            <template v-if="chartData.targetY !== null">
              <line
                :x1="PAD.left" :y1="chartData.targetY"
                :x2="VW - PAD.right" :y2="chartData.targetY"
                stroke="rgba(var(--v-theme-primary), 0.5)" stroke-width="1.5" stroke-dasharray="5,4"
              />
              <text
                :x="PAD.left" :y="chartData.targetY - 4"
                font-size="8" fill="rgb(var(--v-theme-primary))"
              >{{ $t('assetGrowth.thisYearGoalChart', { amount: formatMoney(thisYearTarget) }) }}</text>
            </template>
            <!-- 현재 자산 (현재 평가 자산) -->
            <text
              v-if="currentAssetNow > 0"
              :x="VW - PAD.right" :y="PAD.top - 8"
              text-anchor="end" font-size="8"
              fill="rgba(var(--v-theme-on-surface), 0.5)"
            >{{ $t('assetGrowth.currentAssetChart', { amount: formatMoney(currentAssetNow) }) }}</text>

            <!-- 바 -->
            <g
              v-for="(pt, i) in chartData.pts"
              :key="pt.month"
              style="cursor: pointer"
              @click="onChartClick(pt, chartData.toX(i), chartData.toY(pt.asset))"
            >
              <rect
                :x="chartData.toX(i) - chartData.barW / 2"
                :y="chartData.toY(pt.asset)"
                :width="chartData.barW"
                :height="chartData.toH(pt.asset)"
                :rx="3"
                :fill="tooltip?.pt.month === pt.month
                  ? 'rgb(var(--v-theme-primary))'
                  : i === chartData.maxIdx
                    ? 'rgba(var(--v-theme-primary), 0.75)'
                    : 'rgba(var(--v-theme-primary), 0.4)'"
              />
              <!-- 최고점 마커 -->
              <text
                v-if="i === chartData.maxIdx"
                :x="chartData.toX(i)"
                :y="chartData.toY(pt.asset) - 5"
                text-anchor="middle" font-size="9"
                fill="rgb(var(--v-theme-primary))"
              >▲</text>
            </g>

            <!-- X축 레이블 -->
            <text
              v-for="lbl in chartData.xLabels"
              :key="lbl.label"
              :x="lbl.x"
              :y="VH - 4"
              text-anchor="middle" font-size="8"
              fill="rgba(var(--v-theme-on-surface), 0.4)"
            >{{ lbl.label }}</text>

            <!-- 툴팁 -->
            <template v-if="tooltip && chartData">
              <line
                :x1="tooltip.x" :y1="PAD.top"
                :x2="tooltip.x" :y2="PAD.top + PH"
                stroke="rgba(var(--v-theme-on-surface), 0.2)" stroke-width="1" stroke-dasharray="3,3"
              />
              <g :transform="`translate(${Math.min(tooltip.x + 6, VW - 112)}, ${Math.max(tooltip.y - 48, PAD.top)})`">
                <rect width="108" height="46" rx="6"
                  fill="rgb(var(--v-theme-surface))"
                  stroke="rgba(var(--v-theme-on-surface),0.12)" stroke-width="1" />
                <text x="8" y="14" font-size="9" fill="rgba(var(--v-theme-on-surface), 0.55)">{{ tooltip.pt.month }}</text>
                <text x="8" y="29" font-size="11" font-weight="bold" fill="rgb(var(--v-theme-primary))">{{ formatShort(tooltip.pt.asset) }}</text>
                <text
                  x="8" y="42" font-size="9"
                  :fill="tooltip.pt.change > 0 ? 'rgb(var(--v-theme-success))' : tooltip.pt.change < 0 ? 'rgb(var(--v-theme-error))' : 'rgba(var(--v-theme-on-surface),0.4)'"
                >{{ tooltip.pt.change === 0 ? $t('assetGrowth.baseMonth') : (tooltip.pt.change > 0 ? '+' : '') + formatShort(tooltip.pt.change) }}</text>
              </g>
            </template>
          </svg>
        </v-card>

        <!-- 상세 테이블 -->
        <v-card rounded="xl" class="pa-4">
          <!-- 헤더 -->
          <div class="d-flex align-center mb-3">
            <template v-if="selectedMonth">
              <v-btn icon size="x-small" variant="text" class="mr-1" @click="selectedMonth = null; tooltip = null">
                <v-icon size="16">mdi-arrow-left</v-icon>
              </v-btn>
              <div class="font-weight-medium">{{ $t('assetGrowth.dailyDetailTitle', { month: selectedMonthLabel }) }}</div>
            </template>
            <div v-else class="font-weight-medium">{{ $t('assetGrowth.monthlyDetailTitle') }}</div>
            <v-spacer />
            <div v-if="!selectedMonth" class="text-medium-emphasis">{{ $t('assetGrowth.tapHint') }}</div>
          </div>

          <!-- 월별 뷰 -->
          <template v-if="!selectedMonth">
            <div
              v-for="(pt, i) in [...filteredData].reverse()"
              :key="pt.month"
              class="month-row"
              :class="{ 'border-top': i > 0 }"
            >
              <span class="month-label">{{ pt.month }}</span>
              <span class="month-asset">{{ formatFull(pt.asset) }}</span>
              <span
                class="month-change"
                :class="pt.change > 0 ? 'text-success' : pt.change < 0 ? 'text-error' : 'text-medium-emphasis'"
              >
                {{ pt.change === 0 ? '-' : (pt.change > 0 ? '+' : '') + formatShort(pt.change) }}
              </span>
            </div>
          </template>

          <!-- 일별 뷰 -->
          <template v-else>
            <div v-if="!dailyDetail.length" class="text-center text-medium-emphasis py-4">
              {{ $t('assetGrowth.noMonthData') }}
            </div>
            <div
              v-for="(pt, i) in dailyDetail"
              :key="pt.date"
              class="month-row"
              :class="{ 'border-top': i > 0 }"
            >
              <span class="month-label">{{ pt.date.slice(5).replace('-', '/') }}</span>
              <span class="month-asset">{{ formatFull(pt.asset) }}</span>
              <span
                class="month-change"
                :class="pt.change > 0 ? 'text-success' : pt.change < 0 ? 'text-error' : 'text-medium-emphasis'"
              >
                {{ pt.change === 0 ? '-' : (pt.change > 0 ? '+' : '') + formatShort(pt.change) }}
              </span>
            </div>
          </template>
        </v-card>
      </template>
    </template>
  </v-container>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.summary-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}
.period-btn {
  flex: 1;
  padding: 6px 0;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  cursor: pointer;
  transition: all 0.15s;
}
.period-btn.active {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: #fff;
}
.profit-bar-wrap {
  height: 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  display: flex;
  overflow: hidden;
}
.profit-bar-principal {
  height: 100%;
  background: rgba(var(--v-theme-primary), 0.5);
  transition: width 0.4s ease;
}
.profit-bar-profit {
  height: 100%;
  background: rgb(var(--v-theme-success));
  transition: width 0.4s ease;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.legend-dot.principal {
  background: rgba(var(--v-theme-primary), 0.5);
}
.legend-dot.profit {
  background: rgb(var(--v-theme-success));
}
.month-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
}
.border-top {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.month-label {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  width: 72px;
  flex-shrink: 0;
}
.month-asset {
  flex: 1;
  font-size: 0.8125rem;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}
.month-change {
  width: 56px;
  font-size: 0.75rem;
  text-align: right;
  flex-shrink: 0;
  white-space: nowrap;
}
</style>
