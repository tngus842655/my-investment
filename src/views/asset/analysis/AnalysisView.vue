<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { showMessage } from '@/composables/useSnackbar'
import { useUserDataStore } from '@/stores/userData'
import { useRegisterPullToRefresh, clearPullToRefresh } from '@/composables/usePullToRefresh'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { useI18n } from 'vue-i18n'
import { formatYearMonth, formatDuration } from '@/utils/dateFormat'

const router = useRouter()
const { t } = useI18n()
const userDataStore = useUserDataStore()
const loading = ref(true)
const exchangeRate = ref(1350)
const { money } = useBaseCurrency()
const formatMoney = (v: number) => money(v, exchangeRate.value, 'short')

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

  // 목표 달성까지 개월 수 계산 (상한 없음)
  let maxMonths = 600
  if (T > 0 && M > 0) {
    if (r === 0) {
      maxMonths = Math.ceil((T - C) / M) + 1
    } else {
      const num = T * r + M
      const den = C * r + M
      if (den > 0 && num / den > 1) {
        maxMonths = Math.ceil(Math.log(num / den) / Math.log(1 + r)) + 1
      }
    }
  }

  // 기간에 따라 샘플링 간격 조정 (포인트 수 균일화)
  const stepDays = maxMonths > 240 ? DAYS_PER_MONTH : maxMonths > 60 ? 7 : 1

  const maxDays = maxMonths * DAYS_PER_MONTH
  const points: ProjectionPoint[] = []
  for (let day = 0; day <= maxDays; day += stepDays) {
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
  const months = fireGoalYear.value?.totalMonths ?? (last ? last.dayOffset / DAYS_PER_MONTH : 0)
  return Math.round(monthlyInvestment.value * months)
})

const totalReturn = computed(() => {
  return finalAsset.value - currentAsset.value - totalInvested.value
})

const finalAsset = computed(() => fireGoalYear.value?.asset ?? projection.value[projection.value.length - 1]?.asset ?? 0)

const hasData = computed(() => annualReturn.value !== null && monthlyInvestment.value > 0 && currentAsset.value >= 0)

// ── Progress Timeline ─────────────────────────────
const progressPct = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  if (!T) return 0
  return Math.min(Math.round((C / T) * 100), 100)
})

// 타임라인 마일스톤: 과거 역산 + 현재 + 미래 예측
const timelineMilestones = computed(() => {
  const goal = fireGoalYear.value
  const T = targetAsset.value
  if (!goal || !T) return []

  const C = currentAsset.value
  const M = monthlyInvestment.value
  const r = (annualReturn.value ?? 0) / 100 / 12

  const milestones: { year: number; month?: number; pct: number; isGoal: boolean; isPast: boolean }[] = []

  const totalYears = goal.year - currentYear
  const step = totalYears <= 5 ? 1 : totalYears <= 15 ? 3 : totalYears <= 30 ? 5 : totalYears <= 60 ? 10 : 20
  const MIN_GAP = 8

  const nowPct = Math.min(progressPct.value, 100 - MIN_GAP)

  // 과거 연도 역산 (현재 자산 기준으로 n개월 전 자산 추정)
  const pastMilestones: typeof milestones = []
  let firstPct = nowPct
  for (let y = currentYear - step; y >= currentYear - 100; y -= step) {
    const monthsAgo = (currentYear - y) * 12 + (currentMonth - 1)
    const pastAsset = r === 0
      ? C - M * monthsAgo
      : (C - (M * (Math.pow(1 + r, monthsAgo) - 1)) / r) / Math.pow(1 + r, monthsAgo)
    if (pastAsset <= 0) break
    const pct = Math.max(Math.round((pastAsset / T) * 100), 0)
    if (firstPct - pct >= MIN_GAP) {
      pastMilestones.unshift({ year: y, pct, isGoal: false, isPast: true })
    }
    firstPct = pct
    if (pct < MIN_GAP) break
  }

  milestones.push(...pastMilestones)
  milestones.push({ year: currentYear, month: currentMonth, pct: nowPct, isGoal: false, isPast: false })
  let lastPct = nowPct

  for (let y = currentYear + step; y < goal.year; y += step) {
    const monthsToYearEnd = (y - currentYear) * 12 - (currentMonth - 1)
    const yearEndAsset = Math.round(calcAsset(C, M, r, monthsToYearEnd))
    const pct = Math.min(Math.round((yearEndAsset / T) * 100), 100)
    if (pct - lastPct < MIN_GAP) continue
    milestones.push({ year: y, pct, isGoal: false, isPast: false })
    lastPct = pct
  }

  milestones.push({ year: goal.year, month: goal.month, pct: 100, isGoal: true, isPast: false })

  return milestones
})

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
  if (months === 0) return t('analysis.reached')
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return formatYearMonth(d.getFullYear(), d.getMonth() + 1)
}

