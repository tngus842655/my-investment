<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { invalidateGoalCache } from '@/router'
import { formatShortMoney } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'
import { useUserDataStore } from '@/stores/userData'

const router = useRouter()
const userDataStore = useUserDataStore()

const targetAsset = ref('')
const monthlyInvestment = ref('')
const annualReturn = ref<number | null>(null)

const loading = ref(false)
const isEditMode = ref(false)
const initializing = ref(true)

const addComma = (value: string) => {
  const number = value.replace(/[^0-9]/g, '')
  return number.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const removeComma = (value: string) => Number(value.replace(/,/g, '')) || 0

const MAX_ASSET = 100_000_000_000 // 1000억
const MAX_MONTHLY = 100_000_000 // 1억

const handleTargetAsset = (value: string) => {
  const num = Math.min(Number(value.replace(/,/g, '')) || 0, MAX_ASSET)
  targetAsset.value = addComma(String(num))
}
const handleMonthlyInvestment = (value: string) => {
  const num = Math.min(Number(value.replace(/,/g, '')) || 0, MAX_MONTHLY)
  monthlyInvestment.value = addComma(String(num))
}

const sliderValue = computed({
  get: () => annualReturn.value ?? 7,
  set: (v: number) => {
    annualReturn.value = v
  },
})

const targetAssetText = computed(() => formatShortMoney(removeComma(targetAsset.value)) + '원')
const monthlyInvestmentText = computed(() => formatShortMoney(removeComma(monthlyInvestment.value)) + '원')

// 월 투자금이 입력된 경우 목표 자산 최소값 (월 투자금 × 12 = 1년치)
const minTargetByMonthly = computed(() => {
  const m = removeComma(monthlyInvestment.value)
  return m > 0 ? m * 12 : 0
})

const targetBelowMinimum = computed(() => {
  const t = removeComma(targetAsset.value)
  return minTargetByMonthly.value > 0 && t > 0 && t < minTargetByMonthly.value
})

const estimatedPreview = computed(() => {
  const T = removeComma(targetAsset.value)
  const M = removeComma(monthlyInvestment.value)
  const r = (annualReturn.value ?? 7) / 100 / 12

  if (!T || !M) return null

  let months: number
  if (r === 0) {
    months = Math.ceil(T / M)
  } else {
    months = Math.ceil(Math.log(1 + (T * r) / M) / Math.log(1 + r))
  }

  if (!isFinite(months) || months <= 0) return null

  const years = Math.floor(months / 12)
  const remainMonths = months % 12
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })
  const durationStr = years > 0 ? `${years}년 ${remainMonths > 0 ? remainMonths + '개월' : ''}` : `${months}개월`
  const tooLong = years >= 50

  return { dateStr, durationStr, tooLong }
})

const loadData = async () => {
  const goal = await userDataStore.ensureGoals()

  if (!goal) {
    annualReturn.value = 7
    initializing.value = false
    return
  }

  isEditMode.value = true
  targetAsset.value = addComma(String(goal.target_asset ?? ''))
  monthlyInvestment.value = addComma(String(goal.monthly_investment ?? ''))
  annualReturn.value = Math.max(goal.annual_return ?? 7, 3)
  initializing.value = false
}

