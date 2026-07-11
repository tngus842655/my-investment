<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getStockPrice } from '@/services/market'
import { getTickerDisplayName } from '@/utils/tickerNames'
import { showMessage } from '@/composables/useSnackbar'
import { convertMoney } from '@/utils/portfolioMath'
import { useDesignTokens } from '@/composables/useDesignTokens'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { getAssetClass, getMarket, isCash, classMarketToAssetType, type AssetClass, type MarketCode } from '@/config/marketConfig'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { chart } = useDesignTokens()
const { baseCurrency, displayCurrency, money } = useBaseCurrency()
const { t } = useI18n()

const loading = ref(true)
const viewMode = ref<'type' | 'ticker' | 'compare'>('type')
const hoveredKey = ref<string | null>(null)
interface PortfolioRow {
  ticker: string
  asset_type: string
  asset_class?: AssetClass
  market?: MarketCode | null
  currency: 'KRW' | 'USD'
  avg_price: number
  quantity: number
}

// 유형별 보기의 그룹 키/라벨 (테마 typeColors 키와 동일한 기존 한글 명칭 유지)
const assetTypeLabel = (p: PortfolioRow): string =>
  classMarketToAssetType(getAssetClass(p), getMarket(p))
const portfolioRows = ref<PortfolioRow[]>([])
const exchangeRate = ref(1350)
const formatMoney = (v: number) => money(v, exchangeRate.value, 'bare')

interface Seg {
  key: string
  label: string
  valueKrw: number
  pct: number
  color: string
  startAngle: number
  endAngle: number
  path: string
}

// ── SVG 도넛 계산 ─────────────────────────────────
const CX = 120
const CY = 120
const OR = 92
const IR = 56
const GAP_DEG = 1.2

function toXY(r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }
}

function buildPath(start: number, end: number): string {
  // 단일 세그먼트 (거의 360도)인 경우 원형으로 처리
  if (end - start >= 359.5) {
    return `M ${CX} ${CY - OR} A ${OR} ${OR} 0 1 1 ${CX - 0.01} ${CY - OR} Z M ${CX} ${CY - IR} A ${IR} ${IR} 0 1 1 ${CX - 0.01} ${CY - IR} Z`
  }
  const o1 = toXY(OR, start)
  const o2 = toXY(OR, end)
  const i1 = toXY(IR, end)
  const i2 = toXY(IR, start)
  const large = end - start > 180 ? 1 : 0
  return `M ${o1.x} ${o1.y} A ${OR} ${OR} 0 ${large} 1 ${o2.x} ${o2.y} L ${i1.x} ${i1.y} A ${IR} ${IR} 0 ${large} 0 ${i2.x} ${i2.y} Z`
}

const segments = computed<Seg[]>(() => {
  const map = new Map<string, { label: string; valueKrw: number }>()
  for (const p of portfolioRows.value) {
    const key = viewMode.value === 'type' ? assetTypeLabel(p) : p.ticker
    const label = viewMode.value === 'type' ? assetTypeLabel(p) : getTickerDisplayName(p.ticker)
    const val = convertMoney(p.avg_price * p.quantity, p.currency, baseCurrency.value, exchangeRate.value)
    const existing = map.get(key)
    if (existing) existing.valueKrw += val
    else map.set(key, { label, valueKrw: val })
  }

  const total = [...map.values()].reduce((s, v) => s + v.valueKrw, 0)
  if (total === 0) return []

  const sorted = [...map.entries()].sort((a, b) => b[1].valueKrw - a[1].valueKrw)

  let angle = 0
  let colorIdx = 0
  return sorted.map(([key, val]) => {
    const pct = (val.valueKrw / total) * 100
    const sweep = (pct / 100) * 360
    const palette = chart.value.palette
    const typeColors = chart.value.typeColors
    const color = viewMode.value === 'type'
      ? (typeColors[key] ?? palette[colorIdx % palette.length]!)
      : palette[colorIdx % palette.length]!
    const gap = sorted.length > 1 ? GAP_DEG : 0
    const s: Seg = {
      key,
      label: val.label,
      valueKrw: val.valueKrw,
      pct,
      color,
      startAngle: angle + gap / 2,
      endAngle: angle + sweep - gap / 2,
      path: buildPath(angle + gap / 2, angle + sweep - gap / 2),
    }
    angle += sweep
    colorIdx++
    return s
  })
})

