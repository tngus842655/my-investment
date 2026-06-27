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
  return C * Math.pow(1 + r, n) + (M * (Math.pow(1 + r, n) - 1)) / r
}

const DAYS_PER_MONTH = 30.4375

interface ProjectionPoint {
  dayOffset: number
  year: number
  month: number
  asset: number
}

const projection = computed<ProjectionPoint[]>(() => {
  const C = currentAsset.value
  const M = monthlyInvestment.value
  const T = targetAsset.value
  if (!C && !M) return []

  const r = (annualReturn.value ?? 0) / 100 / 12
  const now = new Date()

  // 목표 달성까지 최대 몇 개월인지 계산
  let maxMonths = 360
  if (T > 0 && M > 0) {
    if (r === 0) {
      maxMonths = Math.min(Math.ceil((T - C) / M) + 1, 360)
    } else {
      const num = T * r + M
      const den = C * r + M
      if (den > 0 && num / den > 1) {
        maxMonths = Math.min(Math.ceil(Math.log(num / den) / Math.log(1 + r)) + 1, 360)
      }
    }
  }

  const maxDays = maxMonths * DAYS_PER_MONTH
  const points: ProjectionPoint[] = []
  for (let day = 0; day <= maxDays; day++) {
    const monthN = day / DAYS_PER_MONTH
    const asset = calcAsset(C, M, r, monthN)
    const d = new Date(now)
    d.setDate(d.getDate() + day)
    points.push({ dayOffset: day, year: d.getFullYear(), month: d.getMonth() + 1, asset: Math.round(asset) })
    if (T > 0 && asset >= T && day > 0) break
  }
  return points
})

const totalInvested = computed(() => {
  const last = projection.value[projection.value.length - 1]
  if (!last) return 0
  return Math.round(monthlyInvestment.value * (last.dayOffset / DAYS_PER_MONTH))
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
  const rate = annualReturn.value
  if (!T || !M || rate === null || C >= T) return null

  const months = calcMonths(T, C, M, rate)
  if (months === null || months <= 0) return null
  const years = Math.floor(months / 12)
  const rem = months % 12
  return years > 0 ? `약 ${years}년 ${rem > 0 ? rem + '개월' : ''} 남았습니다` : `약 ${months}개월 남았습니다`
})

