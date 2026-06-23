<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

type TransactionType = 'BUY' | 'SELL'

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

interface Portfolio {
  id: string
  ticker: string
  asset_type: string
  currency: string
}

const NEW_PORTFOLIO_VALUE = '__NEW__'
const assetTypes = ['국내주식', '해외주식', 'ETF', '암호화폐', '현금']

const portfolios = ref<Portfolio[]>([])
const loadingPortfolios = ref(false)

const txType = ref<TransactionType>('BUY')
const selectedPortfolioId = ref('')
const quantity = ref('')
const unitPrice = ref('')
const txDate = ref(new Date().toISOString().slice(0, 10))
const memo = ref('')
const saving = ref(false)

// 새 종목 추가 필드
const isNewPortfolio = computed(() => selectedPortfolioId.value === NEW_PORTFOLIO_VALUE)
const newTicker = ref('')
const newAssetType = ref('')
const newCurrency = ref('KRW')

const newTickerConfig = computed(() => {
  switch (newAssetType.value) {
    case '해외주식': return { label: '티커', placeholder: 'AAPL', disabled: false }
    case '국내주식': return { label: '종목코드', placeholder: '005930', disabled: false }
    case 'ETF':     return { label: '티커', placeholder: 'VOO', disabled: false }
    case '암호화폐': return { label: '코인 영문코드', placeholder: 'BTC', disabled: false }
    case '현금':    return { label: '티커', placeholder: '-', disabled: true }
    default:        return { label: '티커', placeholder: '', disabled: false }
  }
})

const newCurrencyLocked = computed(() =>
  ['해외주식', '국내주식', '현금', 'ETF'].includes(newAssetType.value),
)

watch(newAssetType, (type) => {
  if (type === '해외주식' || type === 'ETF') newCurrency.value = 'USD'
  else if (['국내주식', '현금'].includes(type)) newCurrency.value = 'KRW'
  if (type === '현금') newTicker.value = '-'
  else if (newTicker.value === '-') newTicker.value = ''
})

const selectedPortfolio = computed(() =>
  portfolios.value.find((p) => p.id === selectedPortfolioId.value) ?? null,
)

const effectiveCurrency = computed(() => {
  if (isNewPortfolio.value) return newCurrency.value
  return selectedPortfolio.value?.currency ?? 'KRW'
})

const portfolioItems = computed(() => [
  ...portfolios.value.map((p) => ({
    title: `${p.ticker} · ${p.asset_type}`,
    value: p.id,
  })),
  { title: '+ 새 종목 추가', value: NEW_PORTFOLIO_VALUE },
])

const totalAmount = computed(() => {
  const q = Number(quantity.value)
  const p = removeComma(unitPrice.value)
  if (!q || !p) return null
  return q * p
})