const formatScenarioDiff = (months: number | null, baseMonths: number | null, isOptimistic: boolean) => {
  if (months === null || baseMonths === null) return '-'
  if (months === 0) return t('analysis.reached')
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  const dateStr = formatYearMonth(d.getFullYear(), d.getMonth() + 1)
  const diff = Math.abs(baseMonths - months)
  // 세 번째 인자는 vue-i18n 복수형 선택용 카운트 (en은 1개월/N개월 구분, ko는 단일형)
  return t(isOptimistic ? 'analysis.diffShorter' : 'analysis.diffLonger', { n: diff, date: dateStr }, diff)
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

  // 팁 1: 월 투자금 10% 증가 (만원 단위 반올림)
  const INVEST_BUMP = Math.round(M * 0.1 / 10000) * 10000
  const investMo = INVEST_BUMP > 0 ? calcMonths(T, C, M + INVEST_BUMP, rate) : null
  const investDiff = investMo !== null ? baseMo - investMo : null

  // 팁 2: 수익률 1% 증가
  const rateMo = calcMonths(T, C, M, rate + 1)
  const rateDiff = rateMo !== null ? baseMo - rateMo : null

  // 더 임팩트 큰 팁 선택
  if (investDiff !== null && investDiff > 0 && (rateDiff === null || investDiff >= rateDiff)) {
    return {
      key: 'analysis.tipInvest',
      amount: formatMoney(INVEST_BUMP),
      duration: formatDuration(investDiff),
    }
  }
  if (rateDiff !== null && rateDiff > 0) {
    return {
      key: 'analysis.tipRate',
      duration: formatDuration(rateDiff),
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
    remainText = t('analysis.untilGoalApprox', { duration: formatDuration(totalMonths) })
  }

  return { year: reachedYear, month: reachedMonth, asset: reachedAsset, remainText, totalMonths }
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

const loadData = async (force = false) => {
  loading.value = true
  try {
    const [goal, summary, rate] = await Promise.all([
      userDataStore.ensureGoals(force),
      userDataStore.ensureAssetSummary(force),
      getCachedExchangeRate(),
    ])
    exchangeRate.value = rate
    if (goal) {
      targetAsset.value = goal.target_asset ?? 0
      monthlyInvestment.value = goal.monthly_investment ?? 0
      annualReturn.value = goal.annual_return ?? null
    }
    currentAsset.value = summary?.current_asset ?? 0
  } catch (e) {
    console.error(e)
    showMessage(t('analysis.loadError'), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
  useRegisterPullToRefresh(() => loadData(true))
})
onUnmounted(clearPullToRefresh)
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex justify-space-between align-center mb-2">
      <div class="d-flex align-center ga-2">
        <img src="/icons/icon-predict.png" class="header-icon" :alt="$t('analysis.headerAlt')" />
        <div class="font-weight-bold">{{ $t('analysis.title') }}</div>
      </div>
      <div class="d-flex align-center ga-2">
        <button class="icon-btn" @click="router.push('/hub')">
          <img src="/icons/icon-hub.png" :alt="$t('common.hub')" class="icon-btn-img" />
        </button>
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
        <div class="font-weight-medium text-medium-emphasis">{{ $t('analysis.needSetup') }}</div>
        <div class="text-disabled mt-1 mb-6">{{ $t('analysis.needSetupHint') }}</div>
        <v-btn color="primary" variant="tonal" rounded="lg" @click="router.push('/goalSettings')"> {{ $t('analysis.goToGoalSetup') }} </v-btn>
      </div>
    </template>

    <template v-else>
      <!-- 차트 카드 -->
      <div class="glass-card pa-4 mb-3">
        <div class="d-flex justify-space-between align-center mb-1">
          <div>
            <div class="chart-asset-label">{{ $t('analysis.currentAsset') }}</div>
            <div class="chart-asset-value" :style="currentAsset === 0 ? 'color: rgba(var(--v-theme-on-surface), 0.35)' : ''">
              {{ currentAsset === 0 ? $t('analysis.unregistered') : formatMoney(currentAsset) }}
            </div>
          </div>
          <div class="text-right" v-if="targetAsset > 0">
            <div class="chart-asset-label">{{ $t('analysis.targetAsset') }}</div>
            <div class="chart-asset-value" style="color: rgb(var(--v-theme-primary))">{{ formatMoney(targetAsset) }}</div>
          </div>
        </div>

        <!-- 현재 자산 미등록 안내 -->
        <div v-if="currentAsset === 0" class="no-asset-notice mb-3" @click="router.push('/portfolio')" style="cursor: pointer">
          <v-icon size="13" color="warning">mdi-information-outline</v-icon>
          <span>{{ $t('analysis.addAssetHint') }}</span>
          <v-icon size="14" color="warning" style="margin-left: auto; opacity: 0.7">mdi-chevron-right</v-icon>
        </div>

        <!-- Progress Timeline -->
        <div class="pt-timeline">
          <!-- 달성률 텍스트 -->
          <div class="pt-pct-row">
            <span class="pt-pct-value">{{ progressPct }}%</span>
            <span class="pt-pct-label">{{ $t('analysis.reachedShort') }}</span>
          </div>

          <!-- 프로그레스 바 + 마일스톤 -->
          <div class="pt-bar-wrap">
            <div class="pt-bar-bg">
              <div class="pt-bar-fill" :style="{ width: progressPct + '%' }" />
              <!-- 현재 위치 마커 -->
              <div class="pt-now-marker" :style="{ left: progressPct + '%' }">
                <div class="pt-now-dot" />
              </div>
              <!-- bar 안쪽 수직선 (goal 제외) -->
              <div
                v-for="m in timelineMilestones.filter(m => !m.isGoal)"
                :key="'bar-' + m.year"
                class="pt-inner-tick"
                :class="m.isPast ? 'inner-tick--done' : 'inner-tick--future'"
                style="position: absolute; top: 50%; transform: translateY(-50%)"
                :style="{ left: m.pct + '%', top: '50%', transform: 'translateY(-50%)', position: 'absolute' }"
              />
            </div>

            <!-- 연도 마일스톤: 라벨 + 깃발 -->
            <div class="pt-milestones">
              <div
                v-for="m in timelineMilestones"
                :key="m.year"
                class="pt-milestone"
                :class="{ 'pt-milestone--goal': m.isGoal }"
                :style="{ left: m.pct + '%' }"
              >
                <template v-if="m.isGoal">
                  <v-icon size="18" color="primary" class="pt-goal-flag">mdi-flag-checkered</v-icon>
                  <div class="pt-milestone-label label-goal">{{ m.year }}.{{ m.month }}</div>
                </template>
                <template v-else>
                  <div class="pt-milestone-label" :class="m.isPast ? 'label-past' : m.year === currentYear ? 'label-now' : 'label-future'">
                    {{ m.month ? `${m.year}.${m.month}` : m.year }}
                  </div>
                </template>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- 예상 요약 스탯 -->
      <div class="stat-grid mb-3">
        <div class="stat-card text-center">
          <div class="stat-label">{{ $t('analysis.totalInvested') }}</div>
          <div class="stat-value">{{ formatMoney(currentAsset + totalInvested) }}</div>
        </div>
        <div class="stat-card text-center">
          <div class="stat-label">{{ $t('analysis.totalReturn') }}</div>
          <div class="stat-value" style="color: rgb(var(--v-theme-primary))">{{ formatMoney(Math.max(totalReturn, 0)) }}</div>
        </div>
        <div class="stat-card text-center" style="grid-column: 1 / -1">
          <div class="stat-label">{{ $t('analysis.finalAsset') }}</div>
          <div class="stat-value-lg">{{ formatMoney(finalAsset) }}</div>
        </div>
      </div>

      <!-- 수익률 시나리오 비교 -->
      <div v-if="scenarios.length" class="glass-card pa-4 mb-3">
        <div class="section-title mb-3">{{ $t('analysis.scenarioTitle') }}</div>
        <div class="scenario-grid">
          <div v-for="(s, i) in scenarios" :key="s.rate" class="scenario-col" :class="i === 0 ? 'scenario-low' : i === 2 ? 'scenario-high' : 'scenario-mid'">
            <div class="scenario-emoji">{{ i === 0 ? '🐢' : i === 2 ? '🚀' : '📍' }}</div>
            <div class="scenario-name" :class="i === 0 ? 'name-low' : i === 2 ? 'name-high' : 'name-mid'">
              {{ i === 0 ? $t('analysis.scenarioConservative') : i === 2 ? $t('analysis.scenarioOptimistic') : $t('analysis.scenarioCurrent') }}
            </div>
            <div class="scenario-rate-label">{{ $t('analysis.annualRatePrefix', { rate: s.rate }) }}</div>
            <div class="scenario-divider" />
            <div class="scenario-date">
              <template v-if="i === 1">{{ formatScenarioDate(s.months) }}</template>
              <template v-else>{{ formatScenarioDiff(s.months, scenarios[1]?.months ?? null, i === 2) }}</template>
            </div>
          </div>
        </div>
      </div>

      <!-- FIRE Tip -->
      <div v-if="fireTip" class="tip-card mb-3">
        <span class="tip-emoji">💡</span>
        <span class="tip-title">{{ $t('analysis.tipTitle') }}</span>
        <i18n-t :keypath="fireTip.key" tag="span" class="tip-body ml-1" scope="global">
          <template v-if="'amount' in fireTip" #amount><strong>{{ fireTip.amount }}</strong></template>
          <template #duration><strong>{{ fireTip.duration }}</strong></template>
        </i18n-t>
      </div>

      <!-- 연도별 예상자산 추이 -->
      <div class="glass-card pa-4">
        <div class="section-title mb-3">{{ $t('analysis.yearlyTitle') }}</div>
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
                  <span class="yearly-sublabel">{{ $t('analysis.thisYearGoal', { amount: formatMoney(row.asset) }) }}</span>
                  <span v-if="row.fireRate !== null" class="yearly-fire-rate"> {{ $t('analysis.totalFire', { rate: row.fireRate }) }} </span>
                </div>
              </template>

              <!-- 과거: 100% 완료 -->
              <template v-else-if="row.status === 'past'">
                <div class="yearly-bar-row">
                  <div class="yearly-bar-bg yearly-bar-bg--done">
                    <div class="yearly-bar-fill yearly-bar-fill--done" style="width: 100%"></div>
                  </div>
                  <span class="yearly-rate yearly-rate--done">{{ $t('analysis.done') }}</span>
                </div>
                <div class="yearly-asset yearly-asset--past">{{ formatMoney(row.asset) }}</div>
              </template>

              <!-- 미래: 빈 바 -->
              <template v-else>
                <div class="yearly-bar-row">
                  <div class="yearly-bar-bg yearly-bar-bg--future">
                    <div class="yearly-bar-fill" style="width: 0%"></div>
                  </div>
                  <span class="yearly-rate yearly-rate--future">-</span>
                </div>
                <div class="yearly-asset yearly-asset--future">{{ $t('analysis.planned', { amount: formatMoney(row.asset) }) }}</div>
              </template>
            </div>
          </div>
        </div>

        <!-- 더보기 / 접기 -->
        <div v-if="displayRows.length > summaryRows.length || showAllYears" class="yearly-toggle" @click="showAllYears = !showAllYears">
          {{ showAllYears ? $t('analysis.collapse') : $t('analysis.expand', { n: displayRows.length }) }}
        </div>

        <!-- FIRE 달성 카드 -->
        <div v-if="fireGoalYear" class="fire-goal-card mt-3">
          <div class="fire-goal-title">{{ $t('analysis.fireGoalTitle') }}</div>
          <div class="fire-goal-asset-label">{{ $t('analysis.fireGoalAssetLabel') }}</div>
          <div class="fire-goal-asset">{{ formatMoney(finalAsset) }}</div>
          <div class="fire-goal-meta">
            <span class="fire-goal-year">{{ $t('analysis.fireGoalYearMonth', { ym: formatYearMonth(fireGoalYear.year, fireGoalYear.month) }) }}</span>
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

.icon-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: opacity 0.15s ease;
}
.icon-btn:active { opacity: 0.6; }
.icon-btn-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.chart-asset-label {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 2px;
}
.chart-asset-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.no-asset-notice {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  background: rgba(var(--v-theme-warning), 0.08);
  border: 1px solid rgba(var(--v-theme-warning), 0.2);
  border-radius: 8px;
  padding: 6px 10px;
}

/* ── Progress Timeline ── */
.pt-timeline {
  padding-top: 4px;
}

.pt-pct-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 14px;
}
.pt-pct-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: rgb(var(--v-theme-primary));
  line-height: 1;
  letter-spacing: -0.5px;
}
.pt-pct-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.pt-goal-date {
  margin-left: auto;
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.pt-bar-wrap {
  position: relative;
  margin-bottom: 28px;
}

.pt-bar-bg {
  position: relative;
  height: 10px;
  border-radius: 99px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  overflow: visible;
}
.pt-bar-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, rgba(var(--v-theme-primary), 0.5) 0%, rgb(var(--v-theme-primary)) 100%);
  transition: width 0.6s ease;
  min-width: 0%;
}

