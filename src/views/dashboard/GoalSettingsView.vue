<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { invalidateGoalCache } from '@/router'
import { formatShortMoney } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()

const targetAsset = ref('')
const monthlyInvestment = ref('')
const targetDate = ref('')
const annualReturn = ref<number | null>(null)

const loading = ref(false)
const isEditMode = ref(false)
const initializing = ref(true)

const addComma = (value: string) => {
  const number = value.replace(/[^0-9]/g, '')
  return number.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const removeComma = (value: string) => Number(value.replace(/,/g, '')) || 0

const handleTargetAsset = (value: string) => {
  targetAsset.value = addComma(value)
}
const handleMonthlyInvestment = (value: string) => {
  monthlyInvestment.value = addComma(value)
}

const sliderValue = computed({
  get: () => annualReturn.value ?? 7,
  set: (v: number) => {
    annualReturn.value = v
  },
})

const targetAssetText = computed(() => formatShortMoney(removeComma(targetAsset.value)))
const monthlyInvestmentText = computed(() => formatShortMoney(removeComma(monthlyInvestment.value)))

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
  const durationStr =
    years > 0 ? `${years}년 ${remainMonths > 0 ? remainMonths + '개월' : ''}` : `${months}개월`

  return { dateStr, durationStr }
})

const loadData = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data } = await supabase
    .from('investment_goals')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) {
    initializing.value = false
    return
  }

  isEditMode.value = true
  targetAsset.value = addComma(String(data.target_asset ?? ''))
  monthlyInvestment.value = addComma(String(data.monthly_investment ?? ''))
  targetDate.value = data.target_date ?? ''
  annualReturn.value = data.annual_return ?? null
  initializing.value = false
}

const save = async () => {
  if (!targetAsset.value) {
    showMessage('목표 자산을 입력해주세요.', 'warning')
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
        target_date: targetDate.value || null,
        annual_return: annualReturn.value,
      },
      { onConflict: 'user_id' },
    )

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    invalidateGoalCache()
    showMessage(
      isEditMode.value ? '목표 정보가 수정되었습니다.' : '투자 설정이 완료되었습니다.',
      'success',
    )
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
    supabase.auth.signOut().then(() => router.replace('/'))
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
        <v-btn
          v-if="isEditMode"
          icon="mdi-arrow-left"
          variant="text"
          size="small"
          class="mr-2"
          style="color: rgb(var(--v-theme-on-surface))"
          @click="cancel"
        />
        <div>
          <div class="text-h5 font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">
            {{ isEditMode ? '목표 수정' : '투자 시작하기' }}
          </div>
          <div class="text-body-2 text-medium-emphasis mt-1">
            {{
              isEditMode
                ? 'FIRE 목표와 투자 계획을 수정합니다'
                : '목표 자산과 투자 계획을 설정해주세요'
            }}
          </div>
        </div>
      </div>

      <!-- 목표 자산 -->
      <div class="glass-card pa-4 mb-3">
        <div class="field-label mb-3">
          <v-icon size="14" class="mr-1">mdi-target</v-icon>
          목표 자산 <span class="text-error">*</span>
        </div>
        <v-text-field
          :model-value="targetAsset"
          @update:model-value="handleTargetAsset"
          placeholder="1,000,000,000"
          variant="outlined"
          density="comfortable"
          hide-details
          suffix="원"
          class="glass-field"
        >
          <template #append-inner>
            <span
              v-if="targetAsset"
              class="text-caption font-weight-bold"
              style="color: rgb(var(--v-theme-primary)); white-space: nowrap"
            >
              {{ targetAssetText }}
            </span>
          </template>
        </v-text-field>
      </div>

      <!-- 월 투자금 -->
      <div class="glass-card pa-4 mb-3">
        <div class="field-label mb-3">
          <v-icon size="14" class="mr-1">mdi-cash-multiple</v-icon>
          월 투자금
          <span class="text-caption text-disabled ml-1">(선택)</span>
        </div>
        <v-text-field
          :model-value="monthlyInvestment"
          @update:model-value="handleMonthlyInvestment"
          placeholder="3,000,000"
          variant="outlined"
          density="comfortable"
          hide-details
          suffix="원"
          class="glass-field"
        >
          <template #append-inner>
            <span
              v-if="monthlyInvestment"
              class="text-caption font-weight-bold"
              style="color: rgb(var(--v-theme-primary)); white-space: nowrap"
            >
              {{ monthlyInvestmentText }}
            </span>
          </template>
        </v-text-field>
      </div>

      <!-- 연평균 수익률 -->
      <div class="glass-card pa-4 mb-3">
        <div class="d-flex justify-space-between align-center mb-1">
          <div class="field-label">
            <v-icon size="14" class="mr-1">mdi-trending-up</v-icon>
            예상 연평균 수익률
          </div>
          <v-chip
            size="x-small"
            :color="annualReturn !== null ? 'primary' : 'default'"
            variant="tonal"
          >
            {{ annualReturn !== null ? annualReturn + '%' : '미설정' }}
          </v-chip>
        </div>

        <div class="text-caption text-disabled mb-3">
          S&P500 역사적 평균 약 7% · 슬라이더를 움직이면 설정됩니다
        </div>

        <v-slider
          v-model="sliderValue"
          :min="0"
          :max="30"
          :step="0.5"
          color="primary"
          track-color="grey-lighten-3"
          thumb-label
          hide-details
        >
          <template #thumb-label="{ modelValue }">{{ modelValue }}%</template>
        </v-slider>

        <div class="d-flex justify-space-between mt-1">
          <span class="text-caption text-disabled">0%</span>
          <span class="text-caption text-disabled">30%</span>
        </div>

        <template v-if="estimatedPreview">
          <v-divider class="my-3" />
          <div class="d-flex align-center ga-2">
            <v-icon size="15" color="amber-darken-2">mdi-rocket-launch-outline</v-icon>
            <div class="text-caption text-medium-emphasis">
              목표 달성까지 약
              <strong style="color: rgb(var(--v-theme-primary))">{{
                estimatedPreview.durationStr
              }}</strong>
              →
              <strong style="color: rgb(var(--v-theme-primary))">{{
                estimatedPreview.dateStr
              }}</strong>
              예상
            </div>
          </div>
          <div class="text-caption text-disabled mt-1 ml-5">
            현재 자산 미포함 · 복리 기준 단순 추정
          </div>
        </template>
      </div>

      <!-- 목표일 -->
      <div class="glass-card pa-4 mb-6">
        <div class="field-label mb-3">
          <v-icon size="14" class="mr-1">mdi-calendar-outline</v-icon>
          목표일
          <span class="text-caption text-disabled ml-1">(선택)</span>
        </div>
        <v-text-field
          v-model="targetDate"
          type="date"
          variant="outlined"
          density="comfortable"
          hide-details
          class="glass-field"
        />
      </div>

      <!-- 버튼 -->
      <v-btn
        color="primary"
        size="large"
        rounded="lg"
        block
        elevation="0"
        :loading="loading"
        class="mb-3"
        @click="save"
      >
        {{ isEditMode ? '수정하기' : '시작하기' }}
      </v-btn>

      <v-btn
        variant="tonal"
        block
        rounded="lg"
        style="background: rgba(0, 0, 0, 0.1); color: rgba(var(--v-theme-on-surface), 0.75)"
        @click="cancel"
      >
        {{ isEditMode ? '취소' : '로그아웃' }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
  transition:
    background 0.25s ease,
    border-color 0.25s ease;
}


.field-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