const totalKrw = computed(() => portfolioRows.value.reduce((s, p) => s + convertMoney(p.avg_price * p.quantity, p.currency, baseCurrency.value, exchangeRate.value), 0))

const hovered = computed(() => segments.value.find((s) => s.key === hoveredKey.value) ?? null)

const loadData = async () => {
  loading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [portfolioResult, rate] = await Promise.all([supabase.from('portfolios').select('*').eq('user_id', user.id), getCachedExchangeRate()])
    portfolioRows.value = portfolioResult.data ?? []
    exchangeRate.value = rate
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

// ── 종목 비교 ─────────────────────────────────────
const COMPARE_MAX = 4

interface Holding {
  ticker: string
  label: string
  assetClass: AssetClass
  currency: 'KRW' | 'USD'
  quantity: number
  costKrw: number
}

// 계좌가 달라도 같은 종목이면 수량·원가를 합산해 하나로 집계 (현금 제외)
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
    // 암호화폐+KRW는 avg_price가 사용자가 직접 입력한 KRW 원가라 변환이 필요 없음 (costNative는 종목 통화 단위)
    costKrw: convertMoney(v.costNative, v.currency, baseCurrency.value, exchangeRate.value),
  }))
})

const compareTickers = ref<string[]>([])
const priceCache = ref<Record<string, number>>({})
const pricesLoaded = ref(false)
const loadingPrices = ref(false)

// 비교 탭 진입 시 보유 종목 전체 현재가를 한 번에 조회 (선택할 때마다 개별 호출하지 않음)
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
    // 암호화폐 시세는 USD로 오므로, 통화가 USD가 아닌 종목은 종목 통화로 먼저 환산
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

  // 선택한 종목들의 평가금액 합을 100%로 놓았을 때 각 종목의 비중
  const total = rows.reduce((s, r) => s + (r.evalKrw ?? 0), 0)
  return rows.map((r) => ({
    ...r,
    sharePct: r.evalKrw !== null && total > 0 ? (r.evalKrw / total) * 100 : null,
  }))
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div class="d-flex align-center ga-2">
        <v-btn icon="mdi-arrow-left" variant="text" size="small" class="mr-1" style="color: rgb(var(--v-theme-on-surface))" @click="router.back()" />
        <div>
          <div class="font-weight-bold">{{ $t('portfolioAnalysis.title') }}</div>
          <div class="text-medium-emphasis">{{ $t('portfolioAnalysis.subtitle') }}</div>
        </div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="card" class="rounded-2xl mb-4" />
      <v-skeleton-loader type="list-item-three-line" class="rounded-2xl" />
    </template>

    <template v-else-if="segments.length === 0">
      <div class="empty-state">
        <v-icon size="56" color="primary" class="mb-3" style="opacity:0.4">mdi-chart-donut</v-icon>
        <div class="font-weight-medium mb-1">{{ $t('portfolioAnalysis.emptyTitle') }}</div>
        <div class="text-medium-emphasis">{{ $t('portfolioAnalysis.emptyHint') }}</div>
      </div>
    </template>

    <template v-else>
      <!-- 뷰 모드 토글 -->
      <div class="toggle-row mb-4">
        <button class="toggle-btn" :class="{ active: viewMode === 'type' }" @click="viewMode = 'type'">{{ $t('portfolioAnalysis.byType') }}</button>
        <button class="toggle-btn" :class="{ active: viewMode === 'ticker' }" @click="viewMode = 'ticker'">{{ $t('portfolioAnalysis.byTicker') }}</button>
        <button class="toggle-btn" :class="{ active: viewMode === 'compare' }" @click="viewMode = 'compare'; loadAllPrices()">{{ $t('portfolioAnalysis.compare') }}</button>
      </div>

      <!-- 종목 비교 -->
      <template v-if="viewMode === 'compare'">
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

      <template v-else>
        <!-- 도넛 차트 카드 -->
        <div class="chart-card mb-4">
          <div class="chart-wrap">
            <svg viewBox="0 0 240 240" class="donut-svg">
              <!-- 배경 링 -->
              <circle :cx="CX" :cy="CY" :r="(OR + IR) / 2" fill="none" stroke="rgba(128,128,128,0.08)" :stroke-width="OR - IR" />

              <!-- 세그먼트 -->
              <path
                v-for="(seg, i) in segments"
                :key="seg.key"
                :d="seg.path"
                :fill="seg.color"
                :opacity="hoveredKey && hoveredKey !== seg.key ? 0.35 : 1"
                class="seg-path"
                :style="{ '--delay': `${i * 0.06}s`, transform: seg.key === hoveredKey ? 'scale(1.04)' : 'scale(1)' }"
                @mouseenter="hoveredKey = seg.key"
                @mouseleave="hoveredKey = null"
                @touchstart.passive="hoveredKey = seg.key"
                @touchend.passive="hoveredKey = null"
              />

              <!-- 중앙 텍스트 -->
              <text x="120" y="108" text-anchor="middle" class="center-label">
                {{ hovered ? hovered.label : $t('portfolioAnalysis.totalAsset') }}
              </text>
              <text x="120" y="130" text-anchor="middle" class="center-value">
                {{ hovered ? hovered.pct.toFixed(1) + '%' : formatMoney(totalKrw) }}
              </text>
              <text v-if="hovered" x="120" y="150" text-anchor="middle" class="center-sub">
                {{ formatMoney(hovered.valueKrw) }}
              </text>
            </svg>
          </div>
        </div>

        <!-- 범례 리스트 -->
        <div class="legend-card">
          <div
            v-for="seg in segments"
            :key="seg.key"
            class="legend-row"
            :class="{ 'legend-dimmed': hoveredKey && hoveredKey !== seg.key, 'legend-active': hoveredKey === seg.key }"
            @mouseenter="hoveredKey = seg.key"
            @mouseleave="hoveredKey = null"
          >
            <div class="legend-dot" :style="{ background: seg.color }" />
            <div class="legend-info">
              <div class="legend-name">{{ seg.label }}</div>
            </div>
            <div class="legend-right">
              <span class="legend-pct" :style="{ color: seg.color }">{{ seg.pct.toFixed(1) }}%</span>
              <span class="legend-val">{{ formatMoney(seg.valueKrw) }}</span>
            </div>
            <!-- 비중 바 -->
            <div class="legend-bar-wrap">
              <div class="legend-bar" :style="{ width: seg.pct + '%', background: seg.color }" />
            </div>
          </div>
        </div>

        <div class="text-medium-emphasis text-center mt-3" style="opacity:0.6">{{ $t('portfolioAnalysis.costBasisNote') }}</div>
      </template>
    </template>
  </v-container>
