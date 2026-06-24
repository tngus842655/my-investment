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
  progress_pct: number
}

const history = ref<HistoryPoint[]>([])

onMounted(async () => {
  try {
    // 오늘 스냅샷 저장 (없으면 insert, 있으면 update)
    await supabase.rpc('save_daily_asset_snapshot')

    const { data, error } = await supabase
      .from('asset_history')
      .select('recorded_at, current_asset, progress_pct')
      .order('recorded_at', { ascending: true })

    if (error) throw error
    history.value = data ?? []
  } catch {
    showMessage('데이터를 불러오는 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
})

// ── SVG 차트 ─────────────────────────────────────
const VW = 300
const VH = 160
const PAD = { top: 16, right: 16, bottom: 32, left: 40 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

const chartData = computed(() => {
  const pts = history.value
  if (pts.length < 2) return null

  const maxY = Math.min(Math.max(...pts.map((p) => p.progress_pct)) * 1.1, 100)
  const minY = 0

  const toX = (i: number) => PAD.left + (i / (pts.length - 1)) * PW
  const toY = (pct: number) => PAD.top + PH - ((pct - minY) / Math.max(maxY - minY, 1)) * PH

  const path = pts.reduce((acc, pt, i) => {
    const x = toX(i)
    const y = toY(pt.progress_pct)
    if (i === 0) return `M ${x},${y}`
    const prev = pts[i - 1]!
    const cpx = (toX(i - 1) + x) / 2
    return acc + ` C ${cpx},${toY(prev.progress_pct)} ${cpx},${y} ${x},${y}`
  }, '')

  const fill = path
    ? path + ` L ${toX(pts.length - 1)},${PAD.top + PH} L ${toX(0)},${PAD.top + PH} Z`
    : ''

  // Y축 눈금 (0, 25, 50, 75, 100)
  const yTicks = [0, 25, 50, 75, 100].filter((v) => v <= maxY + 5)

  // X축 레이블 (첫/중간/마지막)
  const xLabels = [0, Math.floor((pts.length - 1) / 2), pts.length - 1]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .map((i) => ({ x: toX(i), label: pts[i]!.recorded_at.slice(5) }))

  const latest = pts[pts.length - 1]!
  const latestX = toX(pts.length - 1)
  const latestY = toY(latest.progress_pct)

  return { path, fill, yTicks, xLabels, toY, latestX, latestY, latest }
})

const formatAsset = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`
  if (v >= 10_000) return `${Math.round(v / 10_000)}만`
  return `${v}`
}

const firstPoint = computed(() => history.value[0] ?? null)
const lastPoint = computed(() => history.value[history.value.length - 1] ?? null)
const pctChange = computed(() => {
  if (!firstPoint.value || !lastPoint.value) return null
  return (lastPoint.value.progress_pct - firstPoint.value.progress_pct).toFixed(1)
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
        <div class="text-h5 font-weight-bold">FIRE 진행 기록</div>
        <div class="text-body-2 text-medium-emphasis">목표 달성률 변화 히스토리</div>
      </div>
    </div>

    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else>
      <!-- 데이터 없음 -->
      <div v-if="history.length < 2" class="text-center py-12 text-medium-emphasis">
        <v-icon size="48" class="mb-3">mdi-chart-timeline-variant</v-icon>
        <div class="text-body-2">데이터가 아직 부족해요.</div>
        <div class="text-caption mt-1">매일 접속하면 히스토리가 쌓여요!</div>
      </div>

      <template v-else>
        <!-- 요약 카드 -->
        <div class="d-flex ga-3 mb-4">
          <v-card rounded="xl" class="summary-card flex-1 pa-4">
            <div class="text-caption text-medium-emphasis mb-1">현재 달성률</div>
            <div class="text-h6 font-weight-bold text-primary">{{ lastPoint?.progress_pct.toFixed(1) }}%</div>
          </v-card>
          <v-card rounded="xl" class="summary-card flex-1 pa-4">
            <div class="text-caption text-medium-emphasis mb-1">첫 기록 대비</div>
            <div class="text-h6 font-weight-bold" :class="Number(pctChange) >= 0 ? 'text-success' : 'text-error'">
              {{ Number(pctChange) >= 0 ? '+' : '' }}{{ pctChange }}%
            </div>
          </v-card>
          <v-card rounded="xl" class="summary-card flex-1 pa-4">
            <div class="text-caption text-medium-emphasis mb-1">현재 자산</div>
            <div class="text-h6 font-weight-bold">{{ formatAsset(lastPoint?.current_asset ?? 0) }}</div>
          </v-card>
        </div>

        <!-- 라인 차트 -->
        <v-card rounded="xl" class="pa-4 mb-4">
          <div class="text-body-2 font-weight-medium mb-3">달성률 추이 (%)</div>
          <svg :viewBox="`0 0 ${VW} ${VH}`" width="100%" style="overflow: visible">
            <defs>
              <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0.3" />
                <stop offset="100%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0" />
              </linearGradient>
            </defs>

            <!-- Y축 눈금선 -->
            <template v-if="chartData">
              <line
                v-for="tick in chartData.yTicks"
                :key="tick"
                :x1="PAD.left"
                :y1="chartData.toY(tick)"
                :x2="VW - PAD.right"
                :y2="chartData.toY(tick)"
                stroke="rgba(var(--v-theme-on-surface), 0.08)"
                stroke-width="1"
              />
              <text
                v-for="tick in chartData.yTicks"
                :key="`t${tick}`"
                :x="PAD.left - 4"
                :y="chartData.toY(tick) + 4"
                text-anchor="end"
                font-size="9"
                fill="rgba(var(--v-theme-on-surface), 0.4)"
              >{{ tick }}</text>

              <!-- 채우기 -->
              <path :d="chartData.fill" fill="url(#histGrad)" />
              <!-- 라인 -->
              <path :d="chartData.path" fill="none" stroke="rgb(var(--v-theme-primary))" stroke-width="2" stroke-linecap="round" />

              <!-- 마지막 점 -->
              <circle
                :cx="chartData.latestX"
                :cy="chartData.latestY"
                r="4"
                fill="rgb(var(--v-theme-primary))"
              />

              <!-- X축 레이블 -->
              <text
                v-for="lbl in chartData.xLabels"
                :key="lbl.label"
                :x="lbl.x"
                :y="VH - 4"
                text-anchor="middle"
                font-size="9"
                fill="rgba(var(--v-theme-on-surface), 0.4)"
              >{{ lbl.label }}</text>
            </template>
          </svg>
        </v-card>

        <!-- 히스토리 목록 -->
        <v-card rounded="xl" class="pa-4">
          <div class="text-body-2 font-weight-medium mb-3">기록 목록</div>
          <div
            v-for="(pt, i) in [...history].reverse()"
            :key="pt.recorded_at"
            class="d-flex align-center py-2"
            :class="i < history.length - 1 ? 'border-b' : ''"
          >
            <div class="text-caption text-medium-emphasis" style="width: 80px">{{ pt.recorded_at }}</div>
            <v-progress-linear
              :model-value="pt.progress_pct"
              color="primary"
              rounded
              height="6"
              class="flex-1 mx-3"
            />
            <div class="text-caption font-weight-medium" style="width: 48px; text-align: right">
              {{ pt.progress_pct.toFixed(1) }}%
            </div>
          </div>
        </v-card>
      </template>
    </template>
  </v-container>
</template>

<style scoped>
.summary-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
}
.border-b {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}
</style>
