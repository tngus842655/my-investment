<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
const loading = ref(true)

interface HistoryPoint {
  recorded_at: string
  current_asset: number
}

const history = ref<HistoryPoint[]>([])

onMounted(async () => {
  try {
    const { data, error } = await supabase
      .from('asset_history')
      .select('recorded_at, current_asset')
      .order('recorded_at', { ascending: true })
    if (error) throw error
    history.value = data ?? []
  } catch {
    showMessage('데이터를 불러오는 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
})

// 일별 데이터를 월별로 집계 (해당 월 마지막 기록값 사용)
interface MonthlyPoint {
  month: string   // 'YYYY-MM'
  label: string   // 'YY.MM'
  asset: number
  change: number  // 전월 대비 증감
}

const monthlyData = computed<MonthlyPoint[]>(() => {
  const all = history.value
  if (!all.length) return []

  // 월별 마지막 값 추출
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
      change: asset - prev,
    }
  })
})

const selectedPeriod = ref<'6M' | '1Y' | 'ALL'>('1Y')
const periods = [
  { label: '6개월', value: '6M' },
  { label: '1년', value: '1Y' },
  { label: '전체', value: 'ALL' },
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
const VH = 180
const PAD = { top: 20, right: 8, bottom: 36, left: 44 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

const chartData = computed(() => {
  const pts = filteredData.value
  if (!pts.length) return null

  const maxAsset = Math.max(...pts.map((p) => p.asset))
  const barW = Math.max(4, PW / pts.length - 4)

  const toX = (i: number) => PAD.left + (i / pts.length) * PW + PW / pts.length / 2
  const toBarH = (asset: number) => (asset / (maxAsset * 1.1)) * PH
  const toBarY = (asset: number) => PAD.top + PH - toBarH(asset)

  // Y축 눈금 3개
  const yMax = maxAsset * 1.1
  const yTicks = [0, yMax / 2, yMax].map((v) => ({
    value: v,
    y: PAD.top + PH - (v / yMax) * PH,
    label: formatShort(v),
  }))

  // X축: 월 라벨 (최대 6개)
  const step = Math.ceil(pts.length / 6)
  const xLabels = pts
    .map((p, i) => ({ x: toX(i), label: p.label, i }))
    .filter((_, i) => i % step === 0 || i === pts.length - 1)

  return { pts, barW, toX, toBarH, toBarY, yTicks, xLabels }
})

// 툴팁
const tooltip = ref<{ x: number; y: number; pt: MonthlyPoint } | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)

const onChartClick = (pt: MonthlyPoint, x: number, y: number) => {
  if (tooltip.value?.pt.month === pt.month) {
    tooltip.value = null
  } else {
    tooltip.value = { x, y, pt }
  }
}

// 요약 통계
const totalGrowth = computed(() => {
  const pts = filteredData.value
  if (pts.length < 2) return null
  const first = pts[0]!.asset
  const last = pts[pts.length - 1]!.asset
  return { amount: last - first, pct: first > 0 ? ((last - first) / first) * 100 : 0 }
})

const bestMonth = computed(() => {
  const pts = filteredData.value.slice(1)
  if (!pts.length) return null
  return pts.reduce((best, p) => (p.change > best.change ? p : best), pts[0]!)
})

const latestAsset = computed(() => {
  const pts = filteredData.value
  return pts[pts.length - 1]?.asset ?? 0
})

function formatShort(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(0)}억`
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(0)}천만`
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만`
  return v.toLocaleString()
}

function formatFull(v: number) {
  return Math.round(v).toLocaleString('ko-KR') + '원'
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex align-center ga-2 mb-6">
      <v-btn icon size="small" variant="text" @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div>
        <div class="text-h5 font-weight-bold">자산 성장 리포트</div>
        <div class="text-body-2 text-medium-emphasis">월별 자산 증가 추이</div>
      </div>
    </div>

    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else>
      <div v-if="monthlyData.length < 1" class="text-center py-12 text-medium-emphasis">
        <v-icon size="48" class="mb-3">mdi-chart-bar</v-icon>
        <div class="text-body-2">아직 기록이 없어요.</div>
        <div class="text-caption mt-1">자산 데이터가 쌓이면 월별 추이를 확인할 수 있어요.</div>
      </div>

      <template v-else>
        <!-- 요약 카드 3개 -->
        <div class="d-flex ga-3 mb-4">
          <v-card rounded="xl" class="summary-card flex-1 pa-4 text-center">
            <div class="text-caption text-medium-emphasis mb-1">현재 자산</div>
            <div class="text-body-1 font-weight-bold text-primary">{{ formatShort(latestAsset) }}</div>
          </v-card>
          <v-card rounded="xl" class="summary-card flex-1 pa-4 text-center">
            <div class="text-caption text-medium-emphasis mb-1">기간 증감</div>
            <div
              v-if="totalGrowth"
              class="text-body-1 font-weight-bold"
              :class="totalGrowth.amount >= 0 ? 'text-success' : 'text-error'"
            >
              {{ totalGrowth.amount >= 0 ? '+' : '' }}{{ totalGrowth.pct.toFixed(1) }}%
            </div>
            <div v-else class="text-body-1 font-weight-bold text-medium-emphasis">-</div>
          </v-card>
          <v-card rounded="xl" class="summary-card flex-1 pa-4 text-center">
            <div class="text-caption text-medium-emphasis mb-1">최고 증가월</div>
            <div v-if="bestMonth" class="text-body-1 font-weight-bold text-success">
              {{ bestMonth.label }}
            </div>
            <div v-else class="text-body-1 font-weight-bold text-medium-emphasis">-</div>
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
            {{ p.label }}
          </button>
        </div>

        <!-- 바 차트 -->
        <v-card rounded="xl" class="pa-4 mb-4">
          <div v-if="!chartData || filteredData.length < 1" class="text-center text-caption text-medium-emphasis py-6">
            데이터가 부족합니다.
          </div>
          <svg
            v-else
            ref="svgRef"
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

            <!-- 바 -->
            <g
              v-for="(pt, i) in chartData.pts"
              :key="pt.month"
              style="cursor: pointer"
              @click="onChartClick(pt, chartData.toX(i), chartData.toBarY(pt.asset))"
            >
              <rect
                :x="chartData.toX(i) - chartData.barW / 2"
                :y="chartData.toBarY(pt.asset)"
                :width="chartData.barW"
                :height="chartData.toBarH(pt.asset)"
                :rx="3"
                :fill="tooltip?.pt.month === pt.month ? 'rgb(var(--v-theme-primary))' : 'rgba(var(--v-theme-primary), 0.45)'"
              />
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
              <g :transform="`translate(${Math.min(tooltip.x + 6, VW - 110)}, ${Math.max(tooltip.y - 44, PAD.top)})`">
                <rect width="104" height="42" rx="6"
                  fill="rgb(var(--v-theme-surface))"
                  stroke="rgba(var(--v-theme-on-surface),0.12)" stroke-width="1" />
                <text x="8" y="14" font-size="9" fill="rgba(var(--v-theme-on-surface), 0.55)">{{ tooltip.pt.month }}</text>
                <text x="8" y="28" font-size="10" font-weight="bold" fill="rgb(var(--v-theme-primary))">{{ formatShort(tooltip.pt.asset) }}</text>
                <text
                  x="8" y="40" font-size="9"
                  :fill="tooltip.pt.change >= 0 ? 'rgb(var(--v-theme-success))' : 'rgb(var(--v-theme-error))'"
                >{{ tooltip.pt.change >= 0 ? '+' : '' }}{{ formatShort(tooltip.pt.change) }}</text>
              </g>
            </template>
          </svg>
        </v-card>

        <!-- 월별 상세 테이블 -->
        <v-card rounded="xl" class="pa-4">
          <div class="text-body-2 font-weight-medium mb-3">월별 상세</div>
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
              {{ pt.change > 0 ? '+' : '' }}{{ formatShort(pt.change) }}
            </span>
          </div>
        </v-card>
      </template>
    </template>
  </v-container>
</template>

<style scoped>
.summary-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}
.period-btn {
  flex: 1;
  padding: 6px 0;
  border-radius: 10px;
  font-size: 12px;
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
.month-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
}
.border-top {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.month-label {
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  width: 72px;
  flex-shrink: 0;
}
.month-asset {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
}
.month-change {
  width: 64px;
  font-size: 12px;
  text-align: right;
  flex-shrink: 0;
}
</style>
