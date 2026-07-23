<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { useUserDataStore } from '@/stores/userData'
import { getCachedStockQuote } from '@/services/market'
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
const userDataStore = useUserDataStore()

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
  return [...map.entries()]
    .map(([ticker, v]) => ({
      ticker,
      label: getTickerDisplayName(ticker),
      assetClass: v.assetClass,
      currency: v.currency,
      quantity: v.quantity,
      costKrw: convertMoney(v.costNative, v.currency, baseCurrency.value, exchangeRate.value),
    }))
    // 큰 종목부터 고르기 쉽도록 원가 기준 내림차순 정렬
    .sort((a, b) => b.costKrw - a.costKrw)
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
        return getCachedStockQuote(row.ticker, row).then((q) => q.price).catch(() => 0)
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

// 막대 기준 토글: 비중(share) ↔ 수익률(profit)
const barMode = ref<'share' | 'profit'>('share')
// 수익률 막대는 선택 종목 중 최대 절댓값을 100%로 잡아 상대 비교 (부호는 색으로 구분)
const maxAbsProfit = computed(() => {
  const vals = compareRows.value.map((r) => r.profitRate).filter((v): v is number => v !== null).map(Math.abs)
  return vals.length ? Math.max(...vals, 1) : 1
})
const profitBarWidth = (rate: number | null) => (rate === null ? 0 : (Math.abs(rate) / maxAbsProfit.value) * 100)

const loadData = async () => {
  loading.value = true
  try {
    const [rows, rate] = await Promise.all([userDataStore.ensurePortfolios(), getCachedExchangeRate()])
    portfolioRows.value = rows as PortfolioRow[]
    exchangeRate.value = rate
    // 진입 즉시 비교 결과가 보이도록 상위(원가 큰) 종목을 최대 3개 자동 선택
    if (compareTickers.value.length === 0) {
      compareTickers.value = holdings.value.slice(0, Math.min(3, holdings.value.length)).map((h) => h.ticker)
    }
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
        <div class="bar-mode-toggle mb-3">
          <button
            class="bar-mode-btn"
            :class="{ 'bar-mode-btn-active': barMode === 'share' }"
            @click="barMode = 'share'"
          >{{ $t('portfolioAnalysis.barModeShare') }}</button>
          <button
            class="bar-mode-btn"
            :class="{ 'bar-mode-btn-active': barMode === 'profit' }"
            @click="barMode = 'profit'"
          >{{ $t('portfolioAnalysis.barModeProfit') }}</button>
        </div>

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
            <span
              v-if="barMode === 'share' && row.sharePct !== null"
              class="font-weight-bold"
              :style="{ color: row.color }"
            >{{ row.sharePct.toFixed(1) }}%</span>
            <span
              v-else-if="barMode === 'profit' && row.profitRate !== null"
              class="font-weight-bold"
              :class="row.profitRate >= 0 ? 'text-success' : 'text-error'"
            >{{ row.profitRate >= 0 ? '+' : '' }}{{ row.profitRate.toFixed(1) }}%</span>
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
                v-if="barMode === 'share'"
                class="compare-bar"
                :style="{ width: (row.sharePct ?? 0) + '%', background: row.color }"
              />
              <div
                v-else
                class="compare-bar"
                :style="{ width: profitBarWidth(row.profitRate) + '%', background: (row.profitRate ?? 0) >= 0 ? 'rgb(var(--v-theme-success))' : 'rgb(var(--v-theme-error))' }"
              />
            </div>
          </template>
        </div>
        <div class="text-medium-emphasis text-center mt-3" style="opacity:0.6">
          {{ barMode === 'share' ? $t('portfolioAnalysis.shareNote') : $t('portfolioAnalysis.profitNote') }}
        </div>
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
.bar-mode-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.bar-mode-btn {
  padding: 5px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.bar-mode-btn-active {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-primary));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
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