</template>

<style scoped>

.toggle-row {
  display: flex;
  gap: 8px;
}
.toggle-btn {
  flex: 1;
  padding: 9px 0;
  border-radius: 14px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.1);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.toggle-btn.active {
  background: rgb(var(--v-theme-primary));
  border-color: transparent;
  color: #fff;
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

.chart-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 24px;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.chart-wrap {
  width: 100%;
  max-width: 260px;
}
.donut-svg {
  width: 100%;
  height: auto;
  display: block;
}

.seg-path {
  transition: opacity 0.2s ease, transform 0.2s ease;
  transform-origin: 120px 120px;
  cursor: pointer;
  animation: segFadeIn 0.5s ease var(--delay, 0s) both;
}

@keyframes segFadeIn {
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
}

.center-label {
  font-size: 0.6875rem;
  fill: rgba(var(--v-theme-on-surface), 0.5);
  font-family: inherit;
}
.center-value {
  font-size: 1.125rem;
  font-weight: 700;
  fill: rgb(var(--v-theme-on-surface));
  font-family: inherit;
}
.center-sub {
  font-size: 0.75rem;
  fill: rgba(var(--v-theme-on-surface), 0.55);
  font-family: inherit;
}

.legend-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 20px;
  overflow: hidden;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 8px;
  cursor: pointer;
  transition: opacity 0.2s ease;
  flex-wrap: wrap;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.04);
}
.legend-row:last-child {
  border-bottom: none;
}
.legend-dimmed { opacity: 0.3; }
.legend-active { background: rgba(var(--v-theme-on-surface), 0.03); }

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.legend-info {
  flex: 1;
  min-width: 0;
}
.legend-name {
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.legend-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.legend-pct {
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.2;
}
.legend-val {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.legend-bar-wrap {
  width: 100%;
  height: 4px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 2px;
  margin-top: 6px;
  margin-bottom: 2px;
  overflow: hidden;
}
.legend-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 0;
}
</style>