/* 현재 위치 마커 */
.pt-now-marker {
  position: absolute;
  top: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.pt-now-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  border: 2.5px solid rgb(var(--v-theme-surface));
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.25);
  transform: translateY(-50%);
}
.pt-now-label {
  font-size: 0.5625rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  white-space: nowrap;
  margin-top: 6px;
}

/* 연도 마일스톤 */
.pt-milestones {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  pointer-events: none;
}
.pt-milestone {
  position: absolute;
  top: 100%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 4px;
}
.pt-milestone--goal {
  top: 50%;
  transform: translate(-100%, -50%);
  align-items: flex-end;
  margin-top: 0;
}
.pt-inner-tick {
  width: 1.5px;
  height: 10px;
  border-radius: 1px;
}
.inner-tick--done   { background: rgba(var(--v-theme-surface), 0.5); }
.inner-tick--future { background: rgba(var(--v-theme-on-surface), 0.15); }

.pt-goal-flag {
  filter: drop-shadow(0 0 4px rgba(var(--v-theme-primary), 0.4));
}

.pt-milestone-label {
  font-size: 0.5625rem;
  font-weight: 600;
  white-space: nowrap;
  margin-top: 4px;
}
.label-past   { color: rgba(var(--v-theme-on-surface), 0.25); }
.label-now    { color: rgb(var(--v-theme-primary)); font-weight: 700; }
.label-done   { color: rgba(var(--v-theme-primary), 0.6); }
.label-future { color: rgba(var(--v-theme-on-surface), 0.3); }
.label-goal   { color: rgb(var(--v-theme-primary)); font-size: 0.625rem; }

