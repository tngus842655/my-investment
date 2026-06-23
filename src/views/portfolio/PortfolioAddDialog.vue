<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PortfolioAsset } from '@/types/portfolio'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

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

const assetTypes = ['국내주식', '해외주식', 'ETF', '암호화폐', '현금']

const tickerConfig = computed(() => {
  switch (assetType.value) {
    case '해외주식': return { label: '티커', placeholder: 'AAPL', disabled: false }
    case '국내주식': return { label: '종목코드', placeholder: '005930', disabled: false }
    case 'ETF':     return { label: '티커', placeholder: 'VOO', disabled: false }
    case '암호화폐': return { label: '코인 영문코드', placeholder: 'BTC', disabled: false }
    case '현금':    return { label: '티커', placeholder: '-', disabled: true }
    default:        return { label: '티커', placeholder: '', disabled: false }
  }
})

const currencyLocked = computed(() =>
  ['해외주식', '국내주식', '현금', 'ETF'].includes(assetType.value),
)

const currencyHint = computed(() => {
  if (assetType.value === '해외주식' || assetType.value === 'ETF') return '해외주식/ETF는 USD로 고정됩니다'
  if (assetType.value === '국내주식') return '국내주식은 KRW로 고정됩니다'
  if (assetType.value === '현금') return '현금은 KRW로 고정됩니다'
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
    return '$' + (v % 1 === 0 ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }
  if (v >= 100000000) return `${Math.floor(v / 100000000)}억원`
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만원`
  return `${Math.round(v).toLocaleString()}원`
})

watch(assetType, (newType) => {
  if (newType === '해외주식' || newType === 'ETF') currency.value = 'USD'
  else if (['국내주식', '현금'].includes(newType)) currency.value = 'KRW'
  if (newType === '현금') ticker.value = '-'
  else if (ticker.value === '-') ticker.value = ''
})

watch(dialog, (opened) => {
  if (!opened) return
  if (props.initialData) {
    ticker.value = props.initialData.ticker
    assetType.value = props.initialData.asset_type
    currency.value = props.initialData.currency
  } else {
    reset(false)
  }
})

const addComma = (v: string) => {
  const num = v.replace(/[^0-9.]/g, '')
  const parts = num.split('.')
  const int = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts[1] !== undefined ? `${int}.${parts[1]}` : int
}
const removeComma = (v: string) => Number(v.replace(/,/g, '')) || 0
const handleAvgPrice = (v: string) => { initAvgPrice.value = addComma(v) }

const isValid = computed(() =>
  assetType.value &&
  (assetType.value === '현금' || ticker.value.trim()) &&
  currency.value,
)

const save = async () => {
  if (!isValid.value) return
  saving.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { showMessage('로그인이 필요합니다.', 'error'); return }

    if (isEditMode.value && props.initialData) {
      const { error } = await supabase
        .from('portfolios')
        .update({ currency: currency.value })
        .eq('id', props.initialData.id)
      if (error) throw error
      showMessage('자산이 수정되었습니다.', 'success')
    } else {
      // 1. 포트폴리오 등록
      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .insert({
          user_id: user.id,
          ticker: assetType.value === '현금' ? 'CASH' : ticker.value.trim().toUpperCase(),
          asset_type: assetType.value,
          currency: currency.value,
          quantity: 0,
          avg_price: 0,
        })
        .select('id')
        .single()
      if (portfolioError) throw portfolioError

      // 2. 초기 잔고 입력 시 INITIAL 거래로 저장
      if (hasInitialHolding.value) {
        const { error: txError } = await supabase.from('transactions').insert({
          user_id: user.id,
          portfolio_id: portfolio.id,
          transaction_type: 'INITIAL',
          quantity: Number(initQuantity.value),
          unit_price: removeComma(initAvgPrice.value),
          transaction_date: new Date().toISOString().slice(0, 10),
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
          :hint="isEditMode && assetType !== '현금' ? '티커/코드는 수정할 수 없습니다.' : ''"
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

        <!-- 현재 보유 입력 (신규 등록 시에만) -->
        <template v-if="!isEditMode">
          <div class="section-divider my-4">
            <span>현재 보유 잔고 <span class="optional-label">(선택)</span></span>
          </div>

          <div class="info-banner mb-3">
            <v-icon size="14" color="primary" class="mr-1 flex-shrink-0">mdi-information-outline</v-icon>
            <span class="text-caption">이미 보유 중인 수량/단가를 입력하면 자산에 반영됩니다. 거래내역에는 표시되지 않습니다.</span>
          </div>

          <div class="two-col">
            <v-text-field
              v-model="initQuantity"
              label="보유수량"
              type="number"
              step="0.0001"
              prepend-inner-icon="mdi-counter"
              variant="outlined"
              density="comfortable"
              rounded="lg"
              placeholder="0"
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
            />
          </div>

          <!-- 합계 프리뷰 -->
          <div v-if="totalInitialAmount" class="total-preview mt-1">
            <span class="total-label">평가금액</span>
            <span class="total-value">{{ totalInitialAmount }}</span>
          </div>
        </template>
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
  background: rgba(13, 46, 45, 0.92) !important;
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
