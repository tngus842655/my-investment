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

const router = useRouter()
const { t } = useI18n()
const userDataStore = useUserDataStore()
const loading = ref(true)
const exchangeRate = ref(1350)
const { baseCurrency, moneyOr } = useBaseCurrency()

interface HistoryPoint {
  recorded_at: string
  current_asset: number
  progress_pct: number
}

const history = ref<HistoryPoint[]>([])
const currentAsset = ref(0)
const selectedPeriod = ref<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('3M')
const periods = [
  { labelKey: 'fireHistory.period1M', value: '1M' },
  { labelKey: 'fireHistory.period3M', value: '3M' },
  { labelKey: 'fireHistory.period6M', value: '6M' },
  { labelKey: 'fireHistory.period1Y', value: '1Y' },
  { labelKey: 'fireHistory.periodAll', value: 'ALL' },
] as const

// 툴팁
const tooltip = ref<{ x: number; y: number; pt: HistoryPoint } | null>(null)

onMounted(async () => {
  try {
    await supabase.rpc('save_daily_asset_snapshot')
    const [historyResult, summary, rate] = await Promise.all([
      supabase.from('asset_history').select('recorded_at, current_asset, progress_pct, base_currency').order('recorded_at', { ascending: true }),
      userDataStore.ensureAssetSummary(),
      getCachedExchangeRate(),
    ])
    if (historyResult.error) throw historyResult.error
    exchangeRate.value = rate
    // 기준통화 변경 이전의 스냅샷은 행별 통화가 다를 수 있어 표시 시점 환율로 환산 (GLOBALIZATION.md 2-4 정책)
    history.value = (historyResult.data ?? []).map((p: HistoryPoint & { base_currency?: string }) => ({
      ...p,
      current_asset: Math.round(convertMoney(p.current_asset, p.base_currency ?? 'KRW', baseCurrency.value, rate)),
    }))
    currentAsset.value = summary?.current_asset ?? 0
  } catch {
    showMessage(t('fireHistory.loadError'), 'error')
  } finally {
    loading.value = false
  }
})

const filteredHistory = computed(() => {
  const all = history.value
  if (!all.length) return []
  if (selectedPeriod.value === 'ALL') return all
  const days = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }[selectedPeriod.value]
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return all.filter((p) => p.recorded_at >= cutoffStr)
})

