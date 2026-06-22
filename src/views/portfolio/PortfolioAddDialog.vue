<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PortfolioForm } from '@/types/portfolio'

const dialog = defineModel<boolean>()

const emit = defineEmits<{
  save: [PortfolioForm]
}>()

const ticker = ref('')
const assetType = ref('')
const quantity = ref('')
const avgPrice = ref('')
const currency = ref('KRW')

const assetTypes = ['국내주식', '해외주식', 'ETF', '암호화폐', '현금']

const currencies = ['KRW', 'USD']

const addComma = (value: string) => {
  const number = value.replace(/[^0-9]/g, '')

  return number.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const removeComma = (value: string) => {
  return Number(value.replace(/,/g, '')) || 0
}

const handleAvgPrice = (value: string) => {
  avgPrice.value = addComma(value)
}

const isValid = computed(() => {
  return (
    ticker.value.trim() &&
    assetType.value &&
    Number(quantity.value) > 0 &&
    removeComma(avgPrice.value) > 0 &&
    currency.value
  )
})

const save = () => {
  if (!isValid.value) {
    return
  }

  emit('save', {
    ticker: ticker.value.trim().toUpperCase(),
    asset_type: assetType.value,
    quantity: Number(quantity.value),
    avg_price: removeComma(avgPrice.value),
    currency: currency.value,
  })

  reset()
}

const close = () => {
  reset()
}

const reset = () => {
  ticker.value = ''
  assetType.value = ''
  quantity.value = ''
  avgPrice.value = ''
  currency.value = 'KRW'

  dialog.value = false
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card rounded="xl">
      <v-card-title class="text-h5 font-weight-bold py-4"> 자산 추가 </v-card-title>

      <v-card-text>
        <v-text-field
          v-model="ticker"
          label="티커"
          placeholder="QQQM"
          prepend-inner-icon="mdi-finance"
          variant="outlined"
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
        <v-btn variant="text" @click="close"> 취소 </v-btn>
        <v-spacer />
        <v-btn color="primary" :disabled="!isValid" @click="save"> 저장 </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
