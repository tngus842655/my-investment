<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { useUserDataStore } from '@/stores/userData'
import { convertMoney } from '@/utils/portfolioMath'
import { useDesignTokens } from '@/composables/useDesignTokens'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { getAssetClass, getMarket, classMarketToAssetType, displayAssetType, type AssetClass, type MarketCode } from '@/config/marketConfig'

const { chart } = useDesignTokens()
const { baseCurrency, money } = useBaseCurrency()
const userDataStore = useUserDataStore()

const loading = ref(true)
const hoveredKey = ref<string | null>(null)

interface PortfolioRow {
  ticker: string
  asset_class?: AssetClass
  market?: MarketCode | null
  currency: 'KRW' | 'USD'
  avg_price: number
  quantity: number
}

const assetTypeLabel = (p: PortfolioRow): string => classMarketToAssetType(getAssetClass(p), getMarket(p))
const portfolioRows = ref<PortfolioRow[]>([])
const exchangeRate = ref(1350)
const formatMoney = (v: number) => money(v, exchangeRate.value, 'bare')

interface Seg {
  key: string
  label: string
  valueKrw: number
  pct: number
  color: string
  path: string
}

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
    const key = assetTypeLabel(p)
    const label = displayAssetType(key)
    const val = convertMoney(p.avg_price * p.quantity, p.currency, baseCurrency.value, exchangeRate.value)
    const existing = map.get(key)
    if (existing) existing.valueKrw += val
    else map.set(key, { label, valueKrw: val })
  }

  const total = [...map.values()].reduce((s, v) => s + v.valueKrw, 0)
  if (total === 0) return []

  const sorted = [...map.entries()].sort((a, b) => b[1].valueKrw - a[1].valueKrw)

  let angle = 0
  return sorted.map(([key, val]) => {
    const pct = (val.valueKrw / total) * 100
    const sweep = (pct / 100) * 360
    const color = chart.value.typeColors[key] ?? chart.value.palette[0]!
    const gap = sorted.length > 1 ? GAP_DEG : 0
    const s: Seg = {
      key,
      label: val.label,
      valueKrw: val.valueKrw,
      pct,
      color,
      path: buildPath(angle + gap / 2, angle + sweep - gap / 2),
    }
    angle += sweep
    return s
  })
})

const totalKrw = computed(() => portfolioRows.value.reduce((s, p) => s + convertMoney(p.avg_price * p.quantity, p.currency, baseCurrency.value, exchangeRate.value), 0))
const hovered = computed(() => segments.value.find((s) => s.key === hoveredKey.value) ?? null)

const loadData = async () => {
  loading.value = true
  try {
    const [rows, rate] = await Promise.all([userDataStore.ensurePortfolios(), getCachedExchangeRate()])
    portfolioRows.value = rows as PortfolioRow[]
    exchangeRate.value = rate
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

    <template v-else-if="segments.length === 0">
      <div class="empty-state">
        <v-icon size="56" color="primary" class="mb-3" style="opacity:0.4">mdi-chart-donut</v-icon>
        <div class="font-weight-medium mb-1">{{ $t('portfolioAnalysis.emptyTitle') }}</div>
        <div class="text-medium-emphasis">{{ $t('portfolioAnalysis.emptyHint') }}</div>
      </div>
    </template>

    <template v-else>
      <div class="chart-card mb-4">
        <div class="chart-wrap">
          <svg viewBox="0 0 240 240" class="donut-svg">
            <circle :cx="CX" :cy="CY" :r="(OR + IR) / 2" fill="none" stroke="rgba(128,128,128,0.08)" :stroke-width="OR - IR" />
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
          <div class="legend-bar-wrap">
            <div class="legend-bar" :style="{ width: seg.pct + '%', background: seg.color }" />
          </div>
        </div>
      </div>

      <div class="text-medium-emphasis text-center mt-3" style="opacity:0.6">{{ $t('portfolioAnalysis.costBasisNote') }}</div>
    </template>
  </div>
</template>

<style scoped>
.panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
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
