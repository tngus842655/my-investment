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

const progressRate = computed(() => {
  if (!targetAsset.value) return 0
  return Math.min(Math.round((currentAsset.value / targetAsset.value) * 100), 100)
})

const remainingAsset = computed(() => Math.max(targetAsset.value - currentAsset.value, 0))
const isGoalAchieved = computed(() => targetAsset.value > 0 && currentAsset.value >= targetAsset.value)

// SVG 도넛 차트 계산
const RADIUS = 54
const STROKE = 10
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const dashOffset = computed(() => CIRCUMFERENCE * (1 - progressRate.value / 100))

const estimatedDate = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  const M = monthlyInvestment.value
  if (annualReturn.value === null) return null
  const r = annualReturn.value / 100 / 12
  if (!T || !M || C >= T) return null

  let months: number
  if (r === 0) {
    months = Math.ceil((T - C) / M)
  } else {
    const numerator = T * r + M
    const denominator = C * r + M
    if (denominator <= 0) return null
    months = Math.ceil(Math.log(numerator / denominator) / Math.log(1 + r))
  }
  if (!isFinite(months) || months <= 0) return null

  const years = Math.floor(months / 12)
  const remainMonths = months % 12
  const date = new Date()
  date.setMonth(date.getMonth() + months)

  const dateStr = `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}.`
  const durationStr =
    years > 0 ? `${years}년 ${remainMonths > 0 ? remainMonths + '개월' : ''}` : `${months}개월`

  return { dateStr, durationStr }
})

const loadDashboard = async () => {
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
  } catch (error) {
    console.error(error)
    showMessage('데이터를 불러오는 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex justify-space-between align-center mb-6">
      <div class="text-h6 font-weight-bold">FIREPATH</div>
      <v-btn
        icon="mdi-pencil-outline"
        variant="outlined"
        size="small"
        rounded="circle"
        elevation="0"
        class="glass-btn"
        @click="router.push('/goalSettings')"
      />
    </div>

    <!-- 스켈레톤 로딩 -->
    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
    </template>

    <template v-else>
      <!-- 현재 자산 카드 -->
      <div class="glass-card pa-5 mb-3">
        <div class="field-label mb-1">현재 자산</div>
        <div class="hero-amount font-weight-bold mb-1">
          {{ currentAsset > 0 ? Math.round(currentAsset).toLocaleString('ko-KR') + '원' : '-' }}
        </div>
        <div class="text-body-2" style="color: rgba(var(--v-theme-on-surface), 0.45)">
          <template v-if="currentAsset > 0">
            목표 자산 {{ formatShortMoney(targetAsset) }}원
          </template>
          <template v-else>
            <span
              class="d-inline-flex align-center ga-1"
              style="cursor: pointer; color: rgb(var(--v-theme-primary))"
              @click="router.push('/portfolio')"
            >
              <v-icon size="13">mdi-plus-circle-outline</v-icon>
              보유자산을 추가하면 현재 자산이 집계됩니다
            </span>
          </template>
        </div>
      </div>

      <!-- FIRE 달성률 카드 (도넛 차트) -->
      <div class="glass-card pa-5 mb-3">
        <div class="field-label mb-4">FIRE 달성률</div>
        <div class="fire-rate-layout">
          <!-- 도넛 차트 -->
          <div class="donut-wrap">
            <svg
              :width="RADIUS * 2 + STROKE"
              :height="RADIUS * 2 + STROKE"
              :viewBox="`0 0 ${RADIUS * 2 + STROKE} ${RADIUS * 2 + STROKE}`"
            >
              <!-- 배경 트랙 -->
              <circle
                :cx="RADIUS + STROKE / 2"
                :cy="RADIUS + STROKE / 2"
                :r="RADIUS"
                fill="none"
                stroke="rgba(var(--v-theme-on-surface), 0.08)"
                :stroke-width="STROKE"
              />
              <!-- 진행 호 -->
              <circle
                class="donut-progress"
                :cx="RADIUS + STROKE / 2"
                :cy="RADIUS + STROKE / 2"
                :r="RADIUS"
                fill="none"
                stroke="rgb(var(--v-theme-primary))"
                :stroke-width="STROKE"
                stroke-linecap="round"
                :stroke-dasharray="CIRCUMFERENCE"
                :stroke-dashoffset="dashOffset"
                transform-origin="center"
                transform="rotate(-90)"
              />
              <!-- 중앙 퍼센트 텍스트 -->
              <text
                :x="RADIUS + STROKE / 2"
                :y="RADIUS + STROKE / 2 + 1"
                text-anchor="middle"
                dominant-baseline="middle"
                class="donut-label"
                fill="rgb(var(--v-theme-on-surface))"
              >
                {{ progressRate }}%
              </text>
            </svg>
          </div>

          <!-- 우측 정보 -->
          <div class="fire-info">
            <template v-if="isGoalAchieved">
              <div class="fire-info-main" style="color: rgb(var(--v-theme-primary))">🎉 목표 달성!</div>
              <div class="fire-info-sub mt-1">목표금액을 재설정하세요</div>
            </template>
            <template v-else>
              <div class="fire-info-sub mb-1">목표까지</div>
              <div class="fire-info-main">{{ formatShortMoney(remainingAsset) }}원 남음</div>

              <div class="fire-divider my-3" />

              <div class="fire-info-sub mb-1">예상 달성일</div>
              <template v-if="estimatedDate">
                <div class="fire-info-date">{{ estimatedDate.dateStr }}</div>
                <div class="fire-info-sub mt-1">약 {{ estimatedDate.durationStr }} 후</div>
              </template>
              <template v-else>
                <div
                  class="fire-info-sub"
                  style="cursor: pointer; color: rgb(var(--v-theme-primary))"
                  @click="router.push('/goalSettings')"
                >
                  수익률을 설정해주세요
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>

      <!-- 스탯 2개 -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">월 투자금</div>
          <div class="stat-value">
            {{ monthlyInvestment > 0 ? formatShortMoney(monthlyInvestment) + '원' : '-' }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">연평균 수익률</div>
          <div class="stat-value">
            {{ annualReturn !== null ? annualReturn + '%' : '-' }}
          </div>
        </div>
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
  transition: background 0.25s ease, border-color 0.25s ease;
}
.v-theme--dark .glass-card {
  border-color: rgba(93, 214, 207, 0.15);
}

.glass-btn {
  background: rgb(var(--v-theme-surface)) !important;
  border-color: rgba(var(--v-theme-on-surface), 0.15) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}
.v-theme--dark .glass-btn {
  border-color: rgba(93, 214, 207, 0.25) !important;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.hero-amount {
  font-size: 28px;
  line-height: 1.2;
  color: rgb(var(--v-theme-on-surface));
}

/* 도넛 차트 */
.fire-rate-layout {
  display: flex;
  align-items: center;
  gap: 24px;
}

.donut-wrap {
  flex-shrink: 0;
}

.donut-progress {
  transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.donut-label {
  font-size: 18px;
  font-weight: 700;
}

/* 우측 정보 */
.fire-info {
  flex: 1;
  min-width: 0;
}

.fire-info-sub {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.fire-info-main {
  font-size: 17px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fire-info-date {
  font-size: 20px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.fire-divider {
  height: 1px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

/* 스탯 */
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
.v-theme--dark .stat-card {
  border-color: rgba(93, 214, 207, 0.15);
}

.stat-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
</style>
