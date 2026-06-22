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

// 수정 모드 여부
const isEditMode = computed(() => !!props.initialData)

const ticker = ref('')
const assetType = ref('')
const quantity = ref('')
const avgPrice = ref('')
const currency = ref('KRW')

const assetTypes = ['국내주식', '해외주식', 'ETF', '암호화폐', '현금']
const currencies = ['KRW', 'USD']

// ── 다이얼로그가 열릴 때 초기값 세팅 ──────────────
watch(dialog, (opened) => {
  if (!opened) return
  if (props.initialData) {
    ticker.value = props.initialData.ticker
    assetType.value = props.initialData.asset_type
    quantity.value = String(props.initialData.quantity)
    avgPrice.value = addComma(String(props.initialData.avg_price))
    currency.value = props.initialData.currency
  } else {
    reset(false) // 추가 모드면 초기화
  }
})

// ── 포맷 유틸 ─────────────────────────────────────
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

// ── 유효성 ────────────────────────────────────────
const isValid = computed(
  () =>
    ticker.value.trim() &&
    assetType.value &&
    Number(quantity.value) > 0 &&
    removeComma(avgPrice.value) > 0 &&
    currency.value,
)

// ── 저장 ─────────────────────────────────────────
const save = () => {
  if (!isValid.value) return

  emit('save', {
    ticker: ticker.value.trim().toUpperCase(),
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
    <v-card rounded="xl">
      <v-card-title class="text-h5 font-weight-bold py-4">
        {{ isEditMode ? '자산 수정' : '자산 추가' }}
      </v-card-title>

      <v-card-text>
        <v-text-field
          v-model="ticker"
          label="티커"
          placeholder="QQQM"
          prepend-inner-icon="mdi-finance"
          variant="outlined"
          :disabled="isEditMode"
          :hint="isEditMode ? '티커는 수정할 수 없습니다.' : ''"
          persistent-hint
        />

        <v-select
          v-model="assetType"
          :items="assetTypes"
          label="자산유형"
          prepend-inner-icon="mdi-shape"
          variant="outlined"
          class="mt-2"
        />

        <v-text-field
          v-model="quantity"
          label="수량"
          type="number"
          step="0.0001"
          prepend-inner-icon="mdi-counter"
          variant="outlined"
          class="mt-2"
        />

        <v-text-field
          :model-value="avgPrice"
          @update:model-value="handleAvgPrice"
          label="평균단가"
          variant="outlined"
          class="mt-2"
          :prepend-inner-icon="currency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'"
        />

        <v-select
          v-model="currency"
          :items="currencies"
          label="통화"
          prepend-inner-icon="mdi-cash"
          variant="outlined"
          class="mt-2"
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
