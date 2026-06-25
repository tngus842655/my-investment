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
const PAD = { top: 16, right: 60, bottom: 32, left: 8 }
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

// ── 마일스톤 ─────────────────────────────────────
const formatMilestoneLabel = (v: number) => {
  if (v >= 100_000_000) return (v / 100_000_000) % 1 === 0
    ? `${v / 100_000_000}억`
    : `${(v / 100_000_000).toFixed(1)}억`
  return `${Math.round(v / 10_000)}만`
}

const chartMilestones = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  if (!T || !chartPoints.value) return []

  // 목표에 맞는 눈금 단위 결정
  let step: number
  if (T <= 50_000_000) step = 10_000_000
  else if (T <= 200_000_000) step = 50_000_000
  else if (T <= 500_000_000) step = 100_000_000
  else if (T <= 2_000_000_000) step = 500_000_000
  else step = 1_000_000_000

  const result: { value: number; label: string; isPassed: boolean; y: number }[] = []
  let v = step
  while (v < T) {
    result.push({
      value: v,
      label: formatMilestoneLabel(v),
      isPassed: C >= v,
      y: chartPoints.value!.toY(v),
    })
    v += step
  }
  return result
})

const nextMilestone = computed(() => {
  const C = currentAsset.value
  return chartMilestones.value.find((m) => !m.isPassed) ?? null
})

const hasData = computed(() =>
  annualReturn.value !== null && monthlyInvestment.value > 0 && currentAsset.value >= 0,
)

// ── 시나리오 비교 ─────────────────────────────────
interface Scenario { rate: number; label: string; months: number | null }

const scenarios = computed<Scenario[]>(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  const M = monthlyInvestment.value
  const base = annualReturn.value ?? 0
  if (!T || !M) return []

  return [-2, 0, 2].map((delta) => {
    const rate = base + delta
    const r = rate / 100 / 12
    let months: number | null = null
    if (C >= T) {
      months = 0
    } else if (r === 0) {
      months = M > 0 ? Math.ceil((T - C) / M) : null
    } else {
      const num = T * r + M
      const den = C * r + M
      if (den > 0 && num / den > 1) {
        months = Math.ceil(Math.log(num / den) / Math.log(1 + r))
      }
    }
    return { rate, label: `${rate}%`, months }
  })
})

const formatScenarioDate = (months: number | null) => {
  if (months === null) return '-'
  if (months === 0) return '달성!'
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  const y = Math.floor(months / 12)
  const m = months % 12
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')} (${y > 0 ? y + '년 ' : ''}${m > 0 ? m + '개월' : ''})`
}

// ── FIRE Tip ─────────────────────────────────────
const calcMonths = (T: number, C: number, M: number, annualRate: number): number | null => {
  if (C >= T) return 0
  const r = annualRate / 100 / 12
  if (r === 0) return M > 0 ? Math.ceil((T - C) / M) : null
  const num = T * r + M
  const den = C * r + M
  if (den <= 0 || num / den <= 1) return null
  return Math.ceil(Math.log(num / den) / Math.log(1 + r))
}

const fireTip = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  const M = monthlyInvestment.value
  const rate = annualReturn.value
  if (!T || !M || rate === null) return null

  const baseMo = calcMonths(T, C, M, rate)
  if (baseMo === null || baseMo === 0) return null

  // 팁 1: 월 투자금 50만원 증가
  const INVEST_BUMP = 500_000
  const investMo = calcMonths(T, C, M + INVEST_BUMP, rate)
  const investDiff = investMo !== null ? baseMo - investMo : null

  // 팁 2: 수익률 1% 증가
  const rateMo = calcMonths(T, C, M, rate + 1)
  const rateDiff = rateMo !== null ? baseMo - rateMo : null

  // 더 임팩트 큰 팁 선택
  if (investDiff !== null && (rateDiff === null || investDiff >= rateDiff)) {
    const y = Math.floor(investDiff / 12)
    const mo = investDiff % 12
    const diffStr = y > 0 ? `${y}년 ${mo > 0 ? mo + '개월' : ''}` : `${investDiff}개월`
    return {
      body: `월 투자금을 <strong>50만원</strong> 늘리면\n목표 달성이 약 <strong>${diffStr}</strong> 빨라집니다.`,
    }
  }
  if (rateDiff !== null && rateDiff > 0) {
    const y = Math.floor(rateDiff / 12)
    const mo = rateDiff % 12
    const diffStr = y > 0 ? `${y}년 ${mo > 0 ? mo + '개월' : ''}` : `${rateDiff}개월`
    return {
      body: `연평균 수익률이 <strong>1%</strong> 높아지면\n목표 달성이 약 <strong>${diffStr}</strong> 앞당겨집니다.`,
    }
  }
  return null
})