// ── SVG 차트 ─────────────────────────────────────
const VW = 300
const VH = 180
const PAD = { top: 16, right: 60, bottom: 32, left: 8 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

const chartPoints = computed(() => {
  const futurePts = projection.value
  if (futurePts.length < 1) return null

  // 과거 히스토리: 일 단위 원시 데이터 사용
  const nowDate = new Date()
  const todayStr = nowDate.toISOString().slice(0, 10)
  const histPts = assetHistory.value
    .filter((h) => h.recorded_at < todayStr)
    .map((h) => {
      const d = new Date(h.recorded_at)
      const diffDays = Math.round((d.getTime() - nowDate.getTime()) / 86400000)
      return { dayOffset: diffDays, year: d.getFullYear(), month: d.getMonth() + 1, asset: h.current_asset, isPast: true }
    })

  const futureMapped = futurePts.map((p) => ({ ...p, isPast: false }))
  const allPts = [...histPts, ...futureMapped]
  if (allPts.length < 2) return null

  const minY = Math.max(Math.min(...allPts.map((p) => p.asset)) * 0.85, 1)
  const maxY = allPts[allPts.length - 1]!.asset * 1.05
  const minX = allPts[0]!.dayOffset
  const maxX = allPts[allPts.length - 1]!.dayOffset

  const toX = (day: number) => PAD.left + ((day - minX) / Math.max(maxX - minX, 1)) * PW
  // 로그 스케일 Y축: 과거(소액)와 미래(대액) 성장을 비례적으로 표현
  const logMin = Math.log(minY)
  const logMax = Math.log(maxY)
  const toY = (asset: number) => PAD.top + PH - ((Math.log(Math.max(asset, 1)) - logMin) / Math.max(logMax - logMin, 1)) * PH

  const pointArr = allPts.map((p) => ({ x: toX(p.dayOffset), y: toY(p.asset), ...p }))

  // 과거선 (실선)
  const histArr = pointArr.filter((p) => p.isPast)
  const futureArr = pointArr.filter((p) => !p.isPast)

  const buildPath = (pts: typeof pointArr) =>
    pts.reduce((acc, pt, i) => {
      if (i === 0) return `M ${pt.x},${pt.y}`
      const prev = pts[i - 1]!
      const cpx = (prev.x + pt.x) / 2
      return acc + ` C ${cpx},${prev.y} ${cpx},${pt.y} ${pt.x},${pt.y}`
    }, '')

  // 히스토리와 예측선을 이어서 전체 fill 경로 생성
  const fullPath = buildPath(pointArr)
  const histPath = histArr.length >= 2 ? buildPath(histArr) : null
  // 마지막 과거 포인트를 예측 점선 시작점으로 포함해 끊김 방지
  const lastHistPt = histArr.length > 0 ? histArr[histArr.length - 1]! : null
  const futurePath = futureArr.length >= 1 ? buildPath(lastHistPt ? [lastHistPt, ...futureArr] : futureArr) : null

  const last = pointArr[pointArr.length - 1]!
  const first = pointArr[0]!
  const fillD = fullPath + ` L ${last.x},${PAD.top + PH} L ${first.x},${PAD.top + PH} Z`

  // X축 레이블: 연도 경계(1월 1일)마다, 최대 5개
  const yearBoundaries = allPts.filter((p, i) => i === 0 || (p.month === 1 && p.year !== allPts[i - 1]!.year))
  const step = Math.max(1, Math.ceil(yearBoundaries.length / 5))
  const xLabels = yearBoundaries
    .filter((_, i) => i % step === 0)
    .map((p) => ({ x: toX(p.dayOffset), label: String(p.year) }))

  // 현재 포인트 & 목표 달성 포인트
  const startPt = pointArr.find((p) => !p.isPast) ?? pointArr[0]!
  const goalPt = targetAsset.value > 0 ? (pointArr.find((p) => p.asset >= targetAsset.value) ?? last) : null

  return { fullPath, histPath, futurePath, fillD, pointArr, xLabels, startPt, goalPt, toX, toY }
})

// ── 마일스톤 ─────────────────────────────────────
const formatMilestoneLabel = (v: number) => {
  if (v >= 100_000_000) return (v / 100_000_000) % 1 === 0 ? `${v / 100_000_000}억` : `${(v / 100_000_000).toFixed(1)}억`
  return `${Math.round(v / 10_000)}만`
}

const chartMilestones = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  if (!T || !chartPoints.value) return []

  // 목표 금액에 따라 step 동적 설정, 최대 4개 마일스톤
  const step =
    T <= 500_000_000 ? 100_000_000       // 5억 이하: 1억 단위
    : T <= 2_000_000_000 ? 500_000_000   // 20억 이하: 5억 단위
    : T <= 10_000_000_000 ? 1_000_000_000 // 100억 이하: 10억 단위
    : 5_000_000_000                       // 그 이상: 50억 단위

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
  // 최대 4개만 표시 (너무 많으면 간격 조정)
  if (result.length > 4) {
    const keep = Math.ceil(result.length / 4)
    return result.filter((_, i) => (i + 1) % keep === 0 || i === result.length - 1)
  }
  return result
})

const nextMilestone = computed(() => {
  return chartMilestones.value.find((m) => !m.isPassed) ?? null
})

const hasData = computed(() => annualReturn.value !== null && monthlyInvestment.value > 0 && currentAsset.value >= 0)

// ── 시나리오 비교 ─────────────────────────────────
interface Scenario {
  rate: number
  label: string
  months: number | null
}

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
const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1 // 1~12
const showAllYears = ref(false)