const totalLabel = computed(() => {
  if (!totalAmount.value) return '-'
  const v = totalAmount.value
  if (effectiveCurrency.value === 'USD') {
    return '$' + (v % 1 === 0
      ? v.toLocaleString('en-US')
      : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }
  if (v >= 100000000) return `${Math.floor(v / 100000000)}억원`
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만원`
  return `${Math.round(v).toLocaleString()}원`
})

const isNewPortfolioValid = computed(() =>
  !isNewPortfolio.value || (
    newAssetType.value &&
    (newAssetType.value === '현금' || newTicker.value.trim()) &&
    newCurrency.value
  ),
)

const isValid = computed(() =>
  selectedPortfolioId.value &&
  selectedPortfolioId.value !== NEW_PORTFOLIO_VALUE &&
  Number(quantity.value) > 0 &&
  removeComma(unitPrice.value) > 0 &&
  txDate.value,
)

// 새 종목 입력 완료 여부 (저장 버튼 활성화용)
const canSave = computed(() => {
  if (isNewPortfolio.value) {
    return isNewPortfolioValid.value &&
      Number(quantity.value) > 0 &&
      removeComma(unitPrice.value) > 0 &&
      txDate.value
  }
  return isValid.value
})

const loadPortfolios = async () => {
  loadingPortfolios.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
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

const addComma = (v: string) => {
  const num = v.replace(/[^0-9.]/g, '')
  const parts = num.split('.')
  const int = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts[1] !== undefined ? `${int}.${parts[1]}` : int
}
const removeComma = (v: string) => Number(v.replace(/,/g, '')) || 0
const handleUnitPrice = (v: string) => { unitPrice.value = addComma(v) }

const save = async () => {
  if (!canSave.value) return
  saving.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { showMessage('로그인이 필요합니다.', 'error'); return }

    let portfolioId = selectedPortfolioId.value

    // 새 종목 먼저 등록
    if (isNewPortfolio.value) {
      const { data: newPortfolio, error: pErr } = await supabase
        .from('portfolios')
        .insert({
          user_id: user.id,
          ticker: newAssetType.value === '현금' ? 'CASH' : newTicker.value.trim().toUpperCase(),
          asset_type: newAssetType.value,
          currency: newCurrency.value,
          quantity: 0,
          avg_price: 0,
        })
        .select('id')
        .single()
      if (pErr) throw pErr
      portfolioId = newPortfolio.id
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
        portfolio_id: portfolioId,
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
  newTicker.value = ''
  newAssetType.value = ''
  newCurrency.value = 'KRW'
  if (closeDialog) dialog.value = false
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="480">
    <v-card rounded="xl" class="glass-dialog" style="overflow: hidden">
      <!-- 컬러 헤더 -->
      <div class="dialog-header" :class="txType === 'BUY' ? 'header-buy' : 'header-sell'">
        <div class="header-eyebrow">{{ isEditMode ? '거래 수정' : '거래 추가' }}</div>
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
        >
          <template #item="{ item, props: itemProps }">
            <v-list-item
              v-bind="itemProps"
              :class="item.value === NEW_PORTFOLIO_VALUE ? 'new-portfolio-item' : ''"
            />
          </template>
        </v-select>

        <!-- 새 종목 입력 필드 (인라인 펼침) -->
        <v-expand-transition>
          <div v-if="isNewPortfolio" class="new-portfolio-panel mt-3">
            <div class="new-portfolio-label mb-2">
              <v-icon size="13" color="primary" class="mr-1">mdi-plus-circle-outline</v-icon>
              새 종목 정보 입력
            </div>
            <v-select
              v-model="newAssetType"
              :items="assetTypes"
              label="자산유형"
              prepend-inner-icon="mdi-shape"
              variant="outlined"
              density="comfortable"
              rounded="lg"
              class="mb-2"
            />
            <v-text-field
              v-model="newTicker"
              :label="newTickerConfig.label"
              :placeholder="newTickerConfig.placeholder"
              :disabled="newTickerConfig.disabled"
              prepend-inner-icon="mdi-finance"
              variant="outlined"
              density="comfortable"
              rounded="lg"
              class="mb-2"
            />
            <v-select
              v-model="newCurrency"
              :items="['KRW', 'USD']"
              label="통화"
              prepend-inner-icon="mdi-cash"
              variant="outlined"
              density="comfortable"
              rounded="lg"
              :disabled="newCurrencyLocked"
            />
          </div>
        </v-expand-transition>

        <!-- 수량 + 단가 -->
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
            :prepend-inner-icon="effectiveCurrency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'"
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
          :disabled="!canSave"
          :loading="saving"
          variant="flat"
          rounded="lg"
          @click="save"
        >
          <v-icon start size="16">{{ txType === 'BUY' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold' }}</v-icon>
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
.v-theme--dark .toggle-active-buy { background: rgba(0, 150, 136, 0.2); }
.v-theme--dark .toggle-active-sell { background: rgba(211, 47, 47, 0.18); }

/* 새 종목 추가 항목 강조 */
.new-portfolio-item { color: rgb(var(--v-theme-primary)) !important; font-weight: 600; }

/* 새 종목 인라인 패널 */
.new-portfolio-panel {
  background: rgba(var(--v-theme-primary), 0.05);
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
  border-radius: 14px;
  padding: 14px;
}
.new-portfolio-label {
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
  display: flex;
  align-items: center;
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
