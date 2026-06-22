<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { getExchangeRate } from '@/services/market'
import { formatShortMoney } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'
import { useAppTheme } from '@/composables/useAppTheme'

const router = useRouter()
const { isDark, toggleTheme } = useAppTheme()
const loading = ref(true)

const targetAsset = ref(0)
const currentAsset = ref(0)
const monthlyInvestment = ref(0)
const targetDate = ref('')
const exchangeRate = ref(1350)
const annualReturn = ref<number | null>(null)
const confirmDialog = ref(false)

const progressRate = computed(() => {
  if (!targetAsset.value) return 0
  return Math.min(Math.round((currentAsset.value / targetAsset.value) * 100), 100)
})

const remainingAsset = computed(() => Math.max(targetAsset.value - currentAsset.value, 0))

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

  const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })
  const durationStr =
    years > 0 ? `${years}년 ${remainMonths > 0 ? remainMonths + '개월' : ''}` : `${months}개월`

  return { dateStr, durationStr }
})

const loadDashboard = async () => {
  loading.value = true
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const [goalResult, portfolioResult, rate] = await Promise.all([
      supabase.from('investment_goals').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('portfolios').select('*').eq('user_id', user.id),
      getExchangeRate('USD', 'KRW').catch(() => 1350),
    ])

    exchangeRate.value = rate

    if (goalResult.data) {
      targetAsset.value = goalResult.data.target_asset ?? 0
      monthlyInvestment.value = goalResult.data.monthly_investment ?? 0
      targetDate.value = goalResult.data.target_date ?? ''
      annualReturn.value = goalResult.data.annual_return ?? null
    }

    if (portfolioResult.data) {
      currentAsset.value = portfolioResult.data.reduce((sum, item) => {
        const amount = item.quantity * item.avg_price
        const krwAmount = item.currency === 'USD' ? amount * rate : amount
        return sum + krwAmount
      }, 0)
    }
  } catch (error) {
    console.error(error)
    showMessage('데이터를 불러오는 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

const logout = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    showMessage('로그아웃 중 오류가 발생했습니다.', 'error')
    return
  }
  router.replace('/')
}