const yearlyRows = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  const M = monthlyInvestment.value
  const r = (annualReturn.value ?? 0) / 100 / 12
  const goalYear = fireGoalYear.value?.year ?? currentYear + 30

  const currentFireRate = T > 0 ? Math.min(Math.round((C / T) * 100), 100) : null
  const rows = []
  for (let year = currentYear; year <= goalYear; year++) {
    const status = year < currentYear ? 'past' : year === currentYear ? 'current' : 'future'
    const monthsToYearEnd = (year - currentYear) * 12 + (12 - currentMonth)
    const yearEndAsset = monthsToYearEnd > 0 ? Math.round(calcAsset(C, M, r, monthsToYearEnd)) : C
    const annualRate = status === 'current' && yearEndAsset > 0
      ? Math.min(Math.round((C / yearEndAsset) * 100), 100)
      : status === 'past' ? 100 : 0
    rows.push({ year, asset: yearEndAsset, status, annualRate, fireRate: currentFireRate })
  }
  return rows
})

// 목표 달성 연월 + 근접 자산 (월 단위 탐색)
const fireGoalYear = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  const M = monthlyInvestment.value
  const rate = annualReturn.value
  if (!T || !M || rate === null) return null

  const r = rate / 100 / 12
  const totalMonths = calcMonths(T, C, M, rate)
  if (totalMonths === null) return null

  // 목표 달성 달의 자산 계산
  const reachedAsset = Math.round(calcAsset(C, M, r, totalMonths))

  // 달성 연월 계산
  const now = new Date()
  const reachedDate = new Date(now.getFullYear(), now.getMonth() + totalMonths)
  const reachedYear = reachedDate.getFullYear()
  const reachedMonth = reachedDate.getMonth() + 1

  let remainText: string | null = null
  if (C < T && totalMonths > 0) {
    const y = Math.floor(totalMonths / 12)
    const mo = totalMonths % 12
    remainText = y > 0 ? `목표까지 약 ${y}년${mo > 0 ? ' ' + mo + '개월' : ''}` : `목표까지 약 ${totalMonths}개월`
  }

  return { year: reachedYear, month: reachedMonth, asset: reachedAsset, remainText }
})

// 표시할 행 목록 (fireGoalYear 제외)
const displayRows = computed(() => (fireGoalYear.value ? yearlyRows.value.filter((r) => r.year < fireGoalYear.value!.year) : yearlyRows.value))

// 더보기 전 요약: 과거 최대 2개 + 현재 + 미래 최대 2개
const summaryRows = computed(() => {
  const rows = displayRows.value
  if (rows.length <= 5) return rows
  const currentIdx = rows.findIndex((r) => r.year === currentYear)
  if (currentIdx === -1) return rows.slice(0, 5)
  const past = rows.slice(0, currentIdx).slice(-2)
  const current = rows[currentIdx]!
  const future = rows.slice(currentIdx + 1, currentIdx + 3)
  return [...past, current, ...future]
})

const visibleRows = computed(() => (showAllYears.value ? displayRows.value : summaryRows.value))

interface HistoryPoint {
  recorded_at: string
  current_asset: number
}
const assetHistory = ref<HistoryPoint[]>([])

