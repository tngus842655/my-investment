<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PortfolioForm, PortfolioAsset } from '@/types/portfolio'

const dialog = defineModel<boolean>()

const props = defineProps<{
  initialData?: PortfolioAsset | null
}>()

const emit = defineEmits<{
  save: [PortfolioForm]
}>()

const isEditMode = computed(() => !!props.initialData)

const ticker = ref('')
const assetType = ref('')
const quantity = ref('')
const avgPrice = ref('')
const currency = ref('KRW')

const assetTypes = ['국내주식', '해외주식', '암호화폐', '현금']
const currencies = ['KRW', 'USD']

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

const currencyLocked = computed(
  () =>
    assetType.value === '해외주식' || assetType.value === '국내주식' || assetType.value === '현금',
)

const currencyHint = computed(() => {
  if (assetType.value === '해외주식') return '해외주식은 USD로 고정됩니다'
  if (assetType.value === '국내주식') return '국내주식은 KRW로 고정됩니다'
  if (assetType.value === '현금') return '현금은 KRW로 고정됩니다'
  return ''
})

watch(assetType, (newType) => {
  if (newType === '해외주식') currency.value = 'USD'
  else if (newType === '국내주식' || newType === '현금') currency.value = 'KRW'
  if (newType === '현금') ticker.value = '-'
  else if (ticker.value === '-') ticker.value = ''
})

watch(dialog, (opened) => {
  if (!opened) return
  if (props.initialData) {
    ticker.value = props.initialData.ticker
    assetType.value = props.initialData.asset_type
    quantity.value = String(props.initialData.quantity)
    avgPrice.value = addComma(String(props.initialData.avg_price))
    currency.value = props.initialData.currency
  } else {
    reset(false)
  }
})

const addComma = (value: string) => {
  const number = value.replace(/[^0-9.]/g, '')
  const parts = number.split('.')
  const int = parts[0] ?? ''
  const dec = parts[1]
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec !== undefined ? `${formatted}.${dec}` : formatted
}

const removeComma = (value: string) => Number(value.replace(/,/g, '')) || 0

const handleAvgPrice = (value: string) => {
  avgPrice.value = addComma(value)
}

const isValid = computed(
  () =>
    assetType.value &&
    (assetType.value === '현금' || ticker.value.trim()) &&
    Number(quantity.value) > 0 &&
    removeComma(avgPrice.value) > 0 &&
    currency.value,
)

const save = () => {
  if (!isValid.value) return
  emit('save', {
    ticker: assetType.value === '현금' ? 'CASH' : ticker.value.trim().toUpperCase(),
    asset_type: assetType.value,
    quantity: Number(quantity.value),
    avg_price: removeComma(avgPrice.value),
    currency: currency.value,
  })
  reset()
}

const close = () => reset()

const reset = (closeDialog = true) => {
  ticker.value = ''
  assetType.value = ''
  quantity.value = ''
  avgPrice.value = ''
  currency.value = 'KRW'
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
        <!-- 1. 자산유형 -->
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

        <!-- 2. 티커 / 종목코드 / 코인코드 -->
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

        <!-- 3. 수량 -->
        <v-text-field
          v-model="quantity"
          label="수량"
          type="number"
          step="0.0001"
          prepend-inner-icon="mdi-counter"
          variant="outlined"
          class="mt-3"
        />

        <!-- 4. 평균단가 -->
        <v-text-field
          :model-value="avgPrice"
          @update:model-value="handleAvgPrice"
          label="평균단가"
          variant="outlined"
          class="mt-3"
          :prepend-inner-icon="currency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'"
        />

        <!-- 5. 통화 -->
        <v-select
          v-model="currency"
          :items="currencies"
          label="통화"
          prepend-inner-icon="mdi-cash"
          variant="outlined"
          class="mt-3"
          :disabled="currencyLocked"
          :hint="currencyHint"
          persistent-hint
        />
      </v-card-text>

      <v-card-actions class="pa-4">
        <v-btn variant="text" @click="close">취소</v-btn>
        <v-spacer />
        <v-btn color="primary" :disabled="!isValid" @click="save">
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
</style>
