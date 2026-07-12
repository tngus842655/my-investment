<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getStockPrice } from '@/services/market'
import { getTickerDisplayName } from '@/utils/tickerNames'
import { showMessage } from '@/composables/useSnackbar'
import { convertMoney } from '@/utils/portfolioMath'
import { useDesignTokens } from '@/composables/useDesignTokens'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { getAssetClass, isCash, type AssetClass, type MarketCode } from '@/config/marketConfig'
import { useI18n } from 'vue-i18n'

const { chart } = useDesignTokens()
const { baseCurrency, displayCurrency, money } = useBaseCurrency()
const { t } = useI18n()

const loading = ref(true)
const exchangeRate = ref(1350)
const formatMoney = (v: number) => money(v, exchangeRate.value, 'bare')

interface PortfolioRow {
  ticker: string
  asset_class?: AssetClass
  market?: MarketCode | null
  currency: 'KRW' | 'USD'
  avg_price: number
  quantity: number
}
const portfolioRows = ref<PortfolioRow[]>([])

const COMPARE_MAX = 4

interface Holding {
  ticker: string
  label: string
  assetClass: AssetClass
  currency: 'KRW' | 'USD'
  quantity: number
  costKrw: number
}

const holdings = computed<Holding[]>(() => {
  const map = new Map<string, { quantity: number; costNative: number; currency: 'KRW' | 'USD'; assetClass: AssetClass }>()
  for (const p of portfolioRows.value) {
    if (isCash(p)) continue
    const existing = map.get(p.ticker)
    const costNative = p.avg_price * p.quantity
    if (existing) {
      existing.quantity += p.quantity
      existing.costNative += costNative
    } else {
      map.set(p.ticker, { quantity: p.quantity, costNative, currency: p.currency, assetClass: getAssetClass(p) })
    }
  }
  return [...map.entries()].map(([ticker, v]) => ({
    ticker,
    label: getTickerDisplayName(ticker),
    assetClass: v.assetClass,
    currency: v.currency,
    quantity: v.quantity,
    costKrw: convertMoney(v.costNative, v.currency, baseCurrency.value, exchangeRate.value),
  }))
})

const compareTickers = ref<string[]>([])
const priceCache = ref<Record<string, number>>({})
const pricesLoaded = ref(false)
const loadingPrices = ref(false)

const loadAllPrices = async () => {
  if (loadingPrices.value || pricesLoaded.value) return
  loadingPrices.value = true
  try {
    const targets = holdings.value
    const results = await Promise.all(
      targets.map((h) => {
        const row = portfolioRows.value.find((p) => p.ticker === h.ticker)
        if (!row) return Promise.resolve(0)
        return getStockPrice(row.ticker, row).catch(() => 0)
      }),
    )
    const next: Record<string, number> = {}
    targets.forEach((h, i) => { next[h.ticker] = results[i] ?? 0 })
    priceCache.value = next
    pricesLoaded.value = true
  } finally {
    loadingPrices.value = false
  }
}

const toggleCompareTicker = (ticker: string) => {
  if (compareTickers.value.includes(ticker)) {
    compareTickers.value = compareTickers.value.filter((t) => t !== ticker)
    return
  }
  if (compareTickers.value.length >= COMPARE_MAX) {
    showMessage(t('portfolioAnalysis.maxCompare', { n: COMPARE_MAX }), 'error')
    return
  }
  compareTickers.value = [...compareTickers.value, ticker]
}

interface CompareRow {
  ticker: string
  label: string
  color: string
  evalKrw: number | null
  profitRate: number | null
  sharePct: number | null
}

const compareRows = computed<CompareRow[]>(() => {
  const rows = compareTickers.value.map((ticker, i) => {
    const h = holdings.value.find((x) => x.ticker === ticker)!
    const price = priceCache.value[ticker]
    const hasPrice = price !== undefined && price > 0
    const isCryptoNonUsd = h.assetClass === 'crypto' && h.currency !== 'USD'
    const priceInCurrency = hasPrice
      ? (isCryptoNonUsd ? convertMoney(price, 'USD', h.currency, exchangeRate.value) : price)
      : null
    const evaluationAmount = priceInCurrency !== null ? priceInCurrency * h.quantity : null
    const evalKrw = evaluationAmount !== null
      ? convertMoney(evaluationAmount, h.currency, baseCurrency.value, exchangeRate.value)
      : null
    const profitRate = evalKrw !== null && h.costKrw > 0 ? ((evalKrw - h.costKrw) / h.costKrw) * 100 : null
    return {
      ticker,
      label: h.label,
      color: chart.value.palette[i % chart.value.palette.length]!,
      evalKrw,
      profitRate,
    }
  })

  const total = rows.reduce((s, r) => s + (r.evalKrw ?? 0), 0)
  return rows.map((r) => ({
    ...r,
    sharePct: r.evalKrw !== null && total > 0 ? (r.evalKrw / total) * 100 : null,
  }))
})

