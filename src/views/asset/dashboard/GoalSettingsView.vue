<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { invalidateGoalCache } from '@/router'
import { formatMoneyIn } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'
import { useUserDataStore } from '@/stores/userData'
import { setBaseCurrency } from '@/composables/useBaseCurrency'
import { getCachedRate } from '@/services/exchangeRateCache'
import { recomputeAssetSummary } from '@/services/assetSummary'
import type { CurrencyCode } from '@/config/marketConfig'
import { isKoLocale } from '@/plugins/i18n'
import { useI18n } from 'vue-i18n'
import { formatYearMonth, formatDuration } from '@/utils/dateFormat'

const router = useRouter()
const { t, locale } = useI18n()
const userDataStore = useUserDataStore()

const targetAsset = ref('')
const monthlyInvestment = ref('')
const annualReturn = ref<number | null>(null)

// ── 기준통화 (GLOBALIZATION.md 단계 C) ─────────────
const baseCurrencySel = ref<CurrencyCode>('KRW')
let savedBaseCurrency: CurrencyCode = 'KRW' // 저장돼 있던 값 (변경 감지용)
const currencyOptions: { value: CurrencyCode; labelKey: string }[] = [
  { value: 'KRW', labelKey: 'goalSettings.currencyKRW' },
  { value: 'USD', labelKey: 'goalSettings.currencyUSD' },
]
const currencyUnit = computed(() => (baseCurrencySel.value === 'KRW' ? (isKoLocale() ? '원' : '₩') : '$'))

// 기준통화 변경 시 목표 금액을 현재 환율로 1회 환산 (확인 다이얼로그 필수 — 2-4 정책)
const convertDialog = ref(false)
const pendingCurrency = ref<CurrencyCode | null>(null)
const convertPreview = ref<{ target: number; monthly: number } | null>(null)

const onSelectCurrency = async (c: CurrencyCode) => {
  if (c === baseCurrencySel.value) return
  const tgt = removeComma(targetAsset.value)
  const mon = removeComma(monthlyInvestment.value)
  if (tgt <= 0 && mon <= 0) {
    baseCurrencySel.value = c
    return
  }
  try {
    const rate = await getCachedRate(baseCurrencySel.value, c)
    convertPreview.value = { target: Math.round(tgt * rate), monthly: Math.round(mon * rate) }
    pendingCurrency.value = c
    convertDialog.value = true
  } catch {
    showMessage(t('goalSettings.fxFailed'), 'error')
  }
}

const confirmConvert = () => {
  if (!pendingCurrency.value || !convertPreview.value) return
  targetAsset.value = convertPreview.value.target > 0 ? addComma(String(convertPreview.value.target)) : ''
  monthlyInvestment.value = convertPreview.value.monthly > 0 ? addComma(String(convertPreview.value.monthly)) : ''
  baseCurrencySel.value = pendingCurrency.value
  convertDialog.value = false
  pendingCurrency.value = null
}

const cancelConvert = () => {
  convertDialog.value = false
  pendingCurrency.value = null
}

const loading = ref(false)
const isEditMode = ref(false)
const initializing = ref(true)