const loadData = async () => {
  loading.value = true
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const [goalResult, summaryResult, historyResult] = await Promise.all([
      supabase.from('investment_goals').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('asset_summary').select('current_asset').eq('user_id', user.id).maybeSingle(),
      supabase.from('asset_history').select('recorded_at, current_asset').eq('user_id', user.id).order('recorded_at', { ascending: true }),
    ])
    if (goalResult.data) {
      targetAsset.value = goalResult.data.target_asset ?? 0
      monthlyInvestment.value = goalResult.data.monthly_investment ?? 0
      annualReturn.value = goalResult.data.annual_return ?? null
    }
    currentAsset.value = summaryResult.data?.current_asset ?? 0
    assetHistory.value = historyResult.data ?? []
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
        <div class="text-body-2 text-disabled mt-1 mb-6">목표 설정에서 월 투자금과 연평균 수익률을 입력해주세요</div>
        <v-btn color="primary" variant="tonal" rounded="lg" @click="router.push('/goalSettings')"> 목표 설정하기 </v-btn>
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
            <div class="chart-asset-value" style="color: rgb(var(--v-theme-primary))">{{ formatShortMoney(targetAsset) }}원</div>
          </div>
        </div>

        <template v-if="chartPoints">
          <svg :viewBox="`0 0 ${VW} ${VH}`" width="100%" :height="VH" style="overflow: visible">
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0.25" />
                <stop offset="100%" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0" />
              </linearGradient>
            </defs>

            <!-- 마일스톤 수평선 + 라벨 -->
            <g v-for="m in chartMilestones" :key="m.value">
              <line :x1="PAD.left" :y1="m.y" :x2="VW - PAD.right + 2" :y2="m.y" :stroke="m.isPassed ? 'rgba(var(--v-theme-primary), 0.25)' : 'rgba(var(--v-theme-on-surface), 0.1)'" stroke-width="1" stroke-dasharray="3 3" />
              <text :x="VW - PAD.right + 6" :y="m.y + 4" font-size="9" font-weight="600" :fill="m.isPassed ? 'rgba(var(--v-theme-primary), 0.7)' : 'rgba(var(--v-theme-on-surface), 0.35)'">{{ m.isPassed ? '✓' : '💰' }} {{ m.label }}</text>
            </g>

            <!-- 목표선 -->
            <g v-if="targetAsset > 0 && chartPoints.goalPt">
              <line :x1="PAD.left" :y1="chartPoints.goalPt.y" :x2="VW - PAD.right + 2" :y2="chartPoints.goalPt.y" stroke="rgb(var(--v-theme-primary))" stroke-width="1" stroke-dasharray="4 3" opacity="0.5" />
              <text :x="VW - PAD.right + 6" :y="chartPoints.goalPt.y + 4" font-size="9" font-weight="700" fill="rgb(var(--v-theme-primary))">🏁 {{ formatMilestoneLabel(targetAsset) }}</text>
            </g>

            <!-- fill -->
            <path :d="chartPoints.fillD" fill="url(#chartFill)" />

            <!-- 과거 실선 -->
            <path v-if="chartPoints.histPath" :d="chartPoints.histPath" fill="none" stroke="rgb(var(--v-theme-primary))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

            <!-- 예측 점선 -->
            <path v-if="chartPoints.futurePath" :d="chartPoints.futurePath" fill="none" stroke="rgb(var(--v-theme-primary))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5,4" opacity="0.7" />

            <!-- 현재 자산 시작점 -->
            <circle :cx="chartPoints.startPt.x" :cy="chartPoints.startPt.y" r="5" fill="rgb(var(--v-theme-surface))" stroke="rgb(var(--v-theme-primary))" stroke-width="2.5" />
            <text :x="chartPoints.startPt.x + 8" :y="chartPoints.startPt.y + 4" font-size="8" font-weight="600" fill="rgba(var(--v-theme-on-surface), 0.55)">● 현재</text>

            <!-- 목표 달성 포인트 -->
            <g v-if="chartPoints.goalPt && targetAsset > 0">
              <circle :cx="chartPoints.goalPt.x" :cy="chartPoints.goalPt.y" r="5" fill="rgb(var(--v-theme-primary))" />
            </g>

            <!-- X축 레이블 -->
            <g v-for="lbl in chartPoints.xLabels" :key="lbl.label">
              <text :x="lbl.x" :y="VH - 4" text-anchor="middle" font-size="9" :fill="`rgba(var(--v-theme-on-surface), 0.4)`">{{ lbl.label }}</text>
            </g>
          </svg>

          <!-- 다음 마일스톤 -->
          <div v-if="nextMilestone" class="next-milestone-bar mt-3">
            <v-icon size="14" color="primary">mdi-flag-outline</v-icon>
            <span
              >다음 목표 <strong>{{ nextMilestone.label }}</strong
              >까지 <strong>{{ formatShortMoney(nextMilestone.value - currentAsset) }}원</strong> 남았습니다</span
            >
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
          <div class="stat-value" style="color: rgb(var(--v-theme-primary))">{{ formatShortMoney(Math.max(totalReturn, 0)) }}원</div>
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
          <div v-for="(s, i) in scenarios" :key="s.rate" class="scenario-col" :class="i === 0 ? 'scenario-low' : i === 2 ? 'scenario-high' : 'scenario-mid'">
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
        <div class="tip-body" v-html="fireTip.body"></div>
      </div>

      <!-- 연도별 예상자산 추이 -->
      <div class="glass-card pa-4">
        <div class="section-title mb-3">연도별 예상자산 추이</div>
        <div class="yearly-table">
          <div v-for="row in visibleRows" :key="row.year" class="yearly-row" :class="`yearly-row--${row.status}`">
            <!-- 연도 + 아이콘 -->
            <div class="yearly-year-wrap">
              <span v-if="row.status === 'past'" class="yearly-status-icon yearly-done">✓</span>
              <span v-else-if="row.status === 'current'" class="yearly-status-icon yearly-active">▼</span>
              <span v-else class="yearly-status-icon yearly-pending">○</span>
              <span class="yearly-year">{{ row.year }}</span>
            </div>

            <!-- 게이지 영역 -->
            <div class="yearly-gauge-wrap">
              <!-- 현재 연도: 올해 달성률 + FIRE 진행률 -->
              <template v-if="row.status === 'current'">
                <div class="yearly-bar-row">
                  <div class="yearly-bar-bg yearly-bar-bg--active">
                    <div class="yearly-bar-fill" :style="{ width: row.annualRate + '%' }"></div>
                  </div>
                  <span class="yearly-rate yearly-rate--active">{{ row.annualRate }}%</span>
                </div>
                <div class="yearly-sublabels">
                  <span class="yearly-sublabel">올해 목표 {{ row.annualRate }}%</span>
                  <span v-if="row.fireRate !== null" class="yearly-fire-rate"> 전체 FIRE {{ row.fireRate }}% </span>
                </div>
              </template>

              <!-- 과거: 100% 완료 -->
              <template v-else-if="row.status === 'past'">
                <div class="yearly-bar-row">
                  <div class="yearly-bar-bg yearly-bar-bg--done">
                    <div class="yearly-bar-fill yearly-bar-fill--done" style="width: 100%"></div>
                  </div>
                  <span class="yearly-rate yearly-rate--done">완료</span>
                </div>
                <div class="yearly-asset yearly-asset--past">{{ formatShortMoney(row.asset) }}원</div>
              </template>

              <!-- 미래: 빈 바 -->
              <template v-else>
                <div class="yearly-bar-row">
                  <div class="yearly-bar-bg yearly-bar-bg--future">
                    <div class="yearly-bar-fill" style="width: 0%"></div>
                  </div>
                  <span class="yearly-rate yearly-rate--future">-</span>
                </div>
                <div class="yearly-asset yearly-asset--future">{{ formatShortMoney(row.asset) }}원 예정</div>
              </template>
            </div>
          </div>
        </div>

        <!-- 더보기 / 접기 -->
        <div v-if="displayRows.length > summaryRows.length || showAllYears" class="yearly-toggle" @click="showAllYears = !showAllYears">
          {{ showAllYears ? '접기 ▲' : `전체 보기 (${displayRows.length}개) ▼` }}
        </div>

        <!-- FIRE 달성 카드 -->
        <div v-if="fireGoalYear" class="fire-goal-card mt-3">
          <div class="fire-goal-title">🏆 FIRE 목표 달성</div>
          <div class="fire-goal-asset-label">예상 자산</div>
          <div class="fire-goal-asset">{{ formatShortMoney(fireGoalYear.asset) }}원</div>
          <div class="fire-goal-meta">
            <span class="fire-goal-year">{{ fireGoalYear.year }}년 {{ fireGoalYear.month }}월 예상</span>
            <span v-if="fireGoalYear.remainText" class="fire-goal-remain"> · {{ fireGoalYear.remainText }}</span>
          </div>
          <div class="fire-goal-bar-bg">
            <div class="fire-goal-bar-fill"></div>
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
.tip-emoji {
  font-size: 16px;
}
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
  white-space: pre-line;
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
  background: rgba(var(--v-theme-success), 0.07);
  border: 1px solid rgba(var(--v-theme-success), 0.2);
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
.name-low {
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.name-mid {
  color: rgb(var(--v-theme-primary));
}
.name-high {
  color: var(--fp-success);
}
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
  gap: 4px;
}
.yearly-row {
  display: grid;
  grid-template-columns: 68px 1fr;
  gap: 8px;
  padding: 8px 4px;
  border-radius: 10px;
  transition: background 0.15s;
}
.yearly-row--current {
  background: rgba(var(--v-theme-primary), 0.05);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
  padding: 10px 8px;
}
.yearly-row--past {
  opacity: 0.75;
}
.yearly-row--future {
  opacity: 0.65;
}

.yearly-year-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-top: 1px;
}
.yearly-status-icon {
  font-size: 11px;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}