// ── SVG 차트 ─────────────────────────────────────
const VW = 300
const VH = 180
const PAD = { top: 20, right: 16, bottom: 28, left: 36 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

const chartData = computed(() => {
  const pts = filteredHistory.value
  if (pts.length < 2) return null

  const maxY = Math.max(...pts.map((p) => p.progress_pct))
  const minY = Math.min(...pts.map((p) => p.progress_pct))
  const padY = (maxY - minY) * 0.15 || 5
  const yMax = Math.min(maxY + padY, 100)
  const yMin = Math.max(minY - padY, 0)

  const toX = (i: number) => PAD.left + (i / (pts.length - 1)) * PW
  const toY = (pct: number) => PAD.top + PH - ((pct - yMin) / Math.max(yMax - yMin, 1)) * PH

  const path = pts.reduce((acc, pt, i) => {
    const x = toX(i)
    const y = toY(pt.progress_pct)
    if (i === 0) return `M ${x},${y}`
    const prev = pts[i - 1]!
    const cpx = (toX(i - 1) + x) / 2
    return acc + ` C ${cpx},${toY(prev.progress_pct)} ${cpx},${y} ${x},${y}`
  }, '')

  const fill = path + ` L ${toX(pts.length - 1)},${PAD.top + PH} L ${toX(0)},${PAD.top + PH} Z`

  // Y축 눈금 3개
  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map((v) => Math.round(v * 10) / 10)

  // X축 레이블 (3개)
  const xIdxs = [0, Math.floor((pts.length - 1) / 2), pts.length - 1]
  const xLabels = xIdxs.map((i) => ({ x: toX(i), label: pts[i]!.recorded_at.slice(5).replace('-', '/') }))

  return { path, fill, yTicks, xLabels, toX, toY, pts }
})

const firstPt = computed(() => filteredHistory.value[0] ?? null)
const lastPt = computed(() => filteredHistory.value[filteredHistory.value.length - 1] ?? null)
const pctChange = computed(() => {
  if (!firstPt.value || !lastPt.value) return null
  return lastPt.value.progress_pct - firstPt.value.progress_pct
})

const formatAsset = (v: number) =>
  moneyOr(v, exchangeRate.value, (x) => {
    if (x >= 100_000_000) return `${(x / 100_000_000).toFixed(1)}억`
    if (x >= 10_000) return `${Math.round(x / 10_000).toLocaleString()}만`
    return x.toLocaleString()
  })

// 차트 터치/클릭으로 툴팁
const svgRef = ref<SVGSVGElement | null>(null)

const onChartMove = (e: MouseEvent | TouchEvent) => {
  if (!chartData.value || !svgRef.value) return
  const rect = svgRef.value.getBoundingClientRect()
  const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX
  const relX = ((clientX - rect.left) / rect.width) * VW
  const pts = chartData.value.pts
  const idx = Math.round(((relX - PAD.left) / PW) * (pts.length - 1))
  const clamped = Math.max(0, Math.min(pts.length - 1, idx))
  const pt = pts[clamped]!
  tooltip.value = {
    x: chartData.value.toX(clamped),
    y: chartData.value.toY(pt.progress_pct),
    pt,
  }
}

const onChartLeave = () => { tooltip.value = null }
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
          <div class="font-weight-bold">{{ $t('fireHistory.title') }}</div>
          <div class="text-medium-emphasis">{{ $t('fireHistory.subtitle') }}</div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else>
      <div v-if="history.length < 1" class="text-center py-12 text-medium-emphasis">
        <v-icon size="48" class="mb-3">mdi-chart-timeline-variant</v-icon>
        <div>{{ $t('fireHistory.empty') }}</div>
        <div class="mt-1">{{ $t('fireHistory.emptyHint') }}</div>
      </div>

      <template v-else>
        <!-- 요약 카드 -->
        <div class="d-flex ga-3 mb-4">
          <v-card rounded="xl" class="summary-card flex-1 pa-4 text-center">
            <div class="text-medium-emphasis mb-1">{{ $t('fireHistory.currentRate') }}</div>
            <div class="font-weight-bold text-primary">{{ lastPt?.progress_pct.toFixed(1) }}%</div>
          </v-card>
          <v-card rounded="xl" class="summary-card flex-1 pa-4 text-center">
            <div class="text-medium-emphasis mb-1">{{ $t('fireHistory.periodChange') }}</div>
            <div
              class="font-weight-bold"
              :class="(pctChange ?? 0) >= 0 ? 'text-success' : 'text-error'"
            >
              {{ (pctChange ?? 0) >= 0 ? '+' : '' }}{{ pctChange?.toFixed(1) }}%
            </div>
          </v-card>
          <v-card rounded="xl" class="summary-card flex-1 pa-4 text-center">
            <div class="text-medium-emphasis mb-1">{{ $t('fireHistory.currentAsset') }}</div>
            <div class="font-weight-bold">{{ formatAsset(currentAsset) }}</div>
          </v-card>
        </div>

        <!-- 기간 탭 -->
        <div class="d-flex ga-2 mb-3">
          <button
            v-for="p in periods"
            :key="p.value"
            class="period-btn"
            :class="{ active: selectedPeriod === p.value }"
            @click="selectedPeriod = p.value; tooltip = null"
          >
            {{ $t(p.labelKey) }}
          </button>
        </div>

        <!-- 차트 -->
        <v-card rounded="xl" class="pa-4">
          <div v-if="!chartData" class="text-center text-medium-emphasis py-6">
            {{ $t('fireHistory.chartHint') }}
          </div>
          <svg
            v-else
            ref="svgRef"
            :viewBox="`0 0 ${VW} ${VH}`"
            width="100%"
            style="overflow: visible; touch-action: none"
            @mousemove="onChartMove"
            @mouseleave="onChartLeave"
            @touchmove.prevent="onChartMove"
            @touchend="onChartLeave"
          >
            <defs>
              <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0.25" />
                <stop offset="100%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0" />
              </linearGradient>
            </defs>

            <!-- Y축 눈금선 -->
            <template v-for="tick in chartData.yTicks" :key="tick">
              <line
                :x1="PAD.left" :y1="chartData.toY(tick)"
                :x2="VW - PAD.right" :y2="chartData.toY(tick)"
                stroke="rgba(var(--v-theme-on-surface), 0.07)" stroke-width="1"
              />
              <text
                :x="PAD.left - 4" :y="chartData.toY(tick) + 4"
                text-anchor="end" font-size="9"
                fill="rgba(var(--v-theme-on-surface), 0.4)"
              >{{ tick }}%</text>
            </template>

            <!-- 채우기 & 라인 -->
            <path :d="chartData.fill" fill="url(#histGrad)" />
            <path :d="chartData.path" fill="none" stroke="rgb(var(--v-theme-primary))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

            <!-- X축 레이블 -->
            <text
              v-for="lbl in chartData.xLabels" :key="lbl.label"
              :x="lbl.x" :y="VH - 4"
              text-anchor="middle" font-size="9"
              fill="rgba(var(--v-theme-on-surface), 0.4)"
            >{{ lbl.label }}</text>

            <!-- 툴팁 -->
            <template v-if="tooltip">
              <line
                :x1="tooltip.x" :y1="PAD.top"
                :x2="tooltip.x" :y2="PAD.top + PH"
                stroke="rgba(var(--v-theme-on-surface), 0.2)" stroke-width="1" stroke-dasharray="3,3"
              />
              <circle :cx="tooltip.x" :cy="tooltip.y" r="4" fill="rgb(var(--v-theme-primary))" />
              <!-- 툴팁 박스 -->
              <g :transform="`translate(${Math.min(tooltip.x + 6, VW - 90)}, ${Math.max(tooltip.y - 30, PAD.top)})`">
                <rect width="84" height="36" rx="6" fill="rgb(var(--v-theme-surface))" stroke="rgba(var(--v-theme-on-surface),0.12)" stroke-width="1" />
                <text x="8" y="13" font-size="9" fill="rgba(var(--v-theme-on-surface), 0.6)">{{ tooltip.pt.recorded_at }}</text>
                <text x="8" y="27" font-size="11" font-weight="bold" fill="rgb(var(--v-theme-primary))">{{ tooltip.pt.progress_pct.toFixed(1) }}%</text>
              </g>
            </template>
          </svg>
        </v-card>
      </template>
    </template>
  </v-container>
</template>

<style scoped>
.summary-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--fp-outline);
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
</style>
