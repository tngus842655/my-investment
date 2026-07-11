<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PortfolioAsset } from '@/types/portfolio'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { getCachedRate } from '@/services/exchangeRateCache'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { TICKER_NAMES, getTickerDisplayName } from '@/utils/tickerNames'
import { KR_STOCK_NAMES, KR_ETF_NAMES } from '@/utils/tickerNames.kr'
import { getStockPrice } from '@/services/market'
import { assetTypeToClass, assetTypeToMarket, getAssetClass, getMarket, type CurrencyCode } from '@/config/marketConfig'

const { baseCurrency } = useBaseCurrency()

// 국내주식 + 국내ETF 검색용: [{ title: '삼성전자 (005930)', value: '005930' }, ...]
const krStockItems = Object.entries({ ...KR_STOCK_NAMES, ...KR_ETF_NAMES }).map(([code, name]) => ({
  title: `${name} (${code})`,
  value: code,
  name,
}))

const filteredKrItems = computed(() =>
  krSearchQuery.value.trim().length === 0 ? [] : krStockItems,
)

const krFilter = (_value: string, query: string, item?: { raw: { title: string } }) => {
  if (!item) return false
  const q = query.replace(/\s/g, '').toLowerCase()
  const t = item.raw.title.replace(/\s/g, '').toLowerCase()
  return t.includes(q)
}


const dialog = defineModel<boolean>()

const props = defineProps<{
  initialData?: PortfolioAsset | null
  initialAccount?: string
}>()

const emit = defineEmits<{
  saved: []
}>()

const isEditMode = computed(() => !!props.initialData)

const ticker = ref('')
const krSearchQuery = ref('')  // 국내주식 한글 검색어
const selectedKrStock = ref<{ value: string; name: string } | null>(null)
const accountName = ref('미지정')

watch(selectedKrStock, (v) => { ticker.value = v?.value ?? '' })
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
  else if (newType === '국내주식' || newType === '현금') currency.value = 'KRW'
  ticker.value = ''
  krSearchQuery.value = ''
  selectedKrStock.value = null
  if (newType === '현금') {
    ticker.value = '-'
    initQuantity.value = '1'
  } else {
    if (initQuantity.value === '1') initQuantity.value = ''
  }
})

watch(dialog, async (opened) => {
  if (!opened) return
  if (props.initialData) {
    ticker.value = props.initialData.ticker
    if (getAssetClass(props.initialData) === 'stock' && getMarket(props.initialData) === 'KR') {
      const name = KR_STOCK_NAMES[props.initialData.ticker] ?? KR_ETF_NAMES[props.initialData.ticker] ?? props.initialData.ticker
      selectedKrStock.value = { value: props.initialData.ticker, name }
      krSearchQuery.value = name
    } else {
      krSearchQuery.value = ''
    }
    assetType.value = props.initialData.asset_type
    currency.value = props.initialData.currency
    accountName.value = props.initialData.account_name ?? '미지정'
    await loadInitialTx(props.initialData.id)
  } else {
    reset(false)
    if (props.initialAccount) accountName.value = props.initialAccount
  }
})

