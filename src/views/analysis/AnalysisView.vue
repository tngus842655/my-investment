<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { formatShortMoney } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
const loading = ref(true)

const targetAsset = ref(0)
const currentAsset = ref(0)
const monthlyInvestment = ref(0)
const annualReturn = ref<number | null>(null)

// ── 복리 계산 ─────────────────────────────────────
// C: 현재 자산, M: 월 투자금, r: 월 수익률, n: 개월 수
const calcAsset = (C: number, M: number, r: number, n: number) => {
  if (r === 0) return C + M * n
  return C * Math.pow(1 + r, n) + M * (Math.pow(1 + r, n) - 1) / r
}

interface YearPoint { year: number; asset: number }

const projection = computed<YearPoint[]>(() => {
  const C = currentAsset.value
  const M = monthlyInvestment.value
  const T = targetAsset.value
  if (!C && !M) return []

  const r = (annualReturn.value ?? 0) / 100 / 12
  const now = new Date()
  const startYear = now.getFullYear()

  // 목표 달성까지 최대 몇 개월인지 계산
  let maxMonths = 360 // 최대 30년
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

  const points: YearPoint[] = []
  // 현재 시점 포함, 1년 단위 샘플
  const endYear = startYear + Math.ceil(maxMonths / 12)
  for (let y = startYear; y <= endYear; y++) {
    const n = (y - startYear) * 12
    const asset = calcAsset(C, M, r, n)
    points.push({ year: y, asset: Math.round(asset) })
    // 목표 달성 후 1개 포인트만 더 찍고 중단
    if (T > 0 && asset >= T && y > startYear) break
  }
  return points
})

const totalInvested = computed(() => {
  const last = projection.value[projection.value.length - 1]
  if (!last) return 0
  const years = last.year - (projection.value[0]?.year ?? last.year)
  return monthlyInvestment.value * years * 12
})

const totalReturn = computed(() => {
  const last = projection.value[projection.value.length - 1]
  if (!last) return 0
  return last.asset - currentAsset.value - totalInvested.value
})

const finalAsset = computed(() => projection.value[projection.value.length - 1]?.asset ?? 0)

const remainingInfo = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  const M = monthlyInvestment.value
  if (!T || !M || annualReturn.value === null) return null
  const r = annualReturn.value / 100 / 12
  if (C >= T) return null

  let months: number
  if (r === 0) {
    months = Math.ceil((T - C) / M)
  } else {
    const num = T * r + M
    const den = C * r + M
    if (den <= 0) return null
    months = Math.ceil(Math.log(num / den) / Math.log(1 + r))
  }
  if (!isFinite(months) || months <= 0) return null
  const years = Math.floor(months / 12)
  const rem = months % 12
  return years > 0
    ? `약 ${years}년 ${rem > 0 ? rem + '개월' : ''} 남았습니다`
    : `약 ${months}개월 남았습니다`
})

