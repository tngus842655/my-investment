<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { formatShortMoney } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
const loading = ref(true)

// ── 기준값 (DB 로드) ──────────────────────────────
const baseMonthly = ref(0)
const baseReturn = ref(5)
const targetAsset = ref(0)
const currentAsset = ref(0)

// ── 시뮬레이션 슬라이더 값 ────────────────────────
const simMonthly = ref(0)
const simReturn = ref(5)

// ── 복리 계산 ─────────────────────────────────────
const calcAsset = (C: number, M: number, annualPct: number, n: number) => {
  const r = annualPct / 100 / 12
  if (r === 0) return C + M * n
  return C * Math.pow(1 + r, n) + (M * (Math.pow(1 + r, n) - 1)) / r
}

interface MonthPoint {
  month: number  // 시작월로부터 경과 개월 수
  year: number   // 해당 월의 연도 (레이블용)
  asset: number
}

function buildProjection(C: number, M: number, annualPct: number, T: number): MonthPoint[] {
  if (!C && !M) return []
  const r = annualPct / 100 / 12
  const now = new Date()
  const startYear = now.getFullYear()
  const startMonth = now.getMonth() // 0-indexed

  let maxMonths = 360
  if (T > 0 && M > 0) {
    if (r === 0) {
      maxMonths = Math.min(Math.ceil((T - C) / M) + 12, 360)
    } else {
      const num = T * r + M
      const den = C * r + M
      if (den > 0 && num / den > 1) {
        maxMonths = Math.min(Math.ceil(Math.log(num / den) / Math.log(1 + r)) + 12, 360)
      }
    }
  }

  const points: MonthPoint[] = []
  for (let n = 0; n <= maxMonths; n++) {
    const asset = calcAsset(C, M, annualPct, n)
    const absMonth = startMonth + n
    const year = startYear + Math.floor(absMonth / 12)
    points.push({ month: n, year, asset: Math.round(asset) })
    if (T > 0 && asset >= T && n > 0) break
  }
  return points
}

function calcFireMonths(C: number, M: number, annualPct: number, T: number): number | null {
  if (!T || !M || C >= T) return null
  const r = annualPct / 100 / 12
  let months: number
  if (r === 0) {
    months = Math.ceil((T - C) / M)
  } else {
    const num = T * r + M
    const den = C * r + M
    if (den <= 0) return null
    months = Math.ceil(Math.log(num / den) / Math.log(1 + r))
  }
  return isFinite(months) && months > 0 ? months : null
}

function monthsToLabel(months: number): string {
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y > 0) return `${y}년 ${m > 0 ? m + '개월' : ''}`
  return `${months}개월`
}

function monthsToDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

const baseProjection = computed(() => buildProjection(currentAsset.value, baseMonthly.value, baseReturn.value, targetAsset.value))
const simProjection = computed(() => buildProjection(currentAsset.value, simMonthly.value, simReturn.value, targetAsset.value))

const baseMonths = computed(() => calcFireMonths(currentAsset.value, baseMonthly.value, baseReturn.value, targetAsset.value))
const simMonths = computed(() => calcFireMonths(currentAsset.value, simMonthly.value, simReturn.value, targetAsset.value))

const diffMonths = computed(() => {
  if (baseMonths.value === null || simMonths.value === null) return null
  return baseMonths.value - simMonths.value // 양수면 시뮬이 빠름
})

const isChanged = computed(() => simMonthly.value !== baseMonthly.value || simReturn.value !== baseReturn.value)