const save = async () => {
  const targetNum = removeComma(targetAsset.value)
  if (!targetAsset.value || targetNum <= 0) {
    showMessage('목표 자산을 입력해주세요.', 'warning')
    return
  }
  if (targetNum < 10000) {
    showMessage('목표 자산은 최소 10,000원 이상 입력해주세요.', 'warning')
    return
  }
  const monthlyNum = removeComma(monthlyInvestment.value)
  if (monthlyInvestment.value && monthlyNum <= 0) {
    showMessage('월 투자금은 0보다 커야 합니다.', 'warning')
    return
  }
  if (monthlyNum > 0 && targetNum < monthlyNum * 12) {
    showMessage(`목표 자산은 월 투자금의 12배(${formatShortMoney(monthlyNum * 12)}원) 이상이어야 합니다.`, 'warning')
    return
  }
  if (annualReturn.value !== null && annualReturn.value < 3) {
    showMessage('예상 연평균 수익률은 최소 3% 이상이어야 합니다.', 'warning')
    return
  }
  loading.value = true
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('investment_goals').upsert(
      {
        user_id: user.id,
        target_asset: removeComma(targetAsset.value),
        monthly_investment: removeComma(monthlyInvestment.value),
        annual_return: annualReturn.value,
      },
      { onConflict: 'user_id' },
    )

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    invalidateGoalCache()
    userDataStore.invalidateGoals()
    showMessage(isEditMode.value ? '목표 정보가 수정되었습니다.' : '투자 설정이 완료되었습니다.', 'success')
    router.push('/dashboard')
  } catch (error) {
    console.error(error)
    showMessage('저장 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

const cancel = () => {
  if (isEditMode.value) {
    router.back()
  } else {
    supabase.auth.signOut().then(() => {
      userDataStore.reset()
      router.replace('/')
    })
  }
}

onMounted(loadData)
</script>

<template>
  <div class="fill-height pa-4 pa-sm-6 d-flex flex-column align-center">
    <div v-if="initializing" class="d-flex justify-center align-center fill-height">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <div v-else style="width: 100%; max-width: 480px">
      <!-- 헤더 -->
      <div class="d-flex align-center mb-6">
        <v-btn v-if="isEditMode" icon="mdi-arrow-left" variant="text" size="small" class="mr-2" style="color: rgb(var(--v-theme-on-surface))" @click="cancel" />
        <div>
          <div class="font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">
            {{ isEditMode ? '목표 수정' : '투자 시작하기' }}
          </div>
          <div class="text-medium-emphasis mt-1">
            {{ isEditMode ? 'FIRE 목표와 투자 계획을 수정합니다' : '목표 자산과 투자 계획을 설정해주세요' }}
          </div>
        </div>
      </div>

      <!-- 목표 자산 -->
      <div class="glass-card pa-4 mb-3">
        <div class="field-label mb-3">
          <v-icon size="14" class="mr-1">mdi-target</v-icon>
          목표 자산 <span class="text-error">*</span>
        </div>
        <v-text-field :model-value="targetAsset" @update:model-value="handleTargetAsset" placeholder="1,000,000,000" variant="outlined" density="comfortable" hide-details :class="['glass-field', targetBelowMinimum ? 'field-error' : '']" maxlength="14">
          <template #append-inner>
            <span class="font-weight-bold" style="color: rgb(var(--v-theme-primary)); white-space: nowrap">
              {{ targetAsset ? targetAssetText : '원' }}
            </span>
          </template>
        </v-text-field>
        <div v-if="targetBelowMinimum" class="field-hint-error mt-2">
          <v-icon size="12">mdi-alert-circle-outline</v-icon>
          월 투자금 기준 최소 <strong>{{ formatShortMoney(minTargetByMonthly) }}원</strong> 이상 입력해주세요
        </div>
        <div v-else-if="minTargetByMonthly > 0 && !removeComma(targetAsset)" class="field-hint mt-2">
          <v-icon size="12">mdi-information-outline</v-icon>
          월 투자금 기준 최소 <strong>{{ formatShortMoney(minTargetByMonthly) }}원</strong> 이상 권장
        </div>
      </div>

      <!-- 월 투자금 -->
      <div class="glass-card pa-4 mb-3">
        <div class="field-label mb-3">
          <v-icon size="14" class="mr-1">mdi-cash-multiple</v-icon>
          월 투자금
          <span class="text-disabled ml-1">(선택)</span>
        </div>
        <v-text-field :model-value="monthlyInvestment" @update:model-value="handleMonthlyInvestment" placeholder="3,000,000" variant="outlined" density="comfortable" hide-details class="glass-field" maxlength="13">
          <template #append-inner>
            <span class="font-weight-bold" style="color: rgb(var(--v-theme-primary)); white-space: nowrap">
              {{ monthlyInvestment ? monthlyInvestmentText : '원' }}
            </span>
          </template>
        </v-text-field>
      </div>

      <!-- 연평균 수익률 -->
      <div class="glass-card pa-4 mb-6">
        <div class="d-flex justify-space-between align-center mb-1">
          <div class="field-label">
            <v-icon size="14" class="mr-1">mdi-trending-up</v-icon>
            예상 연평균 수익률
          </div>
          <v-chip size="x-small" :color="annualReturn !== null ? 'primary' : 'default'" variant="tonal">
            {{ annualReturn !== null ? annualReturn + '%' : '미설정' }}
          </v-chip>
        </div>

        <div class="text-disabled mb-3">슬라이더를 움직이면 설정됩니다</div>

        <v-slider v-model="sliderValue" :min="3" :max="30" :step="0.5" color="primary" track-color="grey-lighten-3" thumb-label hide-details>
          <template #thumb-label="{ modelValue }">{{ modelValue }}%</template>
        </v-slider>

        <div class="d-flex justify-space-between mt-1">
          <span class="text-disabled">3%</span>
          <span class="text-disabled">30%</span>
        </div>

        <template v-if="estimatedPreview">
          <v-divider class="my-3" />
          <div class="d-flex align-center ga-2">
            <v-icon size="15" :color="estimatedPreview.tooLong ? 'warning' : 'amber-darken-2'">
              {{ estimatedPreview.tooLong ? 'mdi-alert-outline' : 'mdi-rocket-launch-outline' }}
            </v-icon>
            <div class="text-medium-emphasis">
              목표 달성까지 약
              <strong :style="{ color: estimatedPreview.tooLong ? 'rgb(var(--v-theme-warning))' : 'rgb(var(--v-theme-primary))' }">{{ estimatedPreview.durationStr }}</strong>
              →
              <strong :style="{ color: estimatedPreview.tooLong ? 'rgb(var(--v-theme-warning))' : 'rgb(var(--v-theme-primary))' }">{{ estimatedPreview.dateStr }}</strong>
              예상
            </div>
          </div>
          <div v-if="estimatedPreview.tooLong" class="d-flex align-center ga-1 mt-2 ml-5">
            <v-icon size="12" color="warning">mdi-information-outline</v-icon>
            <span style="color: rgb(var(--v-theme-warning))">
              목표 달성까지 50년 이상 — 월 투자금을 늘리거나 목표 자산을 줄이는 것을 권장합니다
            </span>
          </div>
          <div v-else class="text-disabled mt-1 ml-5">현재 자산 미포함 · 복리 기준 단순 추정</div>
        </template>
      </div>

      <!-- 버튼 -->
      <v-btn color="primary" size="large" rounded="lg" block elevation="0" :loading="loading" class="mb-3" @click="save">
        {{ isEditMode ? '수정하기' : '시작하기' }}
      </v-btn>

      <v-btn variant="tonal" block rounded="lg" style="background: rgba(0, 0, 0, 0.1); color: rgba(var(--v-theme-on-surface), 0.75)" @click="cancel">
        {{ isEditMode ? '취소' : '로그아웃' }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.field-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.field-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.field-hint-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  color: rgb(var(--v-theme-error));
}
</style>
