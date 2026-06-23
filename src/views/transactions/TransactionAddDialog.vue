<script setup lang="ts">
import { ref, computed, watch } from 'vue'

type TransactionType = 'BUY' | 'SELL'

const dialog = defineModel<boolean>()

const txType = ref<TransactionType>('BUY')
const ticker = ref('')
const assetType = ref('')
const quantity = ref('')
const unitPrice = ref('')
const currency = ref('KRW')
const txDate = ref(new Date().toISOString().slice(0, 10))
const memo = ref('')

const assetTypes = ['국내주식', '해외주식', 'ETF', '암호화폐', '현금']
const currencies = ['KRW', 'USD']

const tickerConfig = computed(() => {
  switch (assetType.value) {
    case '해외주식': return { label: '티커', placeholder: 'AAPL', disabled: false }
    case '국내주식': return { label: '종목코드', placeholder: '005930', disabled: false }
    case 'ETF': return { label: '티커', placeholder: 'VOO', disabled: false }
    case '암호화폐': return { label: '코인 영문코드', placeholder: 'BTC', disabled: false }
    case '현금': return { label: '티커', placeholder: '-', disabled: true }
    default: return { label: '티커', placeholder: '', disabled: false }
  }
})

const currencyLocked = computed(() =>
  ['해외주식', '국내주식', '현금'].includes(assetType.value),
)

const currencyHint = computed(() => {
  if (assetType.value === '해외주식') return '해외주식은 USD로 고정됩니다'
  if (assetType.value === '국내주식') return '국내주식은 KRW로 고정됩니다'
  if (assetType.value === '현금') return '현금은 KRW로 고정됩니다'
  if (assetType.value === '암호화폐') return '업비트 등 KRW 거래소는 KRW, 바이낸스 등은 USD'
  return ''
})

const totalAmount = computed(() => {
  const q = Number(quantity.value)
  const p = removeComma(unitPrice.value)
  if (!q || !p) return null
  return q * p
})