onMounted(loadDashboard)
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex justify-space-between align-center mb-6">
      <span class="section-eyebrow">MY INVESTMENT</span>
      <div class="d-flex ga-2">
        <v-btn
          :icon="isDark() ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="outlined"
          size="small"
          rounded="circle"
          elevation="0"
          class="glass-btn"
          @click="toggleTheme"
        />
        <v-btn
          icon="mdi-pencil-outline"
          variant="outlined"
          size="small"
          rounded="circle"
          elevation="0"
          class="glass-btn"
          @click="router.push('/goalSettings')"
        />
        <v-btn
          icon="mdi-logout"
          variant="outlined"
          size="small"
          rounded="circle"
          elevation="0"
          class="glass-btn"
          @click="confirmDialog = true"
        />
      </div>
    </div>

    <!-- 스켈레톤 로딩 -->
    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl glass-skeleton" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl glass-skeleton" />
      <v-skeleton-loader type="list-item-three-line" class="mb-3 rounded-xl glass-skeleton" />
    </template>

    <template v-else>
      <!-- 히어로 카드 -->
      <div class="glass-card pa-5 mb-3">
        <div class="field-label mb-1">현재 자산</div>
        <div class="hero-amount font-weight-medium mb-1">
          {{ currentAsset > 0 ? formatShortMoney(currentAsset) + '원' : '-' }}
        </div>
        <div class="text-body-2 mb-5" style="color: rgba(var(--v-theme-on-surface), 0.5)">
          <template v-if="currentAsset > 0">
            {{ Math.round(currentAsset).toLocaleString('ko-KR') }}원
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

        <div class="progress-label-row mb-2">
          <span class="text-caption font-weight-medium">{{ progressRate }}% 달성</span>
          <span class="text-caption" style="color: rgba(var(--v-theme-on-surface), 0.5)">
            목표 {{ formatShortMoney(targetAsset) }}
          </span>
        </div>

        <div class="progress-track mb-2">
          <div class="progress-fill" :style="{ width: Math.max(progressRate, 2) + '%' }">
            <div class="progress-dot" />
          </div>
        </div>

        <div class="text-caption" style="color: rgba(var(--v-theme-on-surface), 0.55)">
          목표까지
          <span class="font-weight-medium" style="color: rgb(var(--v-theme-on-surface))">
            {{ formatShortMoney(remainingAsset) }}
          </span>
          남음
        </div>
      </div>

      <!-- 스탯 2개 -->
      <div class="stat-grid mb-3">
        <div class="stat-card">
          <div class="stat-label">월 투자금</div>
          <div class="stat-value">
            {{ monthlyInvestment > 0 ? formatShortMoney(monthlyInvestment) : '-' }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">잔여 목표</div>
          <div class="stat-value text-error">{{ formatShortMoney(remainingAsset) }}</div>
        </div>
      </div>

      <!-- FIRE 달성 카드 -->
      <div class="glass-card pa-4 mb-5">
        <div class="d-flex justify-space-between align-center mb-3">
          <div class="d-flex align-center ga-2">
            <v-icon size="15" color="amber-darken-2">mdi-rocket-launch-outline</v-icon>
            <span class="field-label">예상 FIRE 달성</span>
          </div>
          <v-chip
            size="x-small"
            :color="annualReturn !== null ? 'primary' : 'default'"
            variant="tonal"
            style="cursor: pointer"
            @click="router.push('/goalSettings')"
          >
            {{ annualReturn !== null ? '연 ' + annualReturn + '% 복리' : '수익률 미설정' }}
          </v-chip>
        </div>

        <template v-if="estimatedDate">
          <div class="fire-date font-weight-medium mb-1">{{ estimatedDate.dateStr }}</div>
          <div class="text-body-2 mb-3" style="color: rgba(var(--v-theme-on-surface), 0.55)">
            약 {{ estimatedDate.durationStr }} 후
          </div>
          <v-divider class="mb-3" />
          <div class="text-caption text-disabled">
            현재 자산 기준 · 월
            {{
              monthlyInvestment > 0 ? (monthlyInvestment / 10000).toLocaleString() + '만원' : '-'
            }}
            복리 계산
          </div>
        </template>
        <template v-else>
          <div class="text-body-2 text-medium-emphasis">
            {{
              annualReturn === null
                ? '목표 수정에서 연평균 수익률을 설정해주세요'
                : '목표 및 월 투자금을 설정해주세요'
            }}
          </div>
        </template>
      </div>

      <!-- 섹션 라벨 -->
      <div class="section-eyebrow mb-2">메뉴</div>

      <!-- 메뉴 리스트 -->
      <div class="d-flex flex-column ga-2">
        <div
          class="glass-card menu-card pa-4 d-flex align-center ga-3"
          @click="router.push('/portfolio')"
        >
          <div class="menu-icon">
            <v-icon size="18" color="primary">mdi-chart-line</v-icon>
          </div>
          <div>
            <div class="text-body-2 font-weight-medium">보유자산 관리</div>
            <div class="text-caption text-medium-emphasis">실시간 평가금액 및 수익률 확인</div>
          </div>
          <v-spacer />
          <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)"
            >mdi-chevron-right</v-icon
          >
        </div>

        <div
          class="glass-card menu-card pa-4 d-flex align-center ga-3"
          @click="showMessage('서비스 준비중', 'warning')"
        >
          <div class="menu-icon">
            <v-icon size="18" color="primary">mdi-swap-horizontal</v-icon>
          </div>
          <div>
            <div class="text-body-2 font-weight-medium">거래내역 관리</div>
            <div class="text-caption text-medium-emphasis">매수/매도 내역 기록 및 조회</div>
          </div>
          <v-spacer />
          <v-chip size="x-small" color="warning" variant="tonal">준비중</v-chip>
        </div>
      </div>
    </template>
  </v-container>

  <!-- 로그아웃 확인 다이얼로그 -->
  <v-dialog v-model="confirmDialog" max-width="320">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-6">로그아웃</v-card-title>
      <v-card-text class="text-center text-medium-emphasis">
        정말 로그아웃 하시겠습니까?
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn variant="text" block @click="confirmDialog = false">취소</v-btn>
        <v-btn color="error" block @click="logout">로그아웃</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.section-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
  transition:
    background 0.25s ease,
    border-color 0.25s ease;
}

.v-theme--dark .glass-card {
  background: rgb(var(--v-theme-surface));
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
  font-size: 32px;
  line-height: 1.15;
  color: rgb(var(--v-theme-on-surface));
}

.progress-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-track {
  height: 6px;
  border-radius: 99px;
  background: rgba(var(--v-theme-on-surface), 0.1);
  position: relative;
}

.progress-fill {
  height: 100%;
  border-radius: 99px;
  background: rgb(var(--v-theme-primary));
  position: relative;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.progress-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  border: 2.5px solid rgba(255, 255, 255, 0.9);
  position: absolute;
  right: -6px;
  top: -3px;
}

.v-theme--dark .progress-dot {
  border-color: rgba(17, 46, 45, 0.9);
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}

.stat-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 16px;
  padding: 14px 16px;
  height: 100%;
}

.v-theme--dark .stat-card {
  background: rgb(var(--v-theme-surface));
  border-color: rgba(93, 214, 207, 0.15);
}

.stat-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 6px;
}

.stat-value {
  font-size: 18px;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}

.fire-date {
  font-size: 22px;
  color: rgb(var(--v-theme-on-surface));
}

.menu-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-card {
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.menu-card:hover {
  background: rgba(255, 255, 255, 0.82) !important;
  transform: translateY(-1px);
}

.v-theme--dark .menu-card:hover {
  background: rgba(17, 46, 45, 0.92) !important;
}

.glass-skeleton {
  background: rgba(255, 255, 255, 0.4) !important;
}
</style>