// ── SVG 차트 ─────────────────────────────────────
const VW = 300
const VH = 180
const PAD = { top: 16, right: 16, bottom: 32, left: 8 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

const chartData = computed(() => {
  const basePts = baseProjection.value
  const simPts = simProjection.value
  if (basePts.length < 2 && simPts.length < 2) return null

  const allPts = [...basePts, ...simPts]
  const maxY = Math.max(...allPts.map((p) => p.asset)) * 1.05
  const minM = 0
  const maxM = Math.max(...allPts.map((p) => p.month))

  const toX = (m: number) => PAD.left + ((m - minM) / Math.max(maxM - minM, 1)) * PW
  const toY = (asset: number) => PAD.top + PH - (asset / Math.max(maxY, 1)) * PH

  function buildPath(pts: MonthPoint[]) {
    if (pts.length < 2) return ''
    return pts.reduce((acc, pt, i) => {
      const x = toX(pt.month)
      const y = toY(pt.asset)
      if (i === 0) return `M ${x},${y}`
      const prev = pts[i - 1]!
      const cpx = (toX(prev.month) + x) / 2
      return acc + ` C ${cpx},${toY(prev.asset)} ${cpx},${y} ${x},${y}`
    }, '')
  }

  function buildFill(pts: MonthPoint[], path: string) {
    if (!path) return ''
    const first = pts[0]!
    const last = pts[pts.length - 1]!
    return path + ` L ${toX(last.month)},${PAD.top + PH} L ${toX(first.month)},${PAD.top + PH} Z`
  }

  const basePath = buildPath(basePts)
  const simPath = buildPath(simPts)

  // 목표선 Y
  const goalY = targetAsset.value > 0 ? toY(targetAsset.value) : null

  // X축 레이블: 연도가 바뀌는 첫 번째 월 포인트를 기준으로 최대 5개
  const seenYears = new Set<number>()
  const yearTicks: { x: number; label: string }[] = []
  for (const p of [...basePts, ...simPts].sort((a, b) => a.month - b.month)) {
    if (!seenYears.has(p.year)) {
      seenYears.add(p.year)
      yearTicks.push({ x: toX(p.month), label: String(p.year) })
    }
  }
  const tickStep = Math.max(1, Math.ceil(yearTicks.length / 5))
  const xLabels = yearTicks.filter((_, i) => i % tickStep === 0 || i === yearTicks.length - 1)

  // 달성 포인트
  const baseGoalRaw = targetAsset.value > 0 ? basePts.find((p) => p.asset >= targetAsset.value) : null
  const simGoalRaw = targetAsset.value > 0 ? simPts.find((p) => p.asset >= targetAsset.value) : null
  const baseGoalPt = baseGoalRaw ? { x: toX(baseGoalRaw.month), y: toY(baseGoalRaw.asset) } : null
  const simGoalPt = simGoalRaw ? { x: toX(simGoalRaw.month), y: toY(simGoalRaw.asset) } : null

  return {
    basePath,
    simPath,
    baseFill: buildFill(basePts, basePath),
    simFill: buildFill(simPts, simPath),
    goalY,
    xLabels,
    baseGoalPt,
    simGoalPt,
  }
})

const resetSim = () => {
  simMonthly.value = baseMonthly.value
  simReturn.value = baseReturn.value
}

const loadData = async () => {
  loading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [goalResult, summaryResult] = await Promise.all([
      supabase.from('investment_goals').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('asset_summary').select('current_asset').eq('user_id', user.id).maybeSingle(),
    ])
    if (goalResult.data) {
      baseMonthly.value = Math.round((goalResult.data.monthly_investment ?? 0) / 10000) * 10000
      baseReturn.value = goalResult.data.annual_return ?? 5
      targetAsset.value = goalResult.data.target_asset ?? 0
    }
    currentAsset.value = summaryResult.data?.current_asset ?? 0
    simMonthly.value = baseMonthly.value
    simReturn.value = baseReturn.value
  } catch {
    showMessage('데이터를 불러오는 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex align-center ga-2 mb-6">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" class="mr-1" style="color: rgb(var(--v-theme-on-surface))" @click="router.back()" />
      <div>
        <div class="text-h5 font-weight-bold">FIRE 시뮬레이터</div>
        <div class="text-body-2 text-medium-emphasis">투자 조건 변경 시 달성일 비교</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="card" class="rounded-2xl mb-4" />
      <v-skeleton-loader type="card" class="rounded-2xl mb-4" />
      <v-skeleton-loader type="card" class="rounded-2xl" />
    </template>

    <template v-else>
      <!-- 슬라이더 섹션 -->
      <div class="sim-card mb-4">
        <div class="d-flex justify-space-between align-center mb-4">
          <div class="section-title">시뮬레이션 조건</div>
          <button v-if="isChanged" class="reset-btn" @click="resetSim">
            <v-icon size="14" class="mr-1">mdi-refresh</v-icon>초기화
          </button>
        </div>

        <!-- 월 투자금 슬라이더 -->
        <div class="slider-group mb-4">
          <div class="d-flex justify-space-between align-center mb-1">
            <div class="slider-label">월 투자금</div>
            <div class="slider-value">{{ formatShortMoney(simMonthly) }}원</div>
          </div>
          <v-slider v-model="simMonthly" :min="100000" :max="10000000" :step="100000" color="primary" track-color="rgba(var(--v-theme-primary), 0.15)" hide-details thumb-size="18" />
          <div class="d-flex justify-space-between mt-1">
            <span class="slider-hint">10만</span>
            <span class="slider-hint">
              기준 <span class="base-mark">{{ formatShortMoney(baseMonthly) }}</span>
            </span>
            <span class="slider-hint">1,000만</span>
          </div>
        </div>

        <!-- 연 수익률 슬라이더 -->
        <div class="slider-group">
          <div class="d-flex justify-space-between align-center mb-1">
            <div class="slider-label">연 수익률</div>
            <div class="slider-value">{{ simReturn.toFixed(1) }}%</div>
          </div>
          <v-slider v-model="simReturn" :min="1" :max="25" :step="0.5" color="primary" track-color="rgba(var(--v-theme-primary), 0.15)" hide-details thumb-size="18" />
          <div class="d-flex justify-space-between mt-1">
            <span class="slider-hint">1%</span>
            <span class="slider-hint">
              기준 <span class="base-mark">{{ baseReturn }}%</span>
            </span>
            <span class="slider-hint">25%</span>
          </div>
        </div>
      </div>

      <!-- 차트 -->
      <div class="sim-card pa-4 mb-4" v-if="chartData">
        <!-- 범례 -->
        <div class="d-flex ga-4 mb-3">
          <div class="d-flex align-center ga-2">
            <div class="legend-line base-line" />
            <span class="text-caption text-medium-emphasis">기존 계획</span>
          </div>
          <div class="d-flex align-center ga-2">
            <div class="legend-line sim-line" />
            <span class="text-caption font-weight-medium">시뮬레이션</span>
          </div>
        </div>

        <svg :viewBox="`0 0 ${VW} ${VH}`" width="100%" :height="VH" style="overflow: visible">
          <defs>
            <linearGradient id="simFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0.2" />
              <stop offset="100%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0" />
            </linearGradient>
            <linearGradient id="baseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgb(var(--v-theme-on-surface))" stop-opacity="0.07" />
              <stop offset="100%" stop-color="rgb(var(--v-theme-on-surface))" stop-opacity="0" />
            </linearGradient>
          </defs>

          <!-- 목표선 -->
          <line v-if="chartData.goalY !== null" :x1="PAD.left" :y1="chartData.goalY" :x2="VW - PAD.right" :y2="chartData.goalY" stroke="rgb(var(--v-theme-primary))" stroke-width="1" stroke-dasharray="4 3" opacity="0.3" />

          <!-- 기존 계획 fill + 선 -->
          <path :d="chartData.baseFill" fill="url(#baseFill)" />
          <path :d="chartData.basePath" fill="none" stroke="rgba(var(--v-theme-on-surface), 0.25)" stroke-width="2" stroke-dasharray="5 3" stroke-linecap="round" />

          <!-- 시뮬레이션 fill + 선 -->
          <path :d="chartData.simFill" fill="url(#simFill)" />
          <path :d="chartData.simPath" fill="none" stroke="rgb(var(--v-theme-primary))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

          <!-- 기존 목표 달성 포인트 -->
          <circle v-if="chartData.baseGoalPt" :cx="chartData.baseGoalPt.x" :cy="chartData.baseGoalPt.y" r="4" fill="rgba(var(--v-theme-on-surface), 0.4)" />

          <!-- 시뮬 목표 달성 포인트 -->
          <g v-if="chartData.simGoalPt">
            <circle :cx="chartData.simGoalPt.x" :cy="chartData.simGoalPt.y" r="5" fill="rgb(var(--v-theme-primary))" />
            <text :x="chartData.simGoalPt.x" :y="chartData.simGoalPt.y - 10" text-anchor="middle" font-size="12">🚩</text>
          </g>

          <!-- X축 레이블 -->
          <text v-for="lbl in chartData.xLabels" :key="lbl.label" :x="lbl.x" :y="VH - 4" text-anchor="middle" font-size="9" :fill="`rgba(var(--v-theme-on-surface), 0.35)`">{{ lbl.label }}</text>
        </svg>
      </div>

      <!-- 비교 요약 -->
      <div class="compare-grid">
        <!-- 기존 계획 -->
        <div class="compare-card">
          <div class="compare-badge base-badge">기존 계획</div>
          <template v-if="baseMonths !== null">
            <div class="compare-date">{{ monthsToDate(baseMonths) }}</div>
            <div class="compare-duration">{{ monthsToLabel(baseMonths) }}</div>
          </template>
          <div v-else class="compare-na">달성 불가</div>
          <div class="compare-sub mt-2">
            <span>월 {{ formatShortMoney(baseMonthly) }}원</span>
            <span class="mx-1">·</span>
            <span>연 {{ baseReturn }}%</span>
          </div>
        </div>

        <!-- 시뮬레이션 -->
        <div class="compare-card sim-active">
          <div class="compare-badge sim-badge">시뮬레이션</div>
          <template v-if="simMonths !== null">
            <div class="compare-date primary-text">{{ monthsToDate(simMonths) }}</div>
            <div class="compare-duration primary-text">{{ monthsToLabel(simMonths) }}</div>
          </template>
          <div v-else class="compare-na">달성 불가</div>
          <div class="compare-sub mt-2">
            <span>월 {{ formatShortMoney(simMonthly) }}원</span>
            <span class="mx-1">·</span>
            <span>연 {{ simReturn }}%</span>
          </div>
        </div>

        <!-- 차이 -->
        <div class="diff-card" v-if="diffMonths !== null">
          <template v-if="diffMonths > 0">
            <v-icon color="primary" size="20">mdi-lightning-bolt</v-icon>
            <span class="diff-text faster">{{ monthsToLabel(Math.abs(diffMonths)) }} 단축</span>
          </template>
          <template v-else-if="diffMonths < 0">
            <v-icon color="error" size="20">mdi-arrow-down</v-icon>
            <span class="diff-text slower">{{ monthsToLabel(Math.abs(diffMonths)) }} 지연</span>
          </template>
          <template v-else>
            <v-icon color="grey" size="20">mdi-minus</v-icon>
            <span class="diff-text">차이 없음</span>
          </template>
        </div>
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.sim-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 24px;
  padding: 20px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.reset-btn {
  display: flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.12);
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
}
.reset-btn:active {
  opacity: 0.6;
}

.slider-label {
  font-size: 13px;
  font-weight: 600;
}
.slider-value {
  font-size: 15px;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
}
.slider-hint {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.base-mark {
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-weight: 600;
}

.legend-line {
  width: 24px;
  height: 3px;
  border-radius: 2px;
}
.base-line {
  background: rgba(var(--v-theme-on-surface), 0.3);
  background-image: repeating-linear-gradient(90deg, rgba(var(--v-theme-on-surface), 0.4) 0px, rgba(var(--v-theme-on-surface), 0.4) 5px, transparent 5px, transparent 8px);
}
.sim-line {
  background: rgb(var(--v-theme-primary));
}

/* 비교 그리드 */
.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.compare-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 20px;
  padding: 16px;
}
.sim-active {
  border-color: rgba(var(--v-theme-primary), 0.3);
  background: rgba(var(--v-theme-primary), 0.04);
}

.compare-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  border-radius: 20px;
  margin-bottom: 10px;
}
.base-badge {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.sim-badge {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.compare-date {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}
.compare-duration {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-top: 2px;
}
.compare-na {
  font-size: 14px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-weight: 600;
}
.compare-sub {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.primary-text {
  color: rgb(var(--v-theme-primary));
}

.diff-card {
  grid-column: 1 / -1;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 16px;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.diff-text {
  font-size: 15px;
  font-weight: 700;
}
.diff-text.faster {
  color: rgb(var(--v-theme-primary));
}
.diff-text.slower {
  color: rgb(var(--v-theme-error));
}
</style>