.pt-edge-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}
.pt-edge-start {
  font-size: 0.625rem;
  color: rgba(var(--v-theme-on-surface), 0.3);
}
.pt-edge-end {
  font-size: 0.6875rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
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
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 6px;
}
.stat-value {
  font-size: 1rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.stat-value-lg {
  font-size: 1.25rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.tip-card {
  border-radius: 16px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.08) 0%, rgba(var(--v-theme-primary), 0.04) 100%);
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tip-emoji {
  font-size: 1rem;
}
.tip-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  letter-spacing: 0.03em;
}
.tip-body {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.section-title {
  font-size: 0.75rem;
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
  font-size: 1.375rem;
  line-height: 1;
  margin-bottom: 2px;
}
.scenario-name {
  font-size: 0.6875rem;
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
  font-size: 0.8125rem;
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
  font-size: 0.625rem;
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
  font-size: 0.6875rem;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}
.yearly-done {
  color: rgba(var(--v-theme-on-surface), 0.35);
}
.yearly-active {
  color: rgb(var(--v-theme-primary));
  font-size: 0.5625rem;
}
.yearly-pending {
  color: rgba(var(--v-theme-on-surface), 0.25);
  font-size: 0.8125rem;
}

.yearly-year {
  font-size: 0.8125rem;
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
  font-size: 0.6875rem;
  font-weight: 700;
  white-space: nowrap;
  min-width: 32px;
  text-align: right;
}
.yearly-rate--active {
  color: rgb(var(--v-theme-primary));
  font-size: 0.8125rem;
}
.yearly-rate--done {
  color: rgba(var(--v-theme-on-surface), 0.3);
  font-size: 0.625rem;
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
  font-size: 0.625rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.yearly-fire-rate {
  font-size: 0.625rem;
  font-weight: 600;
  color: rgba(var(--v-theme-primary), 0.7);
}

.yearly-asset {
  font-size: 0.6875rem;
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
  font-size: 0.75rem;
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
  font-size: 0.6875rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.fire-goal-asset-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-bottom: 2px;
}
.fire-goal-asset {
  font-size: 1.75rem;
  font-weight: 800;
  color: rgb(var(--v-theme-primary));
  letter-spacing: -0.5px;
  line-height: 1.1;
  margin-top: -4px;
  margin-bottom: 8px;
}
.fire-goal-meta {
  margin-bottom: 14px;
  font-size: 0.75rem;
  line-height: 1.4;
}
.fire-goal-year {
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.fire-goal-remain {
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
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