const isCrypto = computed(() => assetType.value === '암호화폐')
const maxPrice = computed(() => {
  if (isCrypto.value) return 999_999_999
  if (assetType.value === '해외주식') return 1_000_000
  if (assetType.value === '현금') return 10_000_000_000
  return 100_000_000  // 국내주식
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
  const t = ticker.value?.trim() ?? ''
  if (!t || assetType.value === '현금') return ''
  if (assetType.value === '국내주식') return '' // 자동완성으로 선택하므로 별도 검증 불필요
  if (t.length > tickerMaxLength.value) return `티커는 ${tickerMaxLength.value}자 이하로 입력해주세요.`
  if (assetType.value === '해외주식' && !/^[A-Za-z]{1,5}$/.test(t)) return '티커는 영문자 5자 이하로 입력해주세요. (예: AAPL)'
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

const isValid = computed(() => {
  if (!assetType.value || !currency.value) return false
  if (assetType.value !== '현금' && (!(ticker.value?.trim() ?? '') || tickerError.value)) return false
  if (quantityError.value || avgPriceError.value) return false
  if (assetType.value === '현금') return !!initAvgPrice.value && removeComma(initAvgPrice.value) > 0
  return !!initQuantity.value && Number(initQuantity.value) > 0 && !!initAvgPrice.value && removeComma(initAvgPrice.value) > 0
})

const save = async () => {
  if (!isValid.value) return
  if (!isEditMode.value && assetType.value !== '현금') {
    const t = ticker.value.trim().toUpperCase()
    if (assetType.value === '해외주식') {
      saving.value = true
      try {
        await getStockPrice(t, { asset_class: 'stock', market: 'US', currency: 'USD' })
      } catch {
        showMessage('유효하지 않은 티커입니다. 티커를 다시 확인해주세요.', 'error')
        saving.value = false
        return
      }
    } else if (assetType.value !== '국내주식' && !TICKER_NAMES[t]) {
      showMessage(`등록되지 않은 코인 영문코드입니다. 다시 확인해주세요.`, 'error')
      return
    }
  }
  saving.value = true
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) {
      showMessage('로그인이 필요합니다.', 'error')
      return
    }

    if (isEditMode.value && props.initialData) {
      const newAccountName = accountName.value.trim() || '미지정'
      // 계좌명 변경 시 중복 체크
      if (newAccountName !== (props.initialData.account_name ?? '미지정')) {
        const { data: dup } = await supabase
          .from('portfolios')
          .select('id')
          .eq('user_id', user.id)
          .eq('ticker', props.initialData.ticker)
          .eq('account_name', newAccountName)
          .maybeSingle()
        if (dup) {
          showMessage(`이미 [${newAccountName}] 계좌에 등록된 종목입니다.`, 'error')
          saving.value = false
          return
        }
      }
      // 통화 + 계좌명 수정
      const { error } = await supabase
        .from('portfolios')
        .update({ currency: currency.value, account_name: newAccountName })
        .eq('id', props.initialData.id)
      if (error) throw error

      // INITIAL 거래 수정 또는 신규 생성
      if (hasInitialHolding.value) {
        // 거래통화 ≠ 기준통화면 거래 시점 환율(거래통화→기준통화)을 기록 (GLOBALIZATION.md 단계 C)
        const exchangeRate = currency.value !== baseCurrency.value
          ? await getCachedRate(currency.value as CurrencyCode, baseCurrency.value)
          : null

        if (existingInitialTxId.value) {
          // 기존 INITIAL 업데이트
          const { error: txError } = await supabase
            .from('transactions')
            .update({
              quantity: Number(initQuantity.value),
              unit_price: removeComma(initAvgPrice.value),
              ...(exchangeRate !== null && { exchange_rate: exchangeRate, base_currency: baseCurrency.value }),
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
            base_currency: baseCurrency.value,
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
          : (ticker.value?.trim() ?? '').toUpperCase()
      const accountNameToSave = accountName.value.trim() || '미지정'
      const { data: existing } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', user.id)
        .eq('ticker', tickerToSave)
        .eq('account_name', accountNameToSave)
        .maybeSingle()
      if (existing) {
        const label =
          assetType.value === '현금'
            ? currency.value === 'USD'
              ? '현금(달러)'
              : '현금(원화)'
            : getTickerDisplayName(tickerToSave)
        const suffix =
          assetType.value === '현금'
            ? `이 [${accountNameToSave}] 계좌에 이미 등록되어 있습니다.`
            : ` 종목이 [${accountNameToSave}] 계좌에 이미 등록되어 있습니다.`
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
          // 전환기 dual-write: asset_type과 새 체계를 함께 기록 (GLOBALIZATION.md 단계 A)
          asset_class: assetTypeToClass(assetType.value),
          market: assetTypeToMarket(assetType.value, currency.value),
          currency: currency.value,
          account_name: accountNameToSave,
          quantity: 0,
          avg_price: 0,
        })
        .select('id')
        .single()
      if (portfolioError) throw portfolioError

      // 초기 잔고 입력 시 INITIAL 거래로 저장
      if (hasInitialHolding.value) {
        const exchangeRate = currency.value !== baseCurrency.value
          ? await getCachedRate(currency.value as CurrencyCode, baseCurrency.value)
          : null
        const { error: txError } = await supabase.from('transactions').insert({
          user_id: user.id,
          portfolio_id: portfolio.id,
          transaction_type: 'INITIAL',
          quantity: Number(initQuantity.value),
          unit_price: removeComma(initAvgPrice.value),
          transaction_date: new Date().toISOString().slice(0, 10),
          exchange_rate: exchangeRate,
          base_currency: baseCurrency.value,
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
  krSearchQuery.value = ''
  selectedKrStock.value = null
  assetType.value = ''
  currency.value = 'KRW'
  accountName.value = '미지정'
  initQuantity.value = ''
  initAvgPrice.value = ''
  existingInitialTxId.value = null
  if (closeDialog) dialog.value = false
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="font-weight-bold pt-4 pb-2 px-4">
        {{ isEditMode ? '자산 수정' : '자산 추가' }}
      </v-card-title>

      <v-card-text class="px-4 pt-0 pb-2">
        <!-- 계좌 구분 -->
        <v-text-field
          v-model="accountName"
          label="계좌 구분"
          prepend-inner-icon="mdi-bank-outline"
          variant="outlined"
          density="compact"
          maxlength="20"
          placeholder="미지정"
          hint="같은 종목을 여러 계좌로 나눠 관리할 때 사용 (예: 미래에셋, ISA)"
          @blur="() => { if (!accountName.trim()) accountName = '미지정' }"
        />

        <!-- 자산유형 -->
        <v-select
          v-model="assetType"
          :items="assetTypes"
          label="자산유형"
          prepend-inner-icon="mdi-shape"
          variant="outlined"
          density="compact"
          class="mt-1"
          :disabled="isEditMode"
          :hint="isEditMode ? '자산유형은 수정할 수 없습니다.' : ''"
          :persistent-hint="isEditMode"
        />

        <!-- 국내주식: 한글명 검색 자동완성 -->
        <v-autocomplete
          v-if="assetType === '국내주식'"
          v-model="selectedKrStock"
          v-model:search="krSearchQuery"
          :items="filteredKrItems"
          item-title="name"
          return-object
          label="종목 검색"
          placeholder="삼성전자, 카카오 등 종목명 입력"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          class="mt-1"
          :disabled="isEditMode"
          :hint="isEditMode ? '티커/코드는 수정할 수 없습니다.' : ''"
          :persistent-hint="isEditMode"
          :custom-filter="krFilter"
          no-data-text="검색 결과가 없습니다"
          clearable
          auto-select-first
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :subtitle="(item as any).raw?.value" />
          </template>
        </v-autocomplete>

        <!-- 해외주식 / 암호화폐: 기존 텍스트 필드 -->
        <v-text-field
          v-else-if="assetType !== '국내주식'"
          v-model="ticker"
          :label="tickerConfig.label"
          :placeholder="tickerConfig.placeholder"
          :disabled="tickerConfig.disabled || isEditMode"
          prepend-inner-icon="mdi-finance"
          variant="outlined"
          density="compact"
          class="mt-1"
          :maxlength="tickerMaxLength"
          :hint="isEditMode && assetType !== '현금' ? '티커/코드는 수정할 수 없습니다.' : ''"
          :error-messages="!isEditMode ? tickerError : ''"
          :persistent-hint="isEditMode"
        />

        <!-- 통화 -->
        <v-select
          v-model="currency"
          :items="['KRW', 'USD']"
          label="통화"
          prepend-inner-icon="mdi-cash"
          variant="outlined"
          density="compact"
          class="mt-1"
          :disabled="currencyLocked"
          :hint="currencyHint"
          :persistent-hint="!!currencyHint"
        />

        <!-- 보유 내역 섹션 -->
        <div class="section-divider my-2">
          <span>{{ isEditMode ? '초기 잔고' : '현재 보유 내역' }}</span>
        </div>

        <div class="info-banner mb-2">
          <v-icon size="14" color="primary" class="mr-1 flex-shrink-0"
            >mdi-information-outline</v-icon
          >
          <span>
            {{
              isEditMode
                ? '앱에 최초 입력한 잔고입니다. 이후 거래 내역은 거래 메뉴에서 수정하세요.'
                : '현재 보유 중인 수량과 평균 매수가를 입력하세요. 이후 거래 내역과 합산되어 손익이 계산됩니다.'
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
            density="compact"
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
              density="compact"
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
              density="compact"
              rounded="lg"
              :prepend-inner-icon="currency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'"
              placeholder="0"
              :disabled="loadingInitial"
              :error-messages="avgPriceError"
            />
          </div>
        </template>

        <!-- 수정 모드: 현재 총 보유수량 표시 -->
        <div v-if="isEditMode && assetType !== '현금' && props.initialData" class="total-preview mt-1">
          <span class="total-label">현재 총 보유수량</span>
          <span class="total-value">{{ props.initialData.quantity.toLocaleString() }}주</span>
        </div>

        <!-- 합계 프리뷰 -->
        <div v-if="totalInitialAmount && assetType !== '현금'" class="total-preview mt-1">
          <span class="total-label">매수 총금액</span>
          <span class="total-value">{{ totalInitialAmount }}</span>
        </div>
      </v-card-text>

      <v-card-actions class="px-4 py-2">
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

.section-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.75rem;
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
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.total-value {
  font-size: 0.9375rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
</style>