const addComma = (value: string) => {
  const number = value.replace(/[^0-9]/g, '')
  return number.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const removeComma = (value: string) => Number(value.replace(/,/g, '')) || 0

// 입력 상한/하한: KRW 1000억·1억·1만 / USD $1억·$10만·$10
const MAX_ASSET = computed(() => (baseCurrencySel.value === 'KRW' ? 100_000_000_000 : 100_000_000))
const MAX_MONTHLY = computed(() => (baseCurrencySel.value === 'KRW' ? 100_000_000 : 100_000))
const MIN_TARGET = computed(() => (baseCurrencySel.value === 'KRW' ? 10_000 : 10))

const handleTargetAsset = (value: string) => {
  const num = Math.min(Number(value.replace(/,/g, '')) || 0, MAX_ASSET.value)
  targetAsset.value = addComma(String(num))
}
const handleMonthlyInvestment = (value: string) => {
  const num = Math.min(Number(value.replace(/,/g, '')) || 0, MAX_MONTHLY.value)
  monthlyInvestment.value = addComma(String(num))
}

const sliderValue = computed({
  get: () => annualReturn.value ?? 7,
  set: (v: number) => {
    annualReturn.value = v
  },
})

const targetAssetText = computed(() => formatMoneyIn(removeComma(targetAsset.value), baseCurrencySel.value, 'short'))
const monthlyInvestmentText = computed(() => formatMoneyIn(removeComma(monthlyInvestment.value), baseCurrencySel.value, 'short'))

// 월 투자금이 입력된 경우 목표 자산 최소값 (월 투자금 × 12 = 1년치)
const minTargetByMonthly = computed(() => {
  const m = removeComma(monthlyInvestment.value)
  return m > 0 ? m * 12 : 0
})

const targetBelowMinimum = computed(() => {
  const t = removeComma(targetAsset.value)
  return minTargetByMonthly.value > 0 && t > 0 && t < minTargetByMonthly.value
})

// 목표 자산은 현재 보유 자산보다 낮게 설정할 수 없다. asset_summary.current_asset은
// 최초 로드 시점의 기준통화(savedBaseCurrency) 단위로 저장돼 있어, 화면에서 기준통화를
// 바꾸면 현재 환율로 환산해 비교 기준을 맞춘다.
const currentAssetRaw = ref(0)
const currentAssetConverted = ref(0)

const syncCurrentAssetConverted = async () => {
  if (currentAssetRaw.value <= 0) { currentAssetConverted.value = 0; return }
  if (baseCurrencySel.value === savedBaseCurrency) { currentAssetConverted.value = currentAssetRaw.value; return }
  try {
    const rate = await getCachedRate(savedBaseCurrency, baseCurrencySel.value)
    currentAssetConverted.value = Math.round(currentAssetRaw.value * rate)
  } catch {
    currentAssetConverted.value = currentAssetRaw.value
  }
}

const targetBelowCurrentAsset = computed(() => {
  const t = removeComma(targetAsset.value)
  return currentAssetConverted.value > 0 && t > 0 && t < currentAssetConverted.value
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
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  const dateStr = formatYearMonth(date.getFullYear(), date.getMonth() + 1)
  const durationStr = formatDuration(months)
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
  baseCurrencySel.value = goal.base_currency ?? 'KRW'
  savedBaseCurrency = baseCurrencySel.value
  targetAsset.value = addComma(String(goal.target_asset ?? ''))
  monthlyInvestment.value = addComma(String(goal.monthly_investment ?? ''))
  annualReturn.value = Math.max(goal.annual_return ?? 7, 3)

  const summary = await userDataStore.ensureAssetSummary()
  currentAssetRaw.value = summary?.current_asset ?? 0
  await syncCurrentAssetConverted()

  initializing.value = false
}

watch(baseCurrencySel, syncCurrentAssetConverted)

const save = async () => {
  const targetNum = removeComma(targetAsset.value)
  if (!targetAsset.value || targetNum <= 0) {
    showMessage(t('goalSettings.enterTarget'), 'warning')
    return
  }
  if (targetNum < MIN_TARGET.value) {
    showMessage(t('goalSettings.minTargetMsg', { amount: formatMoneyIn(MIN_TARGET.value, baseCurrencySel.value, 'full') }), 'warning')
    return
  }
  if (currentAssetConverted.value > 0 && targetNum < currentAssetConverted.value) {
    showMessage(t('goalSettings.currentAssetBelowMsg', { amount: formatMoneyIn(currentAssetConverted.value, baseCurrencySel.value, 'full') }), 'warning')
    return
  }
  const monthlyNum = removeComma(monthlyInvestment.value)
  if (!monthlyInvestment.value || monthlyNum <= 0) {
    showMessage(t('goalSettings.enterMonthly'), 'warning')
    return
  }
  if (monthlyNum > 0 && targetNum < monthlyNum * 12) {
    showMessage(t('goalSettings.target12x', { amount: formatMoneyIn(monthlyNum * 12, baseCurrencySel.value, 'short') }), 'warning')
    return
  }
  if (annualReturn.value !== null && annualReturn.value < 3) {
    showMessage(t('goalSettings.minReturn'), 'warning')
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
        base_currency: baseCurrencySel.value,
        // 로그인 전 화면에서 고른 언어를 최초 목표 저장 시 함께 기록 (신규 유저 언어 유지)
        locale: locale.value,
      },
      { onConflict: 'user_id' },
    )

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    const baseChanged = baseCurrencySel.value !== savedBaseCurrency
    savedBaseCurrency = baseCurrencySel.value
    setBaseCurrency(baseCurrencySel.value)
    // 기준통화 변경 시 asset_summary를 새 통화로 즉시 재계산 (2-4 정책, 백그라운드)
    if (baseChanged) recomputeAssetSummary(user.id)

    invalidateGoalCache()
    userDataStore.invalidateGoals()
    showMessage(isEditMode.value ? t('goalSettings.savedEdit') : t('goalSettings.savedCreate'), 'success')
    router.push('/dashboard')
  } catch (error) {
    console.error(error)
    showMessage(t('goalSettings.saveError'), 'error')
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
            {{ isEditMode ? $t('goalSettings.editTitle') : $t('goalSettings.createTitle') }}
          </div>
          <div class="text-medium-emphasis mt-1">
            {{ isEditMode ? $t('goalSettings.editSubtitle') : $t('goalSettings.createSubtitle') }}
          </div>
        </div>
      </div>

      <!-- 기준통화 -->
      <div class="glass-card pa-4 mb-3">
        <div class="field-label mb-3">
          <v-icon size="14" class="mr-1">mdi-currency-usd</v-icon>
          {{ $t('goalSettings.baseCurrency') }}
        </div>
        <div class="d-flex ga-2">
          <v-btn
            v-for="opt in currencyOptions"
            :key="opt.value"
            size="small"
            rounded="lg"
            elevation="0"
            :variant="baseCurrencySel === opt.value ? 'flat' : 'tonal'"
            :color="baseCurrencySel === opt.value ? 'primary' : undefined"
            @click="onSelectCurrency(opt.value)"
          >
            {{ $t(opt.labelKey) }}
          </v-btn>
        </div>
        <div class="field-hint mt-2">
          <v-icon size="12">mdi-information-outline</v-icon>
          {{ $t('goalSettings.baseCurrencyHint') }}
        </div>
      </div>

      <!-- 목표 자산 -->
      <div class="glass-card pa-4 mb-3">
        <div class="field-label mb-3">
          <v-icon size="14" class="mr-1">mdi-target</v-icon>
          {{ $t('goalSettings.targetAsset') }} <span class="text-error">*</span>
        </div>
        <v-text-field :model-value="targetAsset" @update:model-value="handleTargetAsset" placeholder="1,000,000,000" variant="outlined" density="comfortable" hide-details :class="['glass-field', (targetBelowMinimum || targetBelowCurrentAsset) ? 'field-error' : '']" maxlength="14">
          <template #append-inner>
            <span class="font-weight-bold" style="color: rgb(var(--v-theme-primary)); white-space: nowrap">
              {{ targetAsset ? targetAssetText : currencyUnit }}
            </span>
          </template>
        </v-text-field>
        <div v-if="targetBelowMinimum" class="field-hint-error mt-2">
          <v-icon size="12">mdi-alert-circle-outline</v-icon>
          <i18n-t keypath="goalSettings.minInputHint" tag="span" scope="global">
            <template #amount><strong>{{ formatMoneyIn(minTargetByMonthly, baseCurrencySel, 'short') }}</strong></template>
          </i18n-t>
        </div>
        <div v-else-if="targetBelowCurrentAsset" class="field-hint-error mt-2">
          <v-icon size="12">mdi-alert-circle-outline</v-icon>
          <i18n-t keypath="goalSettings.currentAssetBelowHint" tag="span" scope="global">
            <template #amount><strong>{{ formatMoneyIn(currentAssetConverted, baseCurrencySel, 'short') }}</strong></template>
          </i18n-t>
        </div>
        <div v-else-if="minTargetByMonthly > 0 && !removeComma(targetAsset)" class="field-hint mt-2">
          <v-icon size="12">mdi-information-outline</v-icon>
          <i18n-t keypath="goalSettings.minRecommendHint" tag="span" scope="global">
            <template #amount><strong>{{ formatMoneyIn(minTargetByMonthly, baseCurrencySel, 'short') }}</strong></template>
          </i18n-t>
        </div>
      </div>

      <!-- 월 투자금 -->
      <div class="glass-card pa-4 mb-3">
        <div class="field-label mb-3">
          <v-icon size="14" class="mr-1">mdi-cash-multiple</v-icon>
          {{ $t('goalSettings.monthlyInvestment') }} <span class="text-error">*</span>
        </div>
        <v-text-field :model-value="monthlyInvestment" @update:model-value="handleMonthlyInvestment" placeholder="3,000,000" variant="outlined" density="comfortable" hide-details class="glass-field" maxlength="13">
          <template #append-inner>
            <span class="font-weight-bold" style="color: rgb(var(--v-theme-primary)); white-space: nowrap">
              {{ monthlyInvestment ? monthlyInvestmentText : currencyUnit }}
            </span>
          </template>
        </v-text-field>
      </div>

      <!-- 연평균 수익률 -->
      <div class="glass-card pa-4 mb-6">
        <div class="d-flex justify-space-between align-center mb-1">
          <div class="field-label">
            <v-icon size="14" class="mr-1">mdi-trending-up</v-icon>
            {{ $t('goalSettings.expectedReturn') }}
          </div>
          <v-chip size="x-small" :color="annualReturn !== null ? 'primary' : 'default'" variant="tonal">
            {{ annualReturn !== null ? annualReturn + '%' : $t('goalSettings.notSet') }}
          </v-chip>
        </div>

        <div class="text-disabled mb-3">{{ $t('goalSettings.sliderHint') }}</div>

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
            <i18n-t keypath="goalSettings.estimateLine" tag="div" class="text-medium-emphasis" scope="global">
              <template #dur><strong :style="{ color: estimatedPreview.tooLong ? 'rgb(var(--v-theme-warning))' : 'rgb(var(--v-theme-primary))' }">{{ estimatedPreview.durationStr }}</strong></template>
              <template #date><strong :style="{ color: estimatedPreview.tooLong ? 'rgb(var(--v-theme-warning))' : 'rgb(var(--v-theme-primary))' }">{{ estimatedPreview.dateStr }}</strong></template>
            </i18n-t>
          </div>
          <div v-if="estimatedPreview.tooLong" class="d-flex align-center ga-1 mt-2 ml-5">
            <v-icon size="12" color="warning">mdi-information-outline</v-icon>
            <span style="color: rgb(var(--v-theme-warning))">
              {{ $t('goalSettings.tooLongWarn') }}
            </span>
          </div>
          <div v-else class="text-disabled mt-1 ml-5">{{ $t('goalSettings.estimateNote') }}</div>
        </template>
      </div>

      <!-- 버튼 -->
      <v-btn color="primary" size="large" rounded="lg" block elevation="0" :loading="loading" class="mb-3" @click="save">
        {{ isEditMode ? $t('goalSettings.editSubmit') : $t('goalSettings.createSubmit') }}
      </v-btn>

      <v-btn variant="tonal" block rounded="lg" style="background: rgba(0, 0, 0, 0.1); color: rgba(var(--v-theme-on-surface), 0.75)" @click="cancel">
        {{ isEditMode ? $t('goalSettings.editCancel') : $t('goalSettings.createCancel') }}
      </v-btn>
    </div>
  </div>

  <!-- 기준통화 변경 → 금액 환산 확인 -->
  <v-dialog v-model="convertDialog" max-width="340" persistent>
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-6">{{ $t('goalSettings.changeCurrencyTitle') }}</v-card-title>
      <v-card-text class="text-center text-medium-emphasis">
        {{ $t('goalSettings.changeCurrencyDesc') }}
        <template v-if="convertPreview && pendingCurrency">
          <i18n-t v-if="removeComma(targetAsset) > 0" keypath="goalSettings.convertRow" tag="div" class="mt-3" scope="global">
            <template #label>{{ $t('goalSettings.targetAsset') }}</template>
            <template #from><strong>{{ targetAssetText }}</strong></template>
            <template #to><strong>{{ formatMoneyIn(convertPreview.target, pendingCurrency, 'short') }}</strong></template>
          </i18n-t>
          <i18n-t v-if="removeComma(monthlyInvestment) > 0" keypath="goalSettings.convertRow" tag="div" class="mt-1" scope="global">
            <template #label>{{ $t('goalSettings.monthlyInvestment') }}</template>
            <template #from><strong>{{ monthlyInvestmentText }}</strong></template>
            <template #to><strong>{{ formatMoneyIn(convertPreview.monthly, pendingCurrency, 'short') }}</strong></template>
          </i18n-t>
        </template>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn variant="text" block @click="cancelConvert">{{ $t('common.cancel') }}</v-btn>
        <v-divider vertical />
        <v-btn variant="text" color="primary" block @click="confirmConvert">{{ $t('goalSettings.change') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
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
