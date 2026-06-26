<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PortfolioAsset } from '@/types/portfolio'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { TICKER_NAMES } from '@/utils/tickerNames'
import { getStockPrice } from '@/services/market'

const dialog = defineModel<boolean>()

const props = defineProps<{
  initialData?: PortfolioAsset | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const isEditMode = computed(() => !!props.initialData)

const ticker = ref('')
const assetType = ref('')
const currency = ref('KRW')
const initQuantity = ref('')
const initAvgPrice = ref('')
const saving = ref(false)
const loadingInitial = ref(false)
const existingInitialTxId = ref<string | null>(null)

const assetTypes = ['국내주식', '해외주식', '암호화폐', '현금']

const tickerConfig = computed(() => {
  switch (assetType.value) {
    case '해외주식':
      return { label: '티커', placeholder: 'AAPL', disabled: false }
    case '국내주식':
      return { label: '종목코드', placeholder: '005930', disabled: false }
    case '암호화폐':
      return { label: '코인 영문코드', placeholder: 'BTC', disabled: false }
    case '현금':
      return { label: '티커', placeholder: '-', disabled: true }
    default:
      return { label: '티커', placeholder: '', disabled: false }
  }
})

const currencyLocked = computed(() =>
  ['해외주식', '국내주식'].includes(assetType.value) || (isEditMode.value && assetType.value === '현금'),
)

const currencyHint = computed(() => {
  if (assetType.value === '해외주식') return '해외주식은 USD로 고정됩니다'
  if (assetType.value === '국내주식') return '국내주식은 KRW로 고정됩니다'
  if (assetType.value === '현금' && isEditMode.value) return '현금 통화는 수정할 수 없습니다'
  if (assetType.value === '현금') return '원화(KRW)와 달러(USD) 현금은 각각 따로 관리됩니다'
  if (assetType.value === '암호화폐') return '업비트 등 KRW 거래소는 KRW, 바이낸스 등은 USD'
  return ''
})

const hasInitialHolding = computed(
  () => Number(initQuantity.value) > 0 && removeComma(initAvgPrice.value) > 0,
)

const totalInitialAmount = computed(() => {
  const q = Number(initQuantity.value)
  const p = removeComma(initAvgPrice.value)
  if (!q || !p) return null
  const v = q * p
  if (currency.value === 'USD') {
    return (
      '$' +
      (v % 1 === 0
        ? v.toLocaleString('en-US')
        : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    )
  }
  if (v >= 100000000) return `${Math.floor(v / 100000000)}억원`
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만원`
  return `${Math.round(v).toLocaleString()}원`
})

// 수정 모드 진입 시 INITIAL 거래 로드
const loadInitialTx = async (portfolioId: string) => {
  loadingInitial.value = true
  try {
    const { data } = await supabase
      .from('transactions')
      .select('id, quantity, unit_price')
      .eq('portfolio_id', portfolioId)
      .eq('transaction_type', 'INITIAL')
      .maybeSingle()

    if (data) {
      existingInitialTxId.value = data.id
      initQuantity.value = String(data.quantity)
      initAvgPrice.value = addComma(String(data.unit_price))
    } else {
      existingInitialTxId.value = null
      initQuantity.value = ''
      initAvgPrice.value = ''
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingInitial.value = false
  }
}

watch(assetType, (newType) => {
  if (isEditMode.value) return
  if (newType === '해외주식') currency.value = 'USD'
  else if (newType === '국내주식') currency.value = 'KRW'
  else if (newType === '현금') currency.value = 'KRW'
  if (newType === '현금') {
    ticker.value = '-'
    initQuantity.value = '1'
  } else {
    if (ticker.value === '-') ticker.value = ''
    if (initQuantity.value === '1') initQuantity.value = ''
  }
})

watch(dialog, async (opened) => {
  if (!opened) return
  if (props.initialData) {
    ticker.value = props.initialData.ticker
    assetType.value = props.initialData.asset_type
    currency.value = props.initialData.currency
    await loadInitialTx(props.initialData.id)
  } else {
    reset(false)
  }
})

const isCrypto = computed(() => assetType.value === '암호화폐')
const maxPrice = computed(() => {
  if (isCrypto.value) return 999_999_999               // 암호화폐: 10억 KRW
  if (assetType.value === '해외주식') return 1_000_000  // 해외주식: $100만 USD
  if (assetType.value === '현금') return 10_000_000_000 // 현금: 100억 KRW/USD
  return 100_000_000                                    // 국내주식: 1억 KRW
})
const maxQuantity = computed(() => isCrypto.value ? 99_999_999 : 100_000)      // 암호화폐 1억 / 주식·현금 10만

const maxQuantityDigits = computed(() => String(maxQuantity.value).length + 2)
const maxPriceDigits = computed(() => String(Math.floor(maxPrice.value)).length + 2)

const addComma = (v: string) => {
  const num = v.replace(/[^0-9.]/g, '')
  const parts = num.split('.')
  const formatted = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (parts[1] !== undefined) return `${formatted}.${parts[1].slice(0, 8)}`
  return formatted
}
const removeComma = (v: string) => Number(v.replace(/,/g, '')) || 0

const handleQuantity = (v: string) => {
  const intPart = (v.split('.')[0] ?? '').replace(/[^0-9]/g, '')
  if (/^0\d/.test(intPart)) return
  if (intPart.length > maxQuantityDigits.value) return
  initQuantity.value = v
}

const handleAvgPrice = (v: string) => {
  const intPart = v.replace(/[^0-9.]/g, '').split('.')[0] ?? ''
  if (/^0\d/.test(intPart)) return
  if (intPart.length > maxPriceDigits.value) return
  initAvgPrice.value = addComma(v)
}

const tickerMaxLength = computed(() => {
  if (assetType.value === '해외주식') return 5
  if (assetType.value === '국내주식') return 6
  return 10  // 암호화폐
})

const tickerError = computed(() => {
  if (!ticker.value.trim() || assetType.value === '현금') return ''
  if (ticker.value.trim().length > tickerMaxLength.value) return `티커는 ${tickerMaxLength.value}자 이하로 입력해주세요.`
  if (assetType.value === '국내주식' && !/^\d{6}$/.test(ticker.value.trim())) return '국내주식 종목코드는 6자리 숫자입니다. (예: 005930)'
  if (assetType.value === '해외주식' && !/^[A-Za-z]{1,5}$/.test(ticker.value.trim())) return '해외주식 티커는 영문자 5자 이하로 입력해주세요. (예: AAPL)'
  return ''
})

const quantityError = computed(() => {
  const q = Number(initQuantity.value)
  if (initQuantity.value && q <= 0) return '수량은 0보다 커야 합니다.'
  if (initQuantity.value && q > maxQuantity.value) return `수량은 ${maxQuantity.value.toLocaleString()} 이하로 입력해주세요.`
  const dec = String(initQuantity.value).split('.')[1] ?? ''
  if (dec.length > 8) return '소수점 8자리까지 입력 가능합니다.'
  return ''
})

const avgPriceError = computed(() => {
  const p = removeComma(initAvgPrice.value)
  if (initAvgPrice.value && p <= 0) return '단가는 0보다 커야 합니다.'
  if (initAvgPrice.value && p > maxPrice.value) {
    const unit = assetType.value === '해외주식' ? '$' : ''
    const suffix = assetType.value === '해외주식' ? '' : '원'
    return `단가는 ${unit}${maxPrice.value.toLocaleString()}${suffix} 이하로 입력해주세요.`
  }
  return ''
})

const isValid = computed(
  () =>
    assetType.value &&
    (assetType.value === '현금' || (ticker.value.trim() && !tickerError.value)) &&
    currency.value &&
    !quantityError.value &&
    !avgPriceError.value,
)

const save = async () => {
  if (!isValid.value) return
  if (!isEditMode.value && assetType.value !== '현금') {
    const t = ticker.value.trim().toUpperCase()
    if (assetType.value === '해외주식') {
      saving.value = true
      try {
        await getStockPrice(t, '해외주식', 'USD')
      } catch {
        showMessage('유효하지 않은 티커입니다. 티커를 다시 확인해주세요.', 'error')
        saving.value = false
        return
      }
    } else if (!TICKER_NAMES[t]) {
      const label = assetType.value === '국내주식' ? '종목코드' : '코인 영문코드'
      showMessage(`등록되지 않은 ${label}입니다. 다시 확인해주세요.`, 'error')
      return
    }
  }
  saving.value = true
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      showMessage('로그인이 필요합니다.', 'error')
      return
    }

    if (isEditMode.value && props.initialData) {
      // 통화 수정
      const { error } = await supabase
        .from('portfolios')
        .update({ currency: currency.value })
        .eq('id', props.initialData.id)
      if (error) throw error

      // INITIAL 거래 수정 또는 신규 생성
      if (hasInitialHolding.value) {
        const isUsd = currency.value === 'USD'
        const exchangeRate = isUsd ? await getCachedExchangeRate() : null

        if (existingInitialTxId.value) {
          // 기존 INITIAL 업데이트
          const { error: txError } = await supabase
            .from('transactions')
            .update({
              quantity: Number(initQuantity.value),
              unit_price: removeComma(initAvgPrice.value),
              ...(isUsd && { exchange_rate: exchangeRate }),
            })
            .eq('id', existingInitialTxId.value)
          if (txError) throw txError
        } else {
          // INITIAL 없으면 새로 생성
          const { error: txError } = await supabase.from('transactions').insert({
            user_id: user.id,
            portfolio_id: props.initialData.id,
            transaction_type: 'INITIAL',
            quantity: Number(initQuantity.value),
            unit_price: removeComma(initAvgPrice.value),
            transaction_date: new Date().toISOString().slice(0, 10),
            exchange_rate: exchangeRate,
          })
          if (txError) throw txError
        }
      } else if (existingInitialTxId.value) {
        // 수량/단가 비우면 INITIAL 거래 삭제
        const { error: txError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', existingInitialTxId.value)
        if (txError) throw txError
      }

      showMessage('자산이 수정되었습니다.', 'success')
    } else {
      // 신규 포트폴리오 등록
      const tickerToSave =
        assetType.value === '현금'
          ? currency.value === 'USD'
            ? 'CASH_USD'
            : 'CASH_KRW'
          : ticker.value.trim().toUpperCase()
      const { data: existing } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', user.id)
        .eq('ticker', tickerToSave)
        .maybeSingle()
      if (existing) {
        const label =
          assetType.value === '현금'
            ? currency.value === 'USD'
              ? '현금(달러)'
              : '현금(원화)'
            : tickerToSave
        const suffix =
          assetType.value === '현금'
            ? '이 이미 등록되어 있습니다.'
            : ' 종목이 이미 등록되어 있습니다.'
        showMessage(`${label}${suffix}`, 'warning')
        saving.value = false
        return
      }

      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .insert({
          user_id: user.id,
          ticker: tickerToSave,
          asset_type: assetType.value,
          currency: currency.value,
          quantity: 0,
          avg_price: 0,
        })
        .select('id')
        .single()
      if (portfolioError) throw portfolioError

      // 초기 잔고 입력 시 INITIAL 거래로 저장
      if (hasInitialHolding.value) {
        const isUsd = currency.value === 'USD'
        const exchangeRate = isUsd ? await getCachedExchangeRate() : null
        const { error: txError } = await supabase.from('transactions').insert({
          user_id: user.id,
          portfolio_id: portfolio.id,
          transaction_type: 'INITIAL',
          quantity: Number(initQuantity.value),
          unit_price: removeComma(initAvgPrice.value),
          transaction_date: new Date().toISOString().slice(0, 10),
          exchange_rate: exchangeRate,
        })
        if (txError) throw txError
      }

      showMessage('자산이 등록되었습니다.', 'success')
    }

    emit('saved')
    reset()
  } catch (e) {
    console.error(e)
    showMessage('저장 중 오류가 발생했습니다.', 'error')
  } finally {
    saving.value = false
  }
}

const reset = (closeDialog = true) => {
  ticker.value = ''
  assetType.value = ''
  currency.value = 'KRW'
  initQuantity.value = ''
  initAvgPrice.value = ''
  existingInitialTxId.value = null
  if (closeDialog) dialog.value = false
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-h5 font-weight-bold py-4">
        {{ isEditMode ? '자산 수정' : '자산 추가' }}
      </v-card-title>

      <v-card-text>
        <!-- 자산유형 -->
        <v-select
          v-model="assetType"
          :items="assetTypes"
          label="자산유형"
          prepend-inner-icon="mdi-shape"
          variant="outlined"
          :disabled="isEditMode"
          :hint="isEditMode ? '자산유형은 수정할 수 없습니다.' : ''"
          persistent-hint
        />

        <!-- 티커 -->
        <v-text-field
          v-model="ticker"
          :label="tickerConfig.label"
          :placeholder="tickerConfig.placeholder"
          :disabled="tickerConfig.disabled || isEditMode"
          prepend-inner-icon="mdi-finance"
          variant="outlined"
          class="mt-3"
          :maxlength="tickerMaxLength"
          :hint="isEditMode && assetType !== '현금' ? '티커/코드는 수정할 수 없습니다.' : ''"
          :error-messages="!isEditMode ? tickerError : ''"
          persistent-hint
        />

        <!-- 통화 -->
        <v-select
          v-model="currency"
          :items="['KRW', 'USD']"
          label="통화"
          prepend-inner-icon="mdi-cash"
          variant="outlined"
          class="mt-3"
          :disabled="currencyLocked"
          :hint="currencyHint"
          persistent-hint
        />

        <!-- 초기 잔고 섹션 -->
        <div class="section-divider my-4">
          <span>초기 잔고 <span class="optional-label">(거래 기록 이전 보유량)</span></span>
        </div>

        <div class="info-banner mb-3">
          <v-icon size="14" color="primary" class="mr-1 flex-shrink-0"
            >mdi-information-outline</v-icon
          >
          <span class="text-caption">
            {{
              isEditMode
                ? '매수·매도 거래 이전에 이미 보유하던 수량/단가입니다. 수정 시 이후 거래와 합산해 재계산됩니다.'
                : '앱 사용 전부터 보유하던 수량/단가를 입력하세요. 이후 매수·매도 거래와 합산됩니다.'
            }}
          </span>
        </div>

        <v-progress-linear
          v-if="loadingInitial"
          indeterminate
          color="primary"
          class="mb-3"
          rounded
        />

        <template v-if="assetType === '현금'">
          <v-text-field
            :model-value="initAvgPrice"
            @update:model-value="handleAvgPrice"
            label="보유금액"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            :prepend-inner-icon="currency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'"
            placeholder="0"
            :suffix="currency === 'USD' ? 'USD' : '원'"
            :disabled="loadingInitial"
            :error-messages="avgPriceError"
          />
        </template>
        <template v-else>
          <div class="two-col">
            <v-text-field
              :model-value="initQuantity"
              @update:model-value="handleQuantity"
              label="보유수량"
              type="number"
              step="0.0001"
              min="0"
              :max="maxQuantity"
              prepend-inner-icon="mdi-counter"
              variant="outlined"
              density="comfortable"
              rounded="lg"
              placeholder="0"
              :disabled="loadingInitial"
              :error-messages="quantityError"
            />
            <v-text-field
              :model-value="initAvgPrice"
              @update:model-value="handleAvgPrice"
              label="평균단가"
              variant="outlined"
              density="comfortable"
              rounded="lg"
              :prepend-inner-icon="currency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'"
              placeholder="0"
              :disabled="loadingInitial"
              :error-messages="avgPriceError"
            />
          </div>
        </template>

        <!-- 합계 프리뷰 -->
        <div v-if="totalInitialAmount && assetType !== '현금'" class="total-preview mt-1">
          <span class="total-label">매수 총금액</span>
          <span class="total-value">{{ totalInitialAmount }}</span>
        </div>
      </v-card-text>

      <v-card-actions class="pa-4">
        <v-btn variant="text" :disabled="saving" @click="reset()">취소</v-btn>
        <v-spacer />
        <v-btn color="primary" :disabled="!isValid" :loading="saving" @click="save">
          {{ isEditMode ? '수정' : '저장' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.glass-dialog {
  background: rgba(255, 255, 255, 0.88) !important;
  border: 1px solid rgba(255, 255, 255, 0.95) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
}
.v-theme--dark .glass-dialog {
  background: rgba(8, 15, 30, 0.92) !important;
  border-color: rgba(79, 200, 194, 0.2) !important;
}

.section-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.section-divider::before,
.section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(var(--v-theme-on-surface), 0.1);
}
.optional-label {
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.35);
}

.info-banner {
  display: flex;
  align-items: flex-start;
  background: rgba(var(--v-theme-primary), 0.07);
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 10px;
  padding: 10px 12px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.total-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.07);
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
}
.total-label {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.total-value {
  font-size: 15px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
</style>