// ── SVG 차트 ─────────────────────────────────────
const VW = 300
const VH = 180
const PAD = { top: 16, right: 16, bottom: 32, left: 8 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

const chartPoints = computed(() => {
  const pts = projection.value
  if (pts.length < 2) return null

  const minY = 0
  const maxY = pts[pts.length - 1]!.asset * 1.05
  const minX = pts[0]!.year
  const maxX = pts[pts.length - 1]!.year

  const toX = (year: number) =>
    PAD.left + ((year - minX) / Math.max(maxX - minX, 1)) * PW
  const toY = (asset: number) =>
    PAD.top + PH - ((asset - minY) / Math.max(maxY - minY, 1)) * PH

  const pointArr = pts.map((p) => ({ x: toX(p.year), y: toY(p.asset), ...p }))

  // smooth bezier path
  const d = pointArr.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x},${pt.y}`
    const prev = pointArr[i - 1]!
    const cpx = (prev.x + pt.x) / 2
    return acc + ` C ${cpx},${prev.y} ${cpx},${pt.y} ${pt.x},${pt.y}`
  }, '')

  // fill path (close to bottom)
  const last = pointArr[pointArr.length - 1]!
  const first = pointArr[0]!
  const fillD = d + ` L ${last.x},${PAD.top + PH} L ${first.x},${PAD.top + PH} Z`

  // X축 레이블: 최대 5개
  const step = Math.max(1, Math.ceil(pts.length / 5))
  const xLabels = pts
    .filter((_, i) => i % step === 0 || i === pts.length - 1)
    .map((p) => ({ x: toX(p.year), label: String(p.year) }))

  // 현재 자산 포인트 & 목표 자산 포인트
  const startPt = pointArr[0]!
  const goalPt = targetAsset.value > 0
    ? pointArr.find((p) => p.asset >= targetAsset.value) ?? last
    : null

  return { d, fillD, pointArr, xLabels, startPt, goalPt, toX, toY }
})

const hasData = computed(() =>
  annualReturn.value !== null && monthlyInvestment.value > 0 && currentAsset.value >= 0,
)

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
      targetAsset.value = goalResult.data.target_asset ?? 0
      monthlyInvestment.value = goalResult.data.monthly_investment ?? 0
      annualReturn.value = goalResult.data.annual_return ?? null
    }
    currentAsset.value = summaryResult.data?.current_asset ?? 0
  } catch (e) {
    console.error(e)
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
    <div class="d-flex align-center ga-2 mb-5">
      <img src="/icons/icon-predict.png" class="header-icon" alt="예측" />
      <div>
        <div class="text-h6 font-weight-bold">미래 예측</div>
        <div class="text-body-2 text-medium-emphasis">FIRE 달성까지의 여정</div>
      </div>
    </div>

    <!-- 스켈레톤 -->
    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
    </template>

    <template v-else-if="!hasData">
      <!-- 설정 없음 -->
      <div class="glass-card py-12 text-center">
        <v-icon size="48" color="primary" style="opacity: 0.35" class="mb-4">mdi-chart-timeline-variant</v-icon>
        <div class="text-h6 font-weight-medium text-medium-emphasis">설정이 필요합니다</div>
        <div class="text-body-2 text-disabled mt-1 mb-6">
          목표 설정에서 월 투자금과 연평균 수익률을 입력해주세요
        </div>
        <v-btn color="primary" variant="tonal" rounded="lg" @click="router.push('/goalSettings')">
          목표 설정하기
        </v-btn>
      </div>
    </template>

    <template v-else>
      <!-- 소제목 -->
      <div v-if="remainingInfo" class="remain-badge mb-4">
        <span class="remain-text">{{ remainingInfo }}</span>
        <span class="remain-sub" v-if="annualReturn !== null">연 {{ annualReturn }}% 복리 기준</span>
      </div>

      <!-- 차트 카드 -->
      <div class="glass-card pa-4 mb-3">
        <div class="d-flex justify-space-between align-center mb-1">
          <div>
            <div class="chart-asset-label">현재 자산</div>
            <div class="chart-asset-value">{{ formatShortMoney(currentAsset) }}원</div>
          </div>
          <div class="text-right" v-if="targetAsset > 0">
            <div class="chart-asset-label">목표 자산</div>
            <div class="chart-asset-value" style="color: rgb(var(--v-theme-primary))">
              {{ formatShortMoney(targetAsset) }}원
            </div>
          </div>
        </div>

        <template v-if="chartPoints">
          <svg
            :viewBox="`0 0 ${VW} ${VH}`"
            width="100%"
            :height="VH"
            style="overflow: visible"
          >
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0.25" />
                <stop offset="100%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0" />
              </linearGradient>
            </defs>

            <!-- fill -->
            <path :d="chartPoints.fillD" fill="url(#chartFill)" />

            <!-- 목표선 (수평 점선) -->
            <line
              v-if="targetAsset > 0 && chartPoints.goalPt"
              :x1="PAD.left"
              :y1="chartPoints.goalPt.y"
              :x2="VW - PAD.right"
              :y2="chartPoints.goalPt.y"
              stroke="rgb(var(--v-theme-primary))"
              stroke-width="1"
              stroke-dasharray="4 3"
              opacity="0.4"
            />

            <!-- 선 -->
            <path
              :d="chartPoints.d"
              fill="none"
              stroke="rgb(var(--v-theme-primary))"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <!-- 시작점 -->
            <circle
              :cx="chartPoints.startPt.x"
              :cy="chartPoints.startPt.y"
              r="4"
              fill="rgb(var(--v-theme-surface))"
              stroke="rgb(var(--v-theme-primary))"
              stroke-width="2"
            />

            <!-- 목표 달성 포인트 -->
            <g v-if="chartPoints.goalPt && targetAsset > 0">
              <circle
                :cx="chartPoints.goalPt.x"
                :cy="chartPoints.goalPt.y"
                r="5"
                fill="rgb(var(--v-theme-primary))"
              />
              <!-- 깃발 -->
              <text
                :x="chartPoints.goalPt.x - 1"
                :y="chartPoints.goalPt.y - 10"
                text-anchor="middle"
                font-size="12"
              >🚩</text>
            </g>

            <!-- X축 레이블 -->
            <g v-for="lbl in chartPoints.xLabels" :key="lbl.label">
              <text
                :x="lbl.x"
                :y="VH - 4"
                text-anchor="middle"
                font-size="9"
                :fill="`rgba(var(--v-theme-on-surface), 0.4)`"
              >{{ lbl.label }}</text>
            </g>
          </svg>
        </template>
      </div>

      <!-- 예상 요약 스탯 -->
      <div class="stat-grid">
        <div class="stat-card text-center">
          <div class="stat-label">총 투자금 (예상)</div>
          <div class="stat-value">{{ formatShortMoney(currentAsset + totalInvested) }}원</div>
        </div>
        <div class="stat-card text-center">
          <div class="stat-label">총 수익 (예상)</div>
          <div class="stat-value" style="color: rgb(var(--v-theme-primary))">
            {{ formatShortMoney(Math.max(totalReturn, 0)) }}원
          </div>
        </div>
        <div class="stat-card text-center" style="grid-column: 1 / -1">
          <div class="stat-label">최종 자산 (예상)</div>
          <div class="stat-value-lg">{{ formatShortMoney(finalAsset) }}원</div>
        </div>
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.header-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  mix-blend-mode: multiply;
}

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}

.remain-badge {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.remain-text {
  font-size: 20px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
.remain-sub {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.chart-asset-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 2px;
}
.chart-asset-value {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.stat-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 16px;
  padding: 16px;
}
.stat-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 6px;
}
.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.stat-value-lg {
  font-size: 20px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
</style>
