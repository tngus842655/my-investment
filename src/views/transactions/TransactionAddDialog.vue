<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

type TransactionType = 'BUY' | 'SELL'

export interface TransactionForm {
  portfolio_id: string
  transaction_type: TransactionType
  quantity: number
  unit_price: number
  transaction_date: string
  memo?: string
}

interface Portfolio {
  id: string
  ticker: string
  asset_type: string
  currency: string
}

const dialog = defineModel<boolean>()

const props = defineProps<{
  initialData?: {
    id: string
    portfolio_id: string
    transaction_type: TransactionType
    quantity: number
    unit_price: number
    transaction_date: string
    memo?: string
  } | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const isEditMode = computed(() => !!props.initialData)

const portfolios = ref<Portfolio[]>([])
const loadingPortfolios = ref(false)

const txType = ref<TransactionType>('BUY')
const selectedPortfolioId = ref('')
const quantity = ref('')
const unitPrice = ref('')
const txDate = ref(new Date().toISOString().slice(0, 10))
const memo = ref('')
const saving = ref(false)

const selectedPortfolio = computed(() =>
  portfolios.value.find((p) => p.id === selectedPortfolioId.value) ?? null,
)

const portfolioItems = computed(() =>
  portfolios.value.map((p) => ({
    title: `${p.ticker} · ${p.asset_type}`,
    value: p.id,
  })),
)

const totalAmount = computed(() => {
  const q = Number(quantity.value)
  const p = removeComma(unitPrice.value)
  if (!q || !p) return null
  return q * p
})

const totalLabel = computed(() => {
  if (!totalAmount.value || !selectedPortfolio.value) return '-'
  const v = totalAmount.value
  const cur = selectedPortfolio.value.currency
  if (cur === 'USD') {
    return (
      '$' +
      (v % 1 === 0
        ? v.toLocaleString('en-US')
        : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    )
  }
  if (v >= 100000000) {
    const eok = Math.floor(v / 100000000)
    const rem = Math.round((v % 100000000) / 10000000)
    return rem > 0 ? `${eok}억 ${rem}천만원` : `${eok}억원`
  }
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만원`
  return `${Math.round(v).toLocaleString()}원`
})

const isValid = computed(
  () =>
    selectedPortfolioId.value &&
    Number(quantity.value) > 0 &&
    removeComma(unitPrice.value) > 0 &&
    txDate.value,
)

const addComma = (v: string) => {
  const num = v.replace(/[^0-9.]/g, '')
  const parts = num.split('.')
  const int = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts[1] !== undefined ? `${int}.${parts[1]}` : int
}
const removeComma = (v: string) => Number(v.replace(/,/g, '')) || 0
const handleUnitPrice = (v: string) => {
  unitPrice.value = addComma(v)
}

const loadPortfolios = async () => {
  loadingPortfolios.value = true
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('portfolios')
      .select('id, ticker, asset_type, currency')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
    if (error) throw error
    portfolios.value = data ?? []
  } catch (e) {
    console.error(e)
    showMessage('포트폴리오 목록 조회에 실패했습니다.', 'error')
  } finally {
    loadingPortfolios.value = false
  }
}

watch(dialog, async (opened) => {
  if (!opened) return
  await loadPortfolios()
  if (props.initialData) {
    txType.value = props.initialData.transaction_type
    selectedPortfolioId.value = props.initialData.portfolio_id
    quantity.value = String(props.initialData.quantity)
    unitPrice.value = addComma(String(props.initialData.unit_price))
    txDate.value = props.initialData.transaction_date
    memo.value = props.initialData.memo ?? ''
  } else {
    reset(false)
  }
})

const save = async () => {
  if (!isValid.value) return
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
      const { error } = await supabase
        .from('transactions')
        .update({
          transaction_type: txType.value,
          quantity: Number(quantity.value),
          unit_price: removeComma(unitPrice.value),
          transaction_date: txDate.value,
          memo: memo.value || null,
        })
        .eq('id', props.initialData.id)
      if (error) throw error
      showMessage('거래내역이 수정되었습니다.', 'success')
    } else {
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        portfolio_id: selectedPortfolioId.value,
        transaction_type: txType.value,
        quantity: Number(quantity.value),
        unit_price: removeComma(unitPrice.value),
        transaction_date: txDate.value,
        memo: memo.value || null,
      })
      if (error) throw error
      showMessage('거래내역이 등록되었습니다.', 'success')
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
  txType.value = 'BUY'
  selectedPortfolioId.value = ''
  quantity.value = ''
  unitPrice.value = ''
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
        <div class="header-eyebrow">{{ isEditMode ? '거래 수정' : '거래 추가' }}</div>
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
        <!-- 종목 선택 -->
        <v-select
          v-model="selectedPortfolioId"
          :items="portfolioItems"
          label="종목 선택"
          prepend-inner-icon="mdi-finance"
          variant="outlined"
          density="comfortable"
          rounded="lg"
          :loading="loadingPortfolios"
          :disabled="isEditMode"
          no-data-text="등록된 포트폴리오가 없습니다"
          :hint="isEditMode ? '종목은 수정할 수 없습니다' : ''"
          persistent-hint
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
            :prepend-inner-icon="
              selectedPortfolio?.currency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'
            "
          />
        </div>

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
        <div
          v-if="totalAmount"
          class="total-preview mt-3"
          :class="txType === 'BUY' ? 'preview-buy' : 'preview-sell'"
        >
          <span class="total-label">총 {{ txType === 'BUY' ? '매수' : '매도' }}금액</span>
          <span class="total-value">{{ totalLabel }}</span>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-btn variant="text" :disabled="saving" @click="reset()">취소</v-btn>
        <v-spacer />
        <v-btn
          :color="txType === 'BUY' ? 'teal' : 'error'"
          :disabled="!isValid"
          :loading="saving"
          variant="flat"
          rounded="lg"
          @click="save"
        >
          <v-icon start size="16">{{
            txType === 'BUY' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold'
          }}</v-icon>
          {{ isEditMode ? '수정 저장' : txType === 'BUY' ? '매수 저장' : '매도 저장' }}
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

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

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
