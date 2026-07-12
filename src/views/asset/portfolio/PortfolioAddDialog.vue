<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PortfolioAsset } from '@/types/portfolio'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { getCachedRate } from '@/services/exchangeRateCache'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { useLocale } from '@/composables/useLocale'
import { useI18n } from 'vue-i18n'
import { formatMoneyIn } from '@/utils/numberFormat'
import { isKoLocale } from '@/plugins/i18n'
import { displayAccountName, normalizeAccountName, UNASSIGNED_ACCOUNT } from '@/utils/accountName'
import { isKnownTicker, getTickerDisplayName } from '@/utils/tickerNames'
import { KR_STOCK_NAMES, KR_ETF_NAMES } from '@/utils/tickerNames.kr'
import { getStockPrice } from '@/services/market'
import {
  getAssetClass, getMarket, ASSET_CLASSES, MARKETS, ACTIVE_MARKETS,
  type AssetClass, type MarketCode, type CurrencyCode,
} from '@/config/marketConfig'

const { baseCurrency } = useBaseCurrency()
const { locale } = useLocale()
const { t } = useI18n()

// 국내주식 + 국내ETF 검색용: [{ title: '삼성전자 (005930)', value: '005930' }, ...]
const krStockItems = Object.entries({ ...KR_STOCK_NAMES, ...KR_ETF_NAMES }).map(([code, name]) => ({
  title: `${name} (${code})`,
  value: code,
  name,
}))

