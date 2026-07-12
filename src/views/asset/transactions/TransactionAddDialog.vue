<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { getCachedRate } from '@/services/exchangeRateCache'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { useLocale } from '@/composables/useLocale'
import { useI18n } from 'vue-i18n'
import { formatMoneyIn } from '@/utils/numberFormat'
import { isKoLocale } from '@/plugins/i18n'
import { getTickerDisplayName, isKnownTicker } from '@/utils/tickerNames'
import { KR_STOCK_NAMES, KR_ETF_NAMES } from '@/utils/tickerNames.kr'
import { getStockPrice } from '@/services/market'
import { recomputeAssetSummary } from '@/services/assetSummary'
import { useUserDataStore } from '@/stores/userData'
import {
  getAssetClass, getMarket, ASSET_CLASSES, MARKETS, ACTIVE_MARKETS,
  type AssetClass, type MarketCode, type CurrencyCode,
} from '@/config/marketConfig'

const userDataStore = useUserDataStore()
const { baseCurrency } = useBaseCurrency()
const { locale } = useLocale()
const { t } = useI18n()

const krStockItems = Object.entries({ ...KR_STOCK_NAMES, ...KR_ETF_NAMES }).map(([code, name]) => ({
  title: `${name} (${code})`,
  value: code,
  name,
}))

const krSearchQuery = ref('')
const selectedKrStock = ref<{ value: string; name: string } | null>(null)

const filteredKrItems = computed(() =>
  (krSearchQuery.value ?? '').trim().length === 0 ? [] : krStockItems,
)

const krFilter = (_value: string, query: string, item?: { raw: { title: string } }) => {
  if (!item) return false
  const q = query.replace(/\s/g, '').toLowerCase()
  const t = item.raw.title.replace(/\s/g, '').toLowerCase()
  return t.includes(q)
}

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
  initialType?: TransactionType
  initialAccount?: string
}>()

const emit = defineEmits<{
  saved: []
}>()

const isEditMode = computed(() => !!props.initialData)

interface Portfolio {
  id: string
  ticker: string
  asset_class?: AssetClass
  market?: MarketCode | null
  currency: string
  account_name: string
}

const NEW_PORTFOLIO_VALUE = '__NEW__'
const ASSET_CLASS_OPTIONS: AssetClass[] = ['stock', 'crypto']

const portfolios = ref<Portfolio[]>([])
const loadingPortfolios = ref(false)
const selectedAccountFilter = ref<string | null>(null)

const accountOptions = computed(() => {
  const accounts = [...new Set(portfolios.value.map((p) => p.account_name ?? '미지정'))]
  return accounts.length > 1 ? accounts : []
})

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
const newAssetClass = ref<AssetClass | ''>('')
const newMarket = ref<MarketCode>('KR')
const newCurrency = ref('KRW')
const newAccountName = ref('미지정')

const isNewKrStock = computed(() => newAssetClass.value === 'stock' && newMarket.value === 'KR')
const isNewUsStock = computed(() => newAssetClass.value === 'stock' && newMarket.value === 'US')

const classLabel = (c: AssetClass) => ASSET_CLASSES[c].label[locale.value] ?? c
const marketLabel = (m: MarketCode) => MARKETS[m].label[locale.value] ?? m

const newTickerConfig = computed(() => {
  if (isNewKrStock.value) return { label: t('dialog.tickerLabelKr'), placeholder: '005930', disabled: false }
  if (isNewUsStock.value) return { label: t('dialog.tickerLabelUs'), placeholder: 'AAPL', disabled: false }
  if (newAssetClass.value === 'crypto') return { label: t('dialog.tickerLabelCrypto'), placeholder: 'BTC', disabled: false }
  return { label: t('dialog.tickerLabelUs'), placeholder: '', disabled: false }
})

const newCurrencyLocked = computed(() => newAssetClass.value === 'stock')

watch(selectedKrStock, (v) => { newTicker.value = v?.value ?? '' })

watch([newAssetClass, newMarket], ([cls]) => {
  if (cls === 'stock') newCurrency.value = MARKETS[newMarket.value].currency
  newTicker.value = ''
  krSearchQuery.value = ''
  selectedKrStock.value = null
})

const selectedPortfolio = computed(() =>
  portfolios.value.find((p) => p.id === selectedPortfolioId.value) ?? null,
)