// ── 연도별 추이 테이블 ─────────────────────────────
const yearlyRows = computed(() => {
  const T = targetAsset.value
  return projection.value.map((p) => ({
    year: p.year,
    asset: p.asset,
    rate: T > 0 ? Math.min(Math.round((p.asset / T) * 100), 100) : null,
  }))
})

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

            <!-- 마일스톤 수평선 + 라벨 -->
            <g v-for="m in chartMilestones" :key="m.value">
              <line
                :x1="PAD.left"
                :y1="m.y"
                :x2="VW - PAD.right + 2"
                :y2="m.y"
                :stroke="m.isPassed ? 'rgba(var(--v-theme-primary), 0.25)' : 'rgba(var(--v-theme-on-surface), 0.1)'"
                stroke-width="1"
                stroke-dasharray="3 3"
              />
              <text
                :x="VW - PAD.right + 6"
                :y="m.y + 4"
                font-size="9"
                font-weight="600"
                :fill="m.isPassed ? 'rgba(var(--v-theme-primary), 0.7)' : 'rgba(var(--v-theme-on-surface), 0.35)'"
              >{{ m.isPassed ? '✓' : '💰' }} {{ m.label }}</text>
            </g>

            <!-- 목표선 -->
            <g v-if="targetAsset > 0 && chartPoints.goalPt">
              <line
                :x1="PAD.left"
                :y1="chartPoints.goalPt.y"
                :x2="VW - PAD.right + 2"
                :y2="chartPoints.goalPt.y"
                stroke="rgb(var(--v-theme-primary))"
                stroke-width="1"
                stroke-dasharray="4 3"
                opacity="0.5"
              />
              <text
                :x="VW - PAD.right + 6"
                :y="chartPoints.goalPt.y + 4"
                font-size="9"
                font-weight="700"
                fill="rgb(var(--v-theme-primary))"
              >🏁 {{ formatMilestoneLabel(targetAsset) }}</text>
            </g>

            <!-- fill -->
            <path :d="chartPoints.fillD" fill="url(#chartFill)" />

            <!-- 선 -->
            <path
              :d="chartPoints.d"
              fill="none"
              stroke="rgb(var(--v-theme-primary))"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <!-- 현재 자산 시작점 -->
            <circle
              :cx="chartPoints.startPt.x"
              :cy="chartPoints.startPt.y"
              r="5"
              fill="rgb(var(--v-theme-surface))"
              stroke="rgb(var(--v-theme-primary))"
              stroke-width="2.5"
            />
            <text
              :x="chartPoints.startPt.x + 8"
              :y="chartPoints.startPt.y + 4"
              font-size="8"
              font-weight="600"
              fill="rgba(var(--v-theme-on-surface), 0.55)"
            >● 현재</text>

            <!-- 목표 달성 포인트 -->
            <g v-if="chartPoints.goalPt && targetAsset > 0">
              <circle
                :cx="chartPoints.goalPt.x"
                :cy="chartPoints.goalPt.y"
                r="5"
                fill="rgb(var(--v-theme-primary))"
              />
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

          <!-- 다음 마일스톤 -->
          <div v-if="nextMilestone" class="next-milestone-bar mt-3">
            <v-icon size="14" color="primary">mdi-flag-outline</v-icon>
            <span>다음 목표 <strong>{{ nextMilestone.label }}</strong>까지
              <strong>{{ formatShortMoney(nextMilestone.value - currentAsset) }}원</strong> 남았습니다</span>
          </div>
        </template>
      </div>

      <!-- 예상 요약 스탯 -->
      <div class="stat-grid mb-3">
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

      <!-- 수익률 시나리오 비교 -->
      <div v-if="scenarios.length" class="glass-card pa-4 mb-3">
        <div class="section-title mb-3">수익률 시나리오 비교</div>
        <div class="scenario-grid">
          <div
            v-for="(s, i) in scenarios"
            :key="s.rate"
            class="scenario-col"
            :class="i === 0 ? 'scenario-low' : i === 2 ? 'scenario-high' : 'scenario-mid'"
          >
            <div class="scenario-emoji">{{ i === 0 ? '🐢' : i === 2 ? '🚀' : '📍' }}</div>
            <div class="scenario-name" :class="i === 0 ? 'name-low' : i === 2 ? 'name-high' : 'name-mid'">
              {{ i === 0 ? '보수적' : i === 2 ? '낙관적' : '현재 계획' }}
            </div>
            <div class="scenario-rate-label">연 {{ s.rate }}%</div>
            <div class="scenario-divider" />
            <div class="scenario-date">{{ formatScenarioDate(s.months) }}</div>
          </div>
        </div>
      </div>

      <!-- FIRE Tip -->
      <div v-if="fireTip" class="tip-card mb-3">
        <div class="tip-header">
          <span class="tip-emoji">💡</span>
          <span class="tip-title">FIRE Tip</span>
        </div>
        <div class="tip-body" v-html="fireTip.body.replace('\n', '<br>')" />
      </div>

      <!-- 연도별 자산 추이 -->
      <div class="glass-card pa-4">
        <div class="section-title mb-3">연도별 자산 추이</div>
        <div class="yearly-table">
          <div class="yearly-header">
            <span>연도</span>
            <span>예상 자산</span>
            <span v-if="targetAsset > 0">달성률</span>
          </div>
          <div
            v-for="row in yearlyRows"
            :key="row.year"
            class="yearly-row"
            :class="{ 'yearly-goal': row.rate !== null && row.rate >= 100 }"
          >
            <span class="yearly-year">{{ row.year }}</span>
            <span class="yearly-asset">{{ formatShortMoney(row.asset) }}원</span>
            <span v-if="targetAsset > 0" class="yearly-rate" :class="row.rate !== null && row.rate >= 100 ? 'text-primary' : ''">
              {{ row.rate !== null ? row.rate + '%' : '-' }}
            </span>
          </div>
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