const loadData = async () => {
  loading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [portfolioResult, rate] = await Promise.all([supabase.from('portfolios').select('*').eq('user_id', user.id), getCachedExchangeRate()])
    portfolioRows.value = portfolioResult.data ?? []
    exchangeRate.value = rate
    loadAllPrices()
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="panel-scroll">
    <template v-if="loading">
      <v-skeleton-loader type="card" class="rounded-2xl mb-4" />
      <v-skeleton-loader type="list-item-three-line" class="rounded-2xl" />
    </template>

    <template v-else>
      <div class="compare-card mb-4">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="font-weight-medium">{{ $t('portfolioAnalysis.selectToCompare') }}</div>
          <div class="text-medium-emphasis">{{ compareTickers.length }} / {{ COMPARE_MAX }}</div>
        </div>
        <div class="compare-chip-wrap">
          <button
            v-for="h in holdings"
            :key="h.ticker"
            class="compare-chip"
            :class="{ 'compare-chip-active': compareTickers.includes(h.ticker) }"
            @click="toggleCompareTicker(h.ticker)"
          >{{ h.label }}</button>
        </div>
      </div>

      <div v-if="holdings.length === 0" class="empty-state">
        <v-icon size="48" color="primary" class="mb-3" style="opacity:0.4">mdi-compare-horizontal</v-icon>
        <div class="text-medium-emphasis">{{ $t('portfolioAnalysis.noCompareTargets') }}</div>
      </div>

      <div v-else-if="compareRows.length < 2" class="empty-state">
        <v-icon size="48" color="primary" class="mb-3" style="opacity:0.4">mdi-compare-horizontal</v-icon>
        <div class="text-medium-emphasis">{{ $t('portfolioAnalysis.selectAtLeast2') }}</div>
      </div>

      <div v-else class="compare-card">
        <div
          v-for="row in compareRows"
          :key="row.ticker"
          class="compare-row"
        >
          <div class="d-flex align-center justify-space-between mb-1">
            <div class="d-flex align-center ga-2" style="min-width: 0">
              <span class="compare-dot" :style="{ background: row.color }" />
              <span class="compare-name">{{ row.label }}</span>
            </div>
            <span v-if="row.sharePct !== null" class="font-weight-bold" :style="{ color: row.color }">{{ row.sharePct.toFixed(1) }}%</span>
          </div>

          <template v-if="loadingPrices">
            <v-skeleton-loader type="text" width="140" />
          </template>
          <template v-else-if="row.evalKrw === null">
            <div class="text-medium-emphasis">{{ $t('portfolioAnalysis.priceFailed') }}</div>
          </template>
          <template v-else>
            <div class="mb-1">
              <span class="text-medium-emphasis">{{ formatMoney(row.evalKrw) }}{{ displayCurrency === 'USD' ? '' : $t('currency.wonUnit') }}</span>
              <span
                v-if="row.profitRate !== null"
                class="font-weight-medium ml-1"
                style="font-size: 0.6875rem"
                :class="row.profitRate >= 0 ? 'text-success' : 'text-error'"
              >({{ row.profitRate >= 0 ? '+' : '' }}{{ row.profitRate.toFixed(1) }}%)</span>
            </div>
            <div class="compare-bar-wrap">
              <div
                class="compare-bar"
                :style="{ width: (row.sharePct ?? 0) + '%', background: row.color }"
              />
            </div>
          </template>
        </div>
        <div class="text-medium-emphasis text-center mt-3" style="opacity:0.6">{{ $t('portfolioAnalysis.shareNote') }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.compare-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 20px;
  padding: 16px;
}
.compare-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.compare-chip {
  padding: 7px 14px;
  border-radius: 99px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.12);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.compare-chip-active {
  background: rgb(var(--v-theme-primary));
  border-color: transparent;
  color: #fff;
}
.compare-row {
  padding: 14px 0;
}
.compare-row + .compare-row {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.compare-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.compare-name {
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.compare-bar-wrap {
  width: 100%;
  height: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 3px;
  overflow: hidden;
}
.compare-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 0;
}
</style>