.yearly-done {
  color: rgba(var(--v-theme-on-surface), 0.35);
}
.yearly-active {
  color: rgb(var(--v-theme-primary));
  font-size: 9px;
}
.yearly-pending {
  color: rgba(var(--v-theme-on-surface), 0.25);
  font-size: 13px;
}

.yearly-year {
  font-size: 13px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.yearly-row--current .yearly-year {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 700;
}

.yearly-gauge-wrap {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.yearly-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.yearly-bar-bg {
  flex: 1;
  height: 6px;
  border-radius: 99px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
}
.yearly-bar-bg--active {
  height: 8px;
  background: rgba(var(--v-theme-primary), 0.12);
}
.yearly-bar-bg--done {
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.yearly-bar-bg--future {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.yearly-bar-fill {
  height: 100%;
  border-radius: 99px;
  background: rgba(var(--v-theme-primary), 0.5);
  transition: width 0.5s ease;
}
.yearly-bar-fill--done {
  background: rgba(var(--v-theme-on-surface), 0.2);
}

.yearly-rate {
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  min-width: 32px;
  text-align: right;
}
.yearly-rate--active {
  color: rgb(var(--v-theme-primary));
  font-size: 13px;
}
.yearly-rate--done {
  color: rgba(var(--v-theme-on-surface), 0.3);
  font-size: 10px;
}
.yearly-rate--future {
  color: rgba(var(--v-theme-on-surface), 0.2);
}

.yearly-sublabels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}
.yearly-sublabel {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.yearly-fire-rate {
  font-size: 10px;
  font-weight: 600;
  color: rgba(var(--v-theme-primary), 0.7);
}

.yearly-asset {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.35);
}
.yearly-asset--past {
  color: rgba(var(--v-theme-on-surface), 0.3);
}
.yearly-asset--future {
  color: rgba(var(--v-theme-on-surface), 0.2);
  font-style: italic;
}

.yearly-toggle {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.4);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: background 0.15s;
}
.yearly-toggle:active {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

/* FIRE 달성 카드 */
.fire-goal-card {
  border-radius: 16px;
  padding: 16px 18px 0;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.15) 0%, rgba(var(--v-theme-primary), 0.06) 100%);
  border: 1.5px solid rgba(var(--v-theme-primary), 0.3);
  overflow: hidden;
}
.fire-goal-title {
  font-size: 11px;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.fire-goal-asset-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-bottom: 2px;
}
.fire-goal-asset {
  font-size: 28px;
  font-weight: 800;
  color: rgb(var(--v-theme-primary));
  letter-spacing: -0.5px;
  line-height: 1.1;
  margin-top: -4px;
  margin-bottom: 8px;
}
.fire-goal-meta {
  margin-bottom: 14px;
  font-size: 12px;
  line-height: 1.4;
}
.fire-goal-year {
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.fire-goal-remain {
  color: rgba(var(--v-theme-on-surface), 0.3);
}
.fire-goal-bar-bg {
  height: 2px;
  background: rgba(var(--v-theme-primary), 0.1);
  margin: 0 -18px;
}
.fire-goal-bar-fill {
  height: 100%;
  width: 100%;
  background: rgb(var(--v-theme-primary));
  opacity: 0.3;
}
</style>