const filteredKrItems = computed(() =>
  (krSearchQuery.value ?? '').trim().length === 0 ? [] : krStockItems,
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
const accountName = ref(displayAccountName(UNASSIGNED_ACCOUNT))

watch(selectedKrStock, (v) => { ticker.value = v?.value ?? '' })

// ── 자산군 + 시장 (GLOBALIZATION.md 다이얼로그 재설계) ─────────────
const ASSET_CLASS_OPTIONS: AssetClass[] = ['stock', 'crypto', 'cash']
const assetClass = ref<AssetClass | ''>('')
const market = ref<MarketCode>('KR')
const currency = ref('KRW')
const initQuantity = ref('')
const initAvgPrice = ref('')
const saving = ref(false)
const loadingInitial = ref(false)
const existingInitialTxId = ref<string | null>(null)

const isKrStock = computed(() => assetClass.value === 'stock' && market.value === 'KR')
const isUsStock = computed(() => assetClass.value === 'stock' && market.value === 'US')

const classLabel = (c: AssetClass) => ASSET_CLASSES[c].label[locale.value] ?? c
const marketLabel = (m: MarketCode) => MARKETS[m].label[locale.value] ?? m

const tickerConfig = computed(() => {
  if (isKrStock.value) return { label: t('dialog.tickerLabelKr'), placeholder: '005930', disabled: false }
  if (isUsStock.value) return { label: t('dialog.tickerLabelUs'), placeholder: 'AAPL', disabled: false }
  if (assetClass.value === 'crypto') return { label: t('dialog.tickerLabelCrypto'), placeholder: 'BTC', disabled: false }
  if (assetClass.value === 'cash') return { label: t('dialog.tickerLabelUs'), placeholder: '-', disabled: true }
  return { label: t('dialog.tickerLabelUs'), placeholder: '', disabled: false }
})

const currencyLocked = computed(() =>
  assetClass.value === 'stock' || (isEditMode.value && assetClass.value === 'cash'),
)

const currencyHint = computed(() => {
  if (assetClass.value === 'stock') {
    return t('dialog.currencyFixedStock', { market: marketLabel(market.value), currency: MARKETS[market.value].currency })
  }
  if (assetClass.value === 'cash' && isEditMode.value) return t('dialog.currencyFixedCashEdit')
  if (assetClass.value === 'cash') return t('dialog.currencyFreeCash')
  if (assetClass.value === 'crypto') return t('dialog.currencyFreeCrypto')
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
  // ko 외 로케일은 한글 단위 대신 국제 축약 표기
  if (!isKoLocale()) return formatMoneyIn(v, 'KRW', 'short')
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

// 자산군 또는 시장이 바뀌면(신규 등록 시) 통화·티커 입력을 초기화
watch([assetClass, market], ([newClass]) => {
  if (isEditMode.value) return
  if (newClass === 'stock') currency.value = MARKETS[market.value].currency
  else if (newClass === 'cash') currency.value = 'KRW'
  ticker.value = ''
  krSearchQuery.value = ''
  selectedKrStock.value = null
  if (newClass === 'cash') {
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
    assetClass.value = getAssetClass(props.initialData)
    market.value = getMarket(props.initialData) ?? 'KR'
    if (isKrStock.value) {
      const name = KR_STOCK_NAMES[props.initialData.ticker] ?? KR_ETF_NAMES[props.initialData.ticker] ?? props.initialData.ticker
      selectedKrStock.value = { value: props.initialData.ticker, name }
      krSearchQuery.value = name
    } else {
      krSearchQuery.value = ''
    }
    currency.value = props.initialData.currency
    accountName.value = displayAccountName(props.initialData.account_name ?? UNASSIGNED_ACCOUNT)
    await loadInitialTx(props.initialData.id)
  } else {
    reset(false)
    if (props.initialAccount) accountName.value = displayAccountName(props.initialAccount)
  }
})

const isCrypto = computed(() => assetClass.value === 'crypto')
const maxPrice = computed(() => {
  if (isCrypto.value) return 999_999_999
  if (isUsStock.value) return 1_000_000
  if (assetClass.value === 'cash') return 10_000_000_000
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
  if (isUsStock.value) return 5
  if (isKrStock.value) return 6
  return 10  // 암호화폐
})

const quantityError = computed(() => {
  const q = Number(initQuantity.value)
  if (initQuantity.value && q <= 0) return t('dialog.errors.qtyPositive')
  if (initQuantity.value && q > maxQuantity.value) return t('dialog.errors.qtyMax', { max: maxQuantity.value.toLocaleString() })
  const dec = String(initQuantity.value).split('.')[1] ?? ''
  if (dec.length > 8) return t('dialog.errors.qtyDecimals')
  return ''
})

const avgPriceError = computed(() => {
  const p = removeComma(initAvgPrice.value)
  if (initAvgPrice.value && p <= 0) return t('dialog.errors.pricePositive')
  if (initAvgPrice.value && p > maxPrice.value) {
    const unit = isUsStock.value ? '$' : ''
    const suffix = isUsStock.value ? '' : (isKoLocale() ? '원' : 'KRW')
    return t('dialog.errors.priceMax', { amount: `${unit}${maxPrice.value.toLocaleString()}${suffix}` })
  }
  return ''
})

const isValid = computed(() => {
  if (!assetClass.value || !currency.value) return false
  if (assetClass.value !== 'cash' && (!(ticker.value?.trim() ?? '') || realTickerError.value)) return false
  if (quantityError.value || avgPriceError.value) return false
  if (assetClass.value === 'cash') return !!initAvgPrice.value && removeComma(initAvgPrice.value) > 0
  return !!initQuantity.value && Number(initQuantity.value) > 0 && !!initAvgPrice.value && removeComma(initAvgPrice.value) > 0
})

// 실제 사용하는 티커 검증 메시지 (위 tickerError/tickerErrorMsg 헬퍼 정리 대체)
const realTickerError = computed(() => {
  const tk = ticker.value?.trim() ?? ''
  if (!tk || assetClass.value === 'cash' || isKrStock.value) return ''
  if (tk.length > tickerMaxLength.value) return t('dialog.errors.tickerTooLong', { n: tickerMaxLength.value })
  if (isUsStock.value && !/^[A-Za-z]{1,5}$/.test(tk)) return t('dialog.errors.tickerFormatUs')
  return ''
})

const save = async () => {
  if (!isValid.value) return
  if (!isEditMode.value && assetClass.value !== 'cash') {
    const t2 = ticker.value.trim().toUpperCase()
    if (isUsStock.value) {
      saving.value = true
      try {
        await getStockPrice(t2, { asset_class: 'stock', market: 'US', currency: 'USD' })
      } catch {
        showMessage(t('dialog.errors.invalidTicker'), 'error')
        saving.value = false
        return
      }
    } else if (!isKrStock.value && !isKnownTicker(t2)) {
      showMessage(t('dialog.errors.unknownCoin', { label: t('dialog.tickerLabelCrypto') }), 'error')
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
      showMessage(t('dialog.errors.loginRequired'), 'error')
      return
    }

    if (isEditMode.value && props.initialData) {
      const newAccountName = normalizeAccountName(accountName.value)
      // 계좌명 변경 시 중복 체크
      if (newAccountName !== (props.initialData.account_name ?? UNASSIGNED_ACCOUNT)) {
        const { data: dup } = await supabase
          .from('portfolios')
          .select('id')
          .eq('user_id', user.id)
          .eq('ticker', props.initialData.ticker)
          .eq('account_name', newAccountName)
          .maybeSingle()
        if (dup) {
          showMessage(t('dialog.errors.duplicateInAccount', { name: getTickerDisplayName(props.initialData.ticker), account: displayAccountName(newAccountName) }), 'error')
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

      showMessage(t('dialog.errors.editSuccess'), 'success')
    } else {
      // 신규 포트폴리오 등록
      const cls = assetClass.value as AssetClass
      const mkt = cls === 'stock' ? market.value : null
      const tickerToSave =
        cls === 'cash'
          ? currency.value === 'USD'
            ? 'CASH_USD'
            : 'CASH_KRW'
          : (ticker.value?.trim() ?? '').toUpperCase()
      const accountNameToSave = normalizeAccountName(accountName.value)
      const { data: existing } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', user.id)
        .eq('ticker', tickerToSave)
        .eq('account_name', accountNameToSave)
        .maybeSingle()
      if (existing) {
        showMessage(t('dialog.errors.duplicateInAccount', { name: getTickerDisplayName(tickerToSave), account: displayAccountName(accountNameToSave) }), 'warning')
        saving.value = false
        return
      }

      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .insert({
          user_id: user.id,
          ticker: tickerToSave,
          asset_class: cls,
          market: mkt,
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

      showMessage(t('dialog.errors.addSuccess'), 'success')
    }

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
  ticker.value = ''
  krSearchQuery.value = ''
  selectedKrStock.value = null
  assetClass.value = ''
  market.value = locale.value === 'ko' ? 'KR' : 'US'
  currency.value = 'KRW'
  accountName.value = displayAccountName(UNASSIGNED_ACCOUNT)
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
        {{ isEditMode ? $t('dialog.editAsset') : $t('dialog.addAsset') }}
      </v-card-title>

      <v-card-text class="px-4 pt-0 pb-2">
        <!-- 계좌 구분 -->
        <v-text-field
          v-model="accountName"
          :label="$t('dialog.accountLabel')"
          prepend-inner-icon="mdi-bank-outline"
          variant="outlined"
          density="compact"
          maxlength="20"
          :placeholder="$t('dialog.accountUnassigned')"
          :hint="$t('dialog.accountHint')"
          @focus="() => { if (accountName.trim() === displayAccountName(UNASSIGNED_ACCOUNT)) accountName = '' }"
          @blur="() => { if (!accountName.trim()) accountName = displayAccountName(UNASSIGNED_ACCOUNT) }"
        />

        <!-- 자산군 -->
        <div class="field-block mt-2">
          <div class="field-label mb-1">{{ $t('dialog.assetClassLabel') }}</div>
          <div class="d-flex ga-2">
            <v-btn
              v-for="c in ASSET_CLASS_OPTIONS"
              :key="c"
              size="small"
              rounded="lg"
              elevation="0"
              :variant="assetClass === c ? 'flat' : 'tonal'"
              :color="assetClass === c ? 'primary' : undefined"
              :disabled="isEditMode"
              @click="assetClass = c"
            >
              {{ classLabel(c) }}
            </v-btn>
          </div>
          <div v-if="isEditMode" class="field-hint mt-1">{{ $t('dialog.classLocked') }}</div>
        </div>

        <!-- 시장 (주식일 때만) -->
        <div v-if="assetClass === 'stock'" class="field-block mt-2">
          <div class="field-label mb-1">{{ $t('dialog.marketLabel') }}</div>
          <div class="d-flex ga-2">
            <v-btn
              v-for="m in ACTIVE_MARKETS"
              :key="m"
              size="small"
              rounded="lg"
              elevation="0"
              :variant="market === m ? 'flat' : 'tonal'"
              :color="market === m ? 'primary' : undefined"
              :disabled="isEditMode"
              @click="market = m"
            >
              {{ marketLabel(m) }}
            </v-btn>
          </div>
        </div>

        <!-- 국내주식: 한글명 검색 자동완성 -->
        <v-autocomplete
          v-if="isKrStock"
          v-model="selectedKrStock"
          v-model:search="krSearchQuery"
          :items="filteredKrItems"
          item-title="name"
          return-object
          :label="$t('dialog.tickerSearchLabel')"
          :placeholder="$t('dialog.tickerSearchPlaceholder')"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          class="mt-1"
          :disabled="isEditMode"
          :hint="isEditMode ? $t('dialog.tickerLockedHint') : ''"
          :persistent-hint="isEditMode"
          :custom-filter="krFilter"
          :no-data-text="$t('etfAnalysis.noSearchResults')"
          clearable
          auto-select-first
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :subtitle="(item as any).raw?.value" />
          </template>
        </v-autocomplete>

        <!-- 해외주식 / 암호화폐: 기존 텍스트 필드 -->
        <v-text-field
          v-else-if="assetClass && !isKrStock"
          v-model="ticker"
          :label="tickerConfig.label"
          :placeholder="tickerConfig.placeholder"
          :disabled="tickerConfig.disabled || isEditMode"
          prepend-inner-icon="mdi-finance"
          variant="outlined"
          density="compact"
          class="mt-1"
          :maxlength="tickerMaxLength"
          :hint="isEditMode && assetClass !== 'cash' ? $t('dialog.tickerLockedHint') : ''"
          :error-messages="!isEditMode ? realTickerError : ''"
          :persistent-hint="isEditMode"
        />

        <!-- 통화 -->
        <v-select
          v-model="currency"
          :items="['KRW', 'USD']"
          :label="$t('dialog.currencyLabel')"
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
          <span>{{ isEditMode ? $t('dialog.initialSection') : $t('dialog.currentSection') }}</span>
        </div>

        <div class="info-banner mb-2">
          <v-icon size="14" color="primary" class="mr-1 flex-shrink-0"
            >mdi-information-outline</v-icon
          >
          <span>
            {{ isEditMode ? $t('dialog.editHoldingInfo') : $t('dialog.addHoldingInfo') }}
          </span>
        </div>

        <v-progress-linear
          v-if="loadingInitial"
          indeterminate
          color="primary"
          class="mb-3"
          rounded
        />

        <template v-if="assetClass === 'cash'">
          <v-text-field
            :model-value="initAvgPrice"
            @update:model-value="handleAvgPrice"
            :label="$t('dialog.cashAmountLabel')"
            variant="outlined"
            density="compact"
            rounded="lg"
            :prepend-inner-icon="currency === 'USD' ? 'mdi-currency-usd' : 'mdi-currency-krw'"
            placeholder="0"
            :suffix="currency === 'USD' ? 'USD' : (isKoLocale() ? '원' : 'KRW')"
            :disabled="loadingInitial"
            :error-messages="avgPriceError"
          />
        </template>
        <template v-else>
          <div class="two-col">
            <v-text-field
              :model-value="initQuantity"
              @update:model-value="handleQuantity"
              :label="$t('dialog.quantityLabel')"
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
              :label="$t('dialog.avgPriceLabel')"
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
        <div v-if="isEditMode && assetClass !== 'cash' && props.initialData" class="total-preview mt-1">
          <span class="total-label">{{ $t('dialog.currentTotalQty') }}</span>
          <span class="total-value">{{ $t('portfolio.shares', { n: props.initialData.quantity.toLocaleString() }) }}</span>
        </div>

        <!-- 합계 프리뷰 -->
        <div v-if="totalInitialAmount && assetClass !== 'cash'" class="total-preview mt-1">
          <span class="total-label">{{ $t('dialog.totalBuyAmount') }}</span>
          <span class="total-value">{{ totalInitialAmount }}</span>
        </div>
      </v-card-text>

      <v-card-actions class="px-4 py-2">
        <v-btn variant="text" :disabled="saving" @click="reset()">{{ $t('common.cancel') }}</v-btn>
        <v-spacer />
        <v-btn color="primary" :disabled="!isValid" :loading="saving" @click="save">
          {{ isEditMode ? $t('common.edit') : $t('common.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>

.field-block { display: flex; flex-direction: column; }
.field-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.field-hint {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

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