const totalLabel = computed(() => {
  if (!totalAmount.value) return '-'
  const v = totalAmount.value
  if (currency.value === 'USD') {
    return '$' + (v % 1 === 0
      ? v.toLocaleString('en-US')
      : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }
  if (v >= 100000000) {
    const eok = Math.floor(v / 100000000)
    const rem = Math.round((v % 100000000) / 10000000)
    return rem > 0 ? `${eok}억 ${rem}천만원` : `${eok}억원`
  }
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만원`
  return `${Math.round(v).toLocaleString()}원`
})

const isValid = computed(() =>
  assetType.value &&
  (assetType.value === '현금' || ticker.value.trim()) &&
  Number(quantity.value) > 0 &&
  removeComma(unitPrice.value) > 0 &&
  txDate.value,
)

watch(assetType, (newType) => {
  if (newType === '해외주식') currency.value = 'USD'
  else if (['국내주식', '현금'].includes(newType)) currency.value = 'KRW'
  if (newType === '현금') ticker.value = '-'
  else if (ticker.value === '-') ticker.value = ''
})

watch(dialog, (opened) => {
  if (opened) reset(false)
})

const addComma = (v: string) => {
  const num = v.replace(/[^0-9.]/g, '')
  const parts = num.split('.')
  const int = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts[1] !== undefined ? `${int}.${parts[1]}` : int
}

const removeComma = (v: string) => Number(v.replace(/,/g, '')) || 0

const handleUnitPrice = (v: string) => { unitPrice.value = addComma(v) }

const save = () => {
  if (!isValid.value) return
  // emit 예정 — 현재는 디자인 초안
  reset()
}

const reset = (closeDialog = true) => {
  txType.value = 'BUY'
  ticker.value = ''
  assetType.value = ''
  quantity.value = ''
  unitPrice.value = ''
  currency.value = 'KRW'
  txDate.value = new Date().toISOString().slice(0, 10)
  memo.value = ''
  if (closeDialog) dialog.value = false
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="480">
    <v-card rounded="xl" class="glass-dialog" style="overflow: hidden">
      <!-- 컬러 헤더 -->
      <div class="dialog-header" :class="txType === 'BUY' ? 'header-buy' : 'header-sell'">
        <div class="header-eyebrow">거래 추가</div>
        <!-- BUY / SELL 대형 토글 -->
        <div class="type-toggle mt-3">
          <button
            class="toggle-btn"
            :class="{ 'toggle-active-buy': txType === 'BUY' }"
            @click="txType = 'BUY'"
          >
            <v-icon size="16" class="mr-1">mdi-arrow-down-bold</v-icon>
            매수
          </button>
          <button
            class="toggle-btn"
            :class="{ 'toggle-active-sell': txType === 'SELL' }"
            @click="txType = 'SELL'"
          >
            <v-icon size="16" class="mr-1">mdi-arrow-up-bold</v-icon>
            매도
          </button>
        </div>
      </div>

      <v-card-text class="pt-4 pb-2">
        <!-- 자산유형 -->
        <v-select
          v-model="assetType"
          :items="assetTypes"
          label="자산유형"
          prepend-inner-icon="mdi-shape"
          variant="outlined"
          density="comfortable"
          rounded="lg"
        />

        <!-- 티커 -->
        <v-text-field
          v-model="ticker"
          :label="tickerConfig.label"
          :placeholder="tickerConfig.placeholder"
          :disabled="tickerConfig.disabled"
          prepend-inner-icon="mdi-finance"
          variant="outlined"
          density="comfortable"
          rounded="lg"
          class="mt-3"
        />

        <!-- 수량 + 단가 (2열) -->
        <div class="two-col mt-3">
          <v-text-field
            v-model="quantity"
            label="수량"
            type="number"
            step="0.0001"
            prepend-inner-icon="mdi-counter"
            variant="outlined"
            density="comfortable"
            rounded="lg"
          />
          <v-text-field
            :model-value="unitPrice"
            @update:model-value="handleUnitPrice"
            label="거래단가"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            :prepend-inner-icon="currency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'"
          />
        </div>

        <!-- 통화 -->
        <v-select
          v-model="currency"
          :items="currencies"
          label="통화"
          prepend-inner-icon="mdi-cash"
          variant="outlined"
          density="comfortable"
          rounded="lg"
          class="mt-3"
          :disabled="currencyLocked"
          :hint="currencyHint"
          persistent-hint
        />

        <!-- 거래일 -->
        <v-text-field
          v-model="txDate"
          label="거래일"
          type="date"
          prepend-inner-icon="mdi-calendar-outline"
          variant="outlined"
          density="comfortable"
          rounded="lg"
          class="mt-3"
        />

        <!-- 메모 -->
        <v-text-field
          v-model="memo"
          label="메모 (선택)"
          placeholder="예: 분할매수, 목표가 도달"
          prepend-inner-icon="mdi-note-text-outline"
          variant="outlined"
          density="comfortable"
          rounded="lg"
          class="mt-3"
          maxlength="50"
        />

        <!-- 합계 프리뷰 -->
        <div v-if="totalAmount" class="total-preview mt-3" :class="txType === 'BUY' ? 'preview-buy' : 'preview-sell'">
          <span class="total-label">총 {{ txType === 'BUY' ? '매수' : '매도' }}금액</span>
          <span class="total-value">{{ totalLabel }}</span>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-btn variant="text" @click="reset()">취소</v-btn>
        <v-spacer />
        <v-btn
          :color="txType === 'BUY' ? 'teal' : 'error'"
          :disabled="!isValid"
          variant="flat"
          rounded="lg"
          @click="save"
        >
          <v-icon start size="16">{{ txType === 'BUY' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold' }}</v-icon>
          {{ txType === 'BUY' ? '매수 저장' : '매도 저장' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.glass-dialog {
  background: rgb(var(--v-theme-surface)) !important;
  border: 1px solid rgba(0, 0, 0, 0.07) !important;
}
.v-theme--dark .glass-dialog {
  background: rgba(13, 46, 45, 0.97) !important;
  border-color: rgba(79, 200, 194, 0.2) !important;
}

/* ── 컬러 헤더 ── */
.dialog-header {
  padding: 24px 24px 20px;
  transition: background 0.25s ease;
}
.header-buy {
  background: linear-gradient(135deg, rgba(0, 150, 136, 0.12) 0%, rgba(0, 150, 136, 0.04) 100%);
  border-bottom: 1px solid rgba(0, 150, 136, 0.15);
}
.header-sell {
  background: linear-gradient(135deg, rgba(211, 47, 47, 0.1) 0%, rgba(211, 47, 47, 0.03) 100%);
  border-bottom: 1px solid rgba(211, 47, 47, 0.15);
}
.v-theme--dark .header-buy {
  background: linear-gradient(135deg, rgba(0, 150, 136, 0.2) 0%, rgba(0, 150, 136, 0.06) 100%);
}
.v-theme--dark .header-sell {
  background: linear-gradient(135deg, rgba(211, 47, 47, 0.18) 0%, rgba(211, 47, 47, 0.05) 100%);
}

.header-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

/* ── BUY/SELL 토글 ── */
.type-toggle {
  display: flex;
  gap: 8px;
}
.toggle-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
  border-radius: 12px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.1);
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.45);
  cursor: pointer;
  transition: all 0.18s ease;
}
.toggle-active-buy {
  background: rgba(0, 150, 136, 0.12);
  border-color: #009688;
  color: #009688;
}
.toggle-active-sell {
  background: rgba(211, 47, 47, 0.1);
  border-color: #d32f2f;
  color: #d32f2f;
}
.v-theme--dark .toggle-active-buy {
  background: rgba(0, 150, 136, 0.2);
}
.v-theme--dark .toggle-active-sell {
  background: rgba(211, 47, 47, 0.18);
}

/* ── 2열 레이아웃 ── */
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* ── 합계 프리뷰 ── */
.total-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 12px;
}
.preview-buy {
  background: rgba(0, 150, 136, 0.08);
  border: 1px solid rgba(0, 150, 136, 0.2);
}
.preview-sell {
  background: rgba(211, 47, 47, 0.07);
  border: 1px solid rgba(211, 47, 47, 0.18);
}
.total-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.total-value {
  font-size: 16px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
</style>
