<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { getExchangeRate } from '@/services/market'
import { formatCurrencyWithShort, formatShortMoney } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
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

// 복리 계산 기반 FIRE 달성일 산출
const estimatedDate = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  const M = monthlyInvestment.value
  if (annualReturn.value === null) return null
  const r = annualReturn.value / 100 / 12 // 월 수익률

  if (!T || !M || C >= T) return null

  let months: number
  if (r === 0) {
    months = Math.ceil((T - C) / M)
  } else {
    // 현재 자산 C 포함 복리 공식
    // T = C*(1+r)^n + M*((1+r)^n - 1)/r  를 n에 대해 풀면:
    // n = log((T*r + M) / (C*r + M)) / log(1+r)
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
    <div class="d-flex justify-space-between align-center mb-5">
      <div>
        <div class="text-h5 font-weight-bold">MY INVESTMENT</div>
        <div class="text-body-2 text-medium-emphasis">FIRE 목표 달성 현황</div>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          variant="tonal"
          color="primary"
          size="small"
          icon="mdi-pencil-outline"
          @click="router.push('/goalSettings')"
        />
        <v-btn
          variant="text"
          color="error"
          size="small"
          icon="mdi-logout"
          @click="confirmDialog = true"
        />
      </div>
    </div>

    <!-- 스켈레톤 로딩 -->
    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="list-item-three-line" class="mb-3 rounded-xl" />
    </template>

    <template v-else>
      <!-- 자산 현황 요약 카드 -->
      <v-card rounded="xl" elevation="0" border class="mb-3 overflow-hidden">
        <div class="hero-bg px-4 pt-4 pb-3">
          <div class="text-caption text-medium-emphasis font-weight-medium mb-1">현재 자산</div>
          <div class="text-h4 font-weight-bold">
            {{ formatCurrencyWithShort(currentAsset) }}
          </div>
          <div class="text-caption text-disabled mt-1">
            USD/KRW {{ exchangeRate.toLocaleString('ko-KR') }}원 기준
          </div>
        </div>

        <v-divider />

        <!-- 목표 달성률 -->
        <div class="px-4 py-3">
          <div class="d-flex justify-space-between align-center mb-2">
            <span class="text-caption text-medium-emphasis font-weight-medium">목표 달성률</span>
            <span
              class="text-caption font-weight-bold"
              :class="progressRate >= 100 ? 'text-success' : 'text-primary'"
            >
              {{ progressRate }}%
            </span>
          </div>
          <v-progress-linear
            :model-value="progressRate"
            height="8"
            rounded
            color="primary"
            bg-color="grey-lighten-3"
          />
          <div class="d-flex justify-space-between mt-2">
            <span class="text-caption text-disabled">0원</span>
            <span class="text-caption text-disabled">{{ formatShortMoney(targetAsset) }}</span>
          </div>
        </div>
      </v-card>

      <!-- 목표/투자 정보 그리드 -->
      <v-row dense class="mb-3">
        <v-col cols="6">
          <v-card rounded="xl" elevation="0" border height="100%">
            <v-card-text class="pa-3">
              <div class="text-caption text-medium-emphasis mb-1">목표 자산</div>
              <div class="text-body-1 font-weight-bold">
                {{ formatShortMoney(targetAsset) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6">
          <v-card rounded="xl" elevation="0" border height="100%">
            <v-card-text class="pa-3">
              <div class="text-caption text-medium-emphasis mb-1">잔여 목표</div>
              <div class="text-body-1 font-weight-bold text-error">
                {{ formatShortMoney(remainingAsset) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6">
          <v-card rounded="xl" elevation="0" border height="100%">
            <v-card-text class="pa-3">
              <div class="text-caption text-medium-emphasis mb-1">월 투자금</div>
              <div class="text-body-1 font-weight-bold">
                {{ monthlyInvestment > 0 ? formatShortMoney(monthlyInvestment) : '-' }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6">
          <v-card rounded="xl" elevation="0" border height="100%">
            <v-card-text class="pa-3">
              <div class="text-caption text-medium-emphasis mb-1">목표일</div>
              <div class="text-body-1 font-weight-bold">
                {{ targetDate || '-' }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- 예상 FIRE 달성일 -->
      <v-card rounded="xl" elevation="0" border class="mb-5">
        <v-card-text class="pa-3">
          <div class="d-flex justify-space-between align-center mb-1">
            <div class="d-flex align-center gap-2">
              <v-icon size="18" color="amber-darken-2">mdi-rocket-launch-outline</v-icon>
              <span class="text-caption text-medium-emphasis font-weight-medium"
                >예상 FIRE 달성</span
              >
            </div>
            <v-chip
              size="x-small"
              :color="annualReturn !== null ? 'primary' : 'default'"
              variant="tonal"
              @click="router.push('/goalSettings')"
              style="cursor: pointer"
            >
              {{ annualReturn !== null ? '연 ' + annualReturn + '% 복리' : '수익률 미설정' }}
            </v-chip>
          </div>
          <template v-if="estimatedDate">
            <div class="text-body-1 font-weight-bold mt-1">
              {{ estimatedDate.dateStr }}
              <span class="text-caption text-medium-emphasis ml-1"
                >(약 {{ estimatedDate.durationStr }})</span
              >
            </div>
            <div class="text-caption text-disabled mt-1">
              현재 자산 + 월
              {{
                monthlyInvestment > 0 ? (monthlyInvestment / 10000).toLocaleString() + '만원' : '-'
              }}
              복리 기준
            </div>
          </template>
          <template v-else>
            <span v-if="annualReturn === null" class="text-body-2 text-medium-emphasis">
              목표 수정에서 연평균 수익률을 설정해주세요
            </span>
            <span v-else class="text-body-2 text-medium-emphasis">
              목표 및 월 투자금을 설정해주세요
            </span>
          </template>
        </v-card-text>
      </v-card>

      <!-- 메뉴 버튼 -->
      <v-row dense>
        <v-col cols="12">
          <v-card
            rounded="xl"
            elevation="0"
            border
            class="menu-card"
            @click="router.push('/portfolio')"
          >
            <v-card-text class="pa-4 d-flex align-center gap-3">
              <v-icon color="primary" size="24">mdi-chart-line</v-icon>
              <div>
                <div class="text-body-2 font-weight-bold">보유자산 관리</div>
                <div class="text-caption text-medium-emphasis">실시간 평가금액 및 수익률 확인</div>
              </div>
              <v-spacer />
              <v-icon color="medium-emphasis" size="18">mdi-chevron-right</v-icon>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12">
          <v-card
            rounded="xl"
            elevation="0"
            border
            class="menu-card"
            @click="showMessage('서비스 준비중', 'warning')"
          >
            <v-card-text class="pa-4 d-flex align-center gap-3">
              <v-icon color="secondary" size="24">mdi-swap-horizontal</v-icon>
              <div>
                <div class="text-body-2 font-weight-bold">거래내역 관리</div>
                <div class="text-caption text-medium-emphasis">매수/매도 내역 기록 및 조회</div>
              </div>
              <v-spacer />
              <v-chip size="x-small" color="warning" variant="tonal">준비중</v-chip>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-container>

  <!-- 로그아웃 확인 다이얼로그 -->
  <v-dialog v-model="confirmDialog" max-width="320">
    <v-card rounded="xl">
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
.hero-bg {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.05) 0%, transparent 60%);
}

.menu-card {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.menu-card:hover {
  background-color: rgba(var(--v-theme-surface-variant), 0.5);
}

.gap-2 {
  gap: 8px;
}
.gap-3 {
  gap: 12px;
}
</style>