const effectiveCurrency = computed(() => {
  if (isNewPortfolio.value) return newCurrency.value
  return selectedPortfolio.value?.currency ?? 'KRW'
})

const filteredPortfolios = computed(() =>
  selectedAccountFilter.value
    ? portfolios.value.filter((p) => (p.account_name ?? '미지정') === selectedAccountFilter.value)
    : portfolios.value
)

// 종목 선택 목록에 표시할 자산군 라벨
const assetClassLabel = (p: Portfolio): string => {
  const cls = getAssetClass(p)
  if (cls === 'stock') return marketLabel(getMarket(p) ?? 'US')
  return classLabel(cls)
}

const portfolioItems = computed(() => [
  ...filteredPortfolios.value.map((p) => {
    const name = getTickerDisplayName(p.ticker)
    const hasName = name !== p.ticker
    const isOverseas = getAssetClass(p) === 'stock' && getMarket(p) === 'US'
    const label = hasName
      ? isOverseas
        ? `${name} (${p.ticker})`
        : name
      : p.ticker
    const assetLabel = assetClassLabel(p)
    let accountPrefix = ''
    if (!selectedAccountFilter.value && p.account_name && p.account_name !== '미지정') {
      const acc = p.account_name
      // 한글은 2자, 영문/숫자는 4자 제한
      const isKorean = /[ㄱ-ㅎ가-힣]/.test(acc)
      const truncated = isKorean ? acc.slice(0, 2) : acc.slice(0, 4)
      accountPrefix = `[${truncated}] `
    }
    return { title: `${accountPrefix}${label} · ${assetLabel}`, value: p.id }
  }),
  { title: t('dialog.addNewOption'), value: NEW_PORTFOLIO_VALUE },
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
  // ko 외 로케일은 한글 단위 대신 국제 축약 표기
  if (!isKoLocale()) return formatMoneyIn(v, 'KRW', 'short')
  if (v >= 100000000) return `${Math.floor(v / 100000000)}억원`
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만원`
  return `${Math.round(v).toLocaleString()}원`
})

const MIN_TX_DATE = '2000-01-01'

const newTickerError = computed(() => {
  const t2 = newTicker.value?.trim() ?? ''
  if (!isNewPortfolio.value || !t2 || isNewKrStock.value) return ''
  if (isNewUsStock.value && !/^[A-Za-z]{1,10}$/.test(t2)) return t('dialog.errors.tickerLettersOnly')
  return ''
})

const quantityError = computed(() => {
  if (!quantity.value) return ''
  const q = Number(quantity.value)
  if (q <= 0) return t('dialog.errors.qtyPositive')
  if (q > maxQuantity.value) return t('dialog.errors.qtyMax', { max: maxQuantity.value.toLocaleString() })
  const decStr = String(quantity.value).split('.')[1] ?? ''
  if (decStr.length > 8) return t('dialog.errors.qtyDecimals')
  return ''
})

const unitPriceError = computed(() => {
  if (!unitPrice.value) return ''
  const p = removeComma(unitPrice.value)
  if (p <= 0) return t('dialog.errors.pricePositive')
  if (p > maxPrice.value) {
    const isUsStock = effectiveAssetClass.value === 'stock' && effectiveMarket.value === 'US'
    const unit = isUsStock ? '$' : ''
    const suffix = isUsStock ? '' : '원'
    return t('dialog.errors.priceMax', { amount: `${unit}${maxPrice.value.toLocaleString()}${suffix}` })
  }
  return ''
})

const txDateError = computed(() => {
  if (!txDate.value) return ''
  if (txDate.value < MIN_TX_DATE) return t('dialog.errors.dateMin', { date: MIN_TX_DATE })
  return ''
})

const isNewPortfolioValid = computed(() =>
  !isNewPortfolio.value || (
    newAssetClass.value &&
    ((newTicker.value?.trim() ?? '') && !newTickerError.value) &&
    newCurrency.value
  ),
)

const isValid = computed(() =>
  selectedPortfolioId.value &&
  selectedPortfolioId.value !== NEW_PORTFOLIO_VALUE &&
  Number(quantity.value) > 0 &&
  removeComma(unitPrice.value) > 0 &&
  txDate.value &&
  !quantityError.value &&
  !unitPriceError.value &&
  !txDateError.value,
)

// 새 종목 입력 완료 여부 (저장 버튼 활성화용)
const canSave = computed(() => {
  if (isNewPortfolio.value) {
    return isNewPortfolioValid.value &&
      Number(quantity.value) > 0 &&
      removeComma(unitPrice.value) > 0 &&
      txDate.value &&
      !quantityError.value &&
      !unitPriceError.value &&
      !txDateError.value
  }
  return isValid.value
})

const loadPortfolios = async () => {
  loadingPortfolios.value = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    const { data, error } = await supabase
      .from('portfolios')
      .select('id, ticker, asset_class, market, currency, account_name')
      .eq('user_id', user.id)
      .neq('asset_class', 'cash')
      .order('sort_order', { ascending: true })
    if (error) throw error
    portfolios.value = data ?? []
  } catch (e) {
    console.error(e)
    showMessage(t('dialog.errors.portfolioListError'), 'error')
  } finally {
    loadingPortfolios.value = false
  }
}

watch(selectedAccountFilter, (acc) => {
  selectedPortfolioId.value = ''
  // 새 종목 패널이 열려있지 않을 때만 계좌명 자동 세팅 (직접 입력값 덮어쓰기 방지)
  if (!isNewPortfolio.value) newAccountName.value = acc ?? '미지정'
})

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
    if (props.initialAccount) {
      selectedAccountFilter.value = props.initialAccount
      newAccountName.value = props.initialAccount
    }
  }
})

// 선택된 종목 또는 새 종목 입력 기준으로 자산군/시장 판단
const effectiveAssetClass = computed<AssetClass>(() =>
  isNewPortfolio.value
    ? (newAssetClass.value || 'stock')
    : selectedPortfolio.value
      ? getAssetClass(selectedPortfolio.value)
      : 'stock',
)
const effectiveMarket = computed<MarketCode | null>(() =>
  isNewPortfolio.value
    ? (newAssetClass.value === 'stock' ? newMarket.value : null)
    : selectedPortfolio.value
      ? getMarket(selectedPortfolio.value)
      : null,
)
const isCrypto = computed(() => effectiveAssetClass.value === 'crypto')
const maxPrice = computed(() => {
  if (isCrypto.value) return 999_999_999                            // 암호화폐: 10억 KRW
  if (effectiveMarket.value === 'US') return 1_000_000              // 미국주식: $100만 USD
  return 100_000_000                                                // 국내주식: 1억 KRW
})
const maxQuantity = computed(() => isCrypto.value ? 99_999_999 : 100_000)     // 암호화폐 1억 / 주식 10만

const addComma = (v: string) => {
  const num = v.replace(/[^0-9.]/g, '')
  const parts = num.split('.')
  const formatted = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (parts[1] !== undefined) return `${formatted}.${parts[1].slice(0, 8)}`
  return formatted
}
const removeComma = (v: string) => Number(v.replace(/,/g, '')) || 0
const handleUnitPrice = (v: string) => {
  unitPrice.value = addComma(v)
}

const save = async () => {
  if (!canSave.value) return
  if (isNewPortfolio.value) {
    const t2 = newTicker.value.trim().toUpperCase()
    if (isNewUsStock.value) {
      saving.value = true
      try {
        await getStockPrice(t2, { asset_class: 'stock', market: 'US', currency: 'USD' })
      } catch {
        showMessage(t('dialog.errors.invalidTicker'), 'error')
        saving.value = false
        return
      }
    } else if (!isNewKrStock.value && !isKnownTicker(t2)) {
      const label = newAssetClass.value === 'crypto' ? t('dialog.tickerLabelCrypto') : t('dialog.tickerLabelKr')
      showMessage(t('dialog.errors.unknownCoin', { label }), 'error')
      return
    }
  }
  saving.value = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { showMessage(t('dialog.errors.loginRequired'), 'error'); return }

    let portfolioId = selectedPortfolioId.value

    // 새 종목 먼저 등록
    if (isNewPortfolio.value) {
      const cls = newAssetClass.value as AssetClass
      const mkt = cls === 'stock' ? newMarket.value : null
      const tickerToSave = newTicker.value.trim().toUpperCase()
      const accountNameToSave = newAccountName.value.trim() || '미지정'
      const { data: existing } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', user.id)
        .eq('ticker', tickerToSave)
        .eq('account_name', accountNameToSave)
        .maybeSingle()
      if (existing) {
        showMessage(t('dialog.errors.duplicateInAccount', { name: getTickerDisplayName(tickerToSave), account: accountNameToSave }), 'warning')
        saving.value = false
        return
      }

      const { data: newPortfolio, error: pErr } = await supabase
        .from('portfolios')
        .insert({
          user_id: user.id,
          ticker: tickerToSave,
          asset_class: cls,
          market: mkt,
          currency: newCurrency.value,
          account_name: accountNameToSave,
          quantity: 0,
          avg_price: 0,
        })
        .select('id')
        .single()
      if (pErr) throw pErr
      portfolioId = newPortfolio.id
    }

    // 거래통화 ≠ 기준통화면 거래 시점 환율(거래통화→기준통화)을 기록 (GLOBALIZATION.md 단계 C)
    const exchangeRate = effectiveCurrency.value !== baseCurrency.value
      ? await getCachedRate(effectiveCurrency.value as CurrencyCode, baseCurrency.value)
      : null

    if (isEditMode.value && props.initialData) {
      const { error } = await supabase
        .from('transactions')
        .update({
          transaction_type: txType.value,
          quantity: Number(quantity.value),
          unit_price: removeComma(unitPrice.value),
          transaction_date: txDate.value,
          memo: memo.value || null,
          ...(exchangeRate !== null && { exchange_rate: exchangeRate, base_currency: baseCurrency.value }),
        })
        .eq('id', props.initialData.id)
      if (error) throw error
      showMessage(t('dialog.errors.txEditSuccess'), 'success')
    } else {
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        portfolio_id: portfolioId,
        transaction_type: txType.value,
        quantity: Number(quantity.value),
        unit_price: removeComma(unitPrice.value),
        transaction_date: txDate.value,
        memo: memo.value || null,
        exchange_rate: exchangeRate,
        base_currency: baseCurrency.value,
      })
      if (error) throw error
      showMessage(t('dialog.errors.txAddSuccess'), 'success')
    }

    // 거래 추가/수정 시 DB 트리거가 portfolios.quantity/avg_price를 재계산하므로 캐시 무효화
    userDataStore.invalidatePortfolios()
    // 대시보드 등에서 총자산이 바로 반영되도록 백그라운드로 재계산 (저장 완료를 기다리지 않음)
    recomputeAssetSummary(user.id)
    emit('saved')
    reset()
  } catch (e) {
    console.error(e)
    showMessage(t('dialog.errors.saveError'), 'error')
  } finally {
    saving.value = false
  }
}

const reset = (closeDialog = true) => {
  txType.value = props.initialType ?? 'BUY'
  selectedPortfolioId.value = ''
  quantity.value = ''
  unitPrice.value = ''
  txDate.value = new Date().toISOString().slice(0, 10)
  memo.value = ''
  newTicker.value = ''
  krSearchQuery.value = ''
  selectedKrStock.value = null
  newAssetClass.value = ''
  newMarket.value = locale.value === 'ko' ? 'KR' : 'US'
  newCurrency.value = 'KRW'
  newAccountName.value = '미지정'
  selectedAccountFilter.value = null
  if (closeDialog) dialog.value = false
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="480">
    <v-card rounded="xl" class="glass-dialog" style="overflow: hidden; display: flex; flex-direction: column; max-height: 90dvh">
      <!-- 컬러 헤더 -->
      <div class="dialog-header" :class="txType === 'BUY' ? 'header-buy' : 'header-sell'">
        <div class="font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">{{ isEditMode ? $t('dialog.editTx') : $t('dialog.addTx') }}</div>
        <div class="type-toggle mt-3">
          <button
            class="toggle-btn"
            :class="{ 'toggle-active-buy': txType === 'BUY' }"
            @click="txType = 'BUY'"
          >
            <v-icon size="16" class="mr-1">mdi-arrow-down-bold</v-icon>
            {{ $t('transactions.buy') }}
          </button>
          <button
            class="toggle-btn"
            :class="{ 'toggle-active-sell': txType === 'SELL' }"
            @click="txType = 'SELL'"
          >
            <v-icon size="16" class="mr-1">mdi-arrow-up-bold</v-icon>
            {{ $t('transactions.sell') }}
          </button>
        </div>
      </div>

      <v-card-text class="pt-2 pb-1" style="overflow-y: auto; flex: 1">
        <!-- 계좌 필터 -->
        <div v-if="accountOptions.length > 0" class="account-filter-row mb-2">
          <button
            class="account-chip"
            :class="{ 'account-chip-active': selectedAccountFilter === null }"
            @click="selectedAccountFilter = null"
          >{{ $t('transactions.all') }}</button>
          <button
            v-for="acc in accountOptions"
            :key="acc"
            class="account-chip"
            :class="{ 'account-chip-active': selectedAccountFilter === acc }"
            @click="selectedAccountFilter = acc"
          >{{ acc }}</button>
        </div>

        <!-- 종목 선택 -->
        <v-select
          v-model="selectedPortfolioId"
          :items="portfolioItems"
          :label="$t('dialog.selectTicker')"
          prepend-inner-icon="mdi-finance"
          variant="outlined"
          density="compact"
          rounded="lg"
          :loading="loadingPortfolios"
          :disabled="isEditMode"
          :no-data-text="$t('dialog.noPortfolios')"
          :hint="isEditMode ? $t('dialog.portfolioLocked') : ''"
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
          <div v-if="isNewPortfolio" class="new-portfolio-panel mt-1">
            <div class="new-portfolio-label mb-2">
              <v-icon size="13" color="primary" class="mr-1">mdi-plus-circle-outline</v-icon>
              {{ $t('dialog.newAssetInfo') }}
            </div>
            <v-text-field
              v-model="newAccountName"
              :label="$t('dialog.accountNameLabel')"
              :placeholder="$t('dialog.accountNamePlaceholder')"
              prepend-inner-icon="mdi-bank-outline"
              variant="outlined"
              density="compact"
              rounded="lg"
              maxlength="20"
              class="mb-1"
            />

            <!-- 자산군 -->
            <div class="field-label mb-1">{{ $t('dialog.assetClassLabel') }}</div>
            <div class="d-flex ga-2 mb-1">
              <v-btn
                v-for="c in ASSET_CLASS_OPTIONS"
                :key="c"
                size="small"
                rounded="lg"
                elevation="0"
                :variant="newAssetClass === c ? 'flat' : 'tonal'"
                :color="newAssetClass === c ? 'primary' : undefined"
                @click="newAssetClass = c"
              >
                {{ classLabel(c) }}
              </v-btn>
            </div>

            <!-- 시장 (주식일 때만) -->
            <template v-if="newAssetClass === 'stock'">
              <div class="field-label mb-1">{{ $t('dialog.marketLabel') }}</div>
              <div class="d-flex ga-2 mb-1">
                <v-btn
                  v-for="m in ACTIVE_MARKETS"
                  :key="m"
                  size="small"
                  rounded="lg"
                  elevation="0"
                  :variant="newMarket === m ? 'flat' : 'tonal'"
                  :color="newMarket === m ? 'primary' : undefined"
                  @click="newMarket = m"
                >
                  {{ marketLabel(m) }}
                </v-btn>
              </div>
            </template>

            <!-- 국내주식: 한글명 검색 자동완성 -->
            <v-autocomplete
              v-if="isNewKrStock"
              v-model="selectedKrStock"
              v-model:search="krSearchQuery"
              :items="filteredKrItems"
              :custom-filter="krFilter"
              item-title="name"
              return-object
              :label="$t('dialog.tickerSearchLabel')"
              :placeholder="$t('dialog.tickerSearchPlaceholder')"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              rounded="lg"
              class="mb-1"
              :no-data-text="$t('etfAnalysis.noSearchResults')"
              clearable
              auto-select-first
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :subtitle="(item as any).raw?.value" />
              </template>
            </v-autocomplete>
            <!-- 해외주식 / 암호화폐: 기존 텍스트 입력 -->
            <v-text-field
              v-else-if="newAssetClass"
              v-model="newTicker"
              :label="newTickerConfig.label"
              :placeholder="newTickerConfig.placeholder"
              :disabled="newTickerConfig.disabled"
              prepend-inner-icon="mdi-finance"
              variant="outlined"
              density="compact"
              rounded="lg"
              class="mb-1"
              maxlength="20"
              :error-messages="newTickerError"
            />
            <v-select
              v-model="newCurrency"
              :items="['KRW', 'USD']"
              :label="$t('dialog.currencyLabel')"
              prepend-inner-icon="mdi-cash"
              variant="outlined"
              density="compact"
              rounded="lg"
              :disabled="newCurrencyLocked"
            />
          </div>
        </v-expand-transition>

        <!-- 수량 + 단가 -->
        <div class="two-col mt-3">
          <v-text-field
            v-model="quantity"
            :label="$t('dialog.txQuantityLabel')"
            type="number"
            step="0.0001"
            min="0"
            :max="maxQuantity"
            prepend-inner-icon="mdi-counter"
            variant="outlined"
            density="compact"
            rounded="lg"
            :error-messages="quantityError"
          />
          <v-text-field
            :model-value="unitPrice"
            @update:model-value="handleUnitPrice"
            :label="$t('dialog.unitPriceLabel')"
            variant="outlined"
            density="compact"
            rounded="lg"
            :prepend-inner-icon="effectiveCurrency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'"
            :error-messages="unitPriceError"
          />
        </div>

        <!-- 거래일 -->
        <v-text-field
          v-model="txDate"
          :label="$t('dialog.txDateLabel')"
          type="date"
          prepend-inner-icon="mdi-calendar-outline"
          variant="outlined"
          density="compact"
          rounded="lg"
          class="mt-1"
          :min="MIN_TX_DATE"
          :max="new Date().toISOString().slice(0, 10)"
          :error-messages="txDateError"
        />

        <!-- 메모 -->
        <v-text-field
          v-model="memo"
          :label="$t('dialog.memoLabel')"
          :placeholder="$t('dialog.memoPlaceholder')"
          prepend-inner-icon="mdi-note-text-outline"
          variant="outlined"
          density="compact"
          rounded="lg"
          class="mt-1"
          maxlength="50"
        />

        <!-- 합계 프리뷰 -->
        <div
          v-if="totalAmount"
          class="total-preview mt-2"
          :class="txType === 'BUY' ? 'preview-buy' : 'preview-sell'"
        >
          <span class="total-label">{{ $t('dialog.totalPrefix', { type: txType === 'BUY' ? $t('transactions.buy') : $t('transactions.sell') }) }}</span>
          <span class="total-value">{{ totalLabel }}</span>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-4 py-2">
        <v-btn variant="text" :disabled="saving" @click="reset()">{{ $t('common.cancel') }}</v-btn>
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
          {{ isEditMode ? $t('dialog.editSaveBtn') : txType === 'BUY' ? $t('dialog.buySaveBtn') : $t('dialog.sellSaveBtn') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>

.dialog-header {
  padding: 24px 24px 20px;
  transition: background 0.25s ease;
}
.header-buy {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.12) 0%, rgba(var(--v-theme-primary), 0.04) 100%);
  border-bottom: 1px solid rgba(var(--v-theme-primary), 0.15);
}
.header-sell {
  background: linear-gradient(135deg, rgba(var(--v-theme-error), 0.1) 0%, rgba(var(--v-theme-error), 0.03) 100%);
  border-bottom: 1px solid rgba(var(--v-theme-error), 0.15);
}

.header-eyebrow {
  font-size: 0.6875rem;
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
  color: rgba(var(--v-theme-on-surface), 0.45);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
  border-radius: 12px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.1);
  background: transparent;
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.45);
  cursor: pointer;
  transition: all 0.18s ease;
}
.toggle-active-buy {
  background: rgba(var(--v-theme-primary), 0.12);
  border-color: var(--fp-primary);
  color: var(--fp-primary);
}
.toggle-active-sell {
  background: rgba(var(--v-theme-error), 0.1);
  border-color: var(--fp-error);
  color: var(--fp-error);
}


/* 새 종목 추가 항목 강조 */
.account-filter-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.account-chip {
  padding: 3px 12px;
  border-radius: 20px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  background: none;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
  transition: all 0.15s;
}
.account-chip:active { opacity: 0.7; }
.account-chip-active {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.07);
}

.new-portfolio-item { color: rgb(var(--v-theme-primary)) !important; font-weight: 600; }

.field-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

/* 새 종목 인라인 패널 */
.new-portfolio-panel {
  background: rgba(var(--v-theme-primary), 0.05);
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
  border-radius: 14px;
  padding: 14px;
}
.new-portfolio-label {
  font-size: 0.75rem;
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
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.total-value {
  font-size: 1rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
</style>