.tip-card {
  border-radius: 16px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.08) 0%, rgba(var(--v-theme-primary), 0.04) 100%);
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
}
.tip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.tip-emoji { font-size: 16px; }
.tip-title {
  font-size: 12px;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  letter-spacing: 0.03em;
}
.tip-body {
  font-size: 13px;
  line-height: 1.7;
  color: rgba(var(--v-theme-on-surface), 0.75);
}
.tip-body :deep(strong) {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 700;
}

.next-milestone-bar {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  background: rgba(var(--v-theme-primary), 0.06);
  border-radius: 10px;
  padding: 8px 12px;
}
.next-milestone-bar strong {
  color: rgb(var(--v-theme-on-surface));
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.45);
  text-transform: uppercase;
}

/* 시나리오 비교 */
.scenario-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}
.scenario-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 6px 12px;
  border-radius: 16px;
}
.scenario-low {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}
.scenario-mid {
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
}
.scenario-high {
  background: rgba(76, 175, 80, 0.07);
  border: 1px solid rgba(76, 175, 80, 0.2);
}
.scenario-emoji {
  font-size: 22px;
  line-height: 1;
  margin-bottom: 2px;
}
.scenario-name {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.name-low  { color: rgba(var(--v-theme-on-surface), 0.5); }
.name-mid  { color: rgb(var(--v-theme-primary)); }
.name-high { color: #4caf50; }
.scenario-rate-label {
  font-size: 13px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
.scenario-divider {
  width: 24px;
  height: 1px;
  background: rgba(var(--v-theme-on-surface), 0.1);
  margin: 4px 0;
}
.scenario-date {
  font-size: 10px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.5);
  text-align: center;
  line-height: 1.5;
}

/* 연도별 추이 테이블 */
.yearly-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.yearly-header {
  display: grid;
  grid-template-columns: 56px 1fr 56px;
  padding: 0 4px 6px;
  font-size: 10px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.35);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.yearly-row {
  display: grid;
  grid-template-columns: 56px 1fr 56px;
  padding: 8px 4px;
  border-radius: 8px;
  align-items: center;
  transition: background 0.15s;
}
.yearly-row:active { background: rgba(var(--v-theme-on-surface), 0.04); }
.yearly-goal { background: rgba(var(--v-theme-primary), 0.06); }
.yearly-year {
  font-size: 13px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.yearly-asset {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.yearly-rate {
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.45);
  text-align: right;
}
</style>
