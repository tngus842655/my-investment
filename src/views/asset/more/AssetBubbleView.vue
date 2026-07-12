<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getStockQuote } from '@/services/market'
import { getTickerDisplayName } from '@/utils/tickerNames'
import { convertMoney } from '@/utils/portfolioMath'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { getAssetClass, isCash, type AssetClass, type MarketCode } from '@/config/marketConfig'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { baseCurrency, money } = useBaseCurrency()
const { t } = useI18n()

const loading = ref(true)

interface PortfolioRow {
  ticker: string
  asset_class?: AssetClass
  market?: MarketCode | null
  currency: 'KRW' | 'USD'
  avg_price: number
  quantity: number
}

interface Bubble {
  ticker: string
  label: string
  valueBase: number       // 기준통화 평가금액 (원 크기 기준)
  changeRate: number | null
  x: number
  y: number
  r: number
  color: string           // 기본 채움색
  stroke: string          // 밝은 테두리
  glow: string            // 외곽 발광색
}

const bubbles = ref<Bubble[]>([])
const viewBox = ref('0 0 100 100')
const exchangeRate = ref(1350)
const totalBase = computed(() => bubbles.value.reduce((s, b) => s + b.valueBase, 0))
const maxR = computed(() => bubbles.value.reduce((m, b) => Math.max(m, b.r), 0))
const asOfDate = new Date().toISOString().slice(0, 10).replace(/-/g, '.')

// 등락률 → 색상 (한국식: 상승 빨강 / 하락 파랑 / 보합·미조회 회색), 변동폭이 클수록 진하게.
// 기본 채움 + 밝은 테두리 + 외곽 발광색을 함께 산출해 입체감을 준다.
const colorParts = (cr: number | null): { color: string; stroke: string; glow: string } => {
  const neutral = cr === null || Math.abs(cr) < 0.005
  const mag = neutral ? 0 : Math.min(Math.abs(cr) / 3, 1) // 3% 이상이면 최대 채도
  const hue = neutral ? 220 : cr! > 0 ? 4 : 212
  const sat = neutral ? 8 : 62 + mag * 20
  const light = neutral ? 52 : 58 - mag * 10
  return {
    color: `hsl(${hue}, ${sat}%, ${light}%)`,
    stroke: `hsl(${hue}, ${sat}%, ${light + 16}%)`,
    glow: `hsla(${hue}, ${sat}%, ${light + 12}%, 0.55)`,
  }
}

// 종목명·등락률 텍스트를 넣기에 충분히 큰 원만 텍스트 표시 (작은 원은 생략)
const showText = (b: Bubble) => b.r >= maxR.value * 0.3
const showChange = (b: Bubble) => b.r >= maxR.value * 0.26
const showName = (b: Bubble) => b.r >= maxR.value * 0.55 && b.label !== b.ticker
const fmtChange = (cr: number | null) => cr === null ? '-' : `${cr >= 0 ? '+' : ''}${cr.toFixed(2)}%`

// ── 골든앵글 스파이럴 패킹 (D3 없이 경량 구현) ─────────────
// 큰 원부터 중심 근처에 배치하고, 이후 원은 나선을 따라 겹치지 않는 첫 지점에 놓는다.
function packCircles(radii: number[]): { x: number; y: number }[] {
  const GAP = maxRadius(radii) * 0.04
  const step = maxRadius(radii) * 0.5
  const GOLDEN = 2.399963229728653
  const placed: { x: number; y: number; r: number }[] = []

  for (const r of radii) {
    if (placed.length === 0) {
      placed.push({ x: 0, y: 0, r })
      continue
    }
    for (let i = 1; ; i++) {
      const rad = step * Math.sqrt(i)
      const ang = i * GOLDEN
      const x = rad * Math.cos(ang)
      const y = rad * Math.sin(ang)
      const collides = placed.some((p) => {
        const dx = p.x - x
        const dy = p.y - y
        return Math.hypot(dx, dy) < p.r + r + GAP
      })
      if (!collides) {
        placed.push({ x, y, r })
        break
      }
      if (i > 100000) { placed.push({ x, y, r }); break } // 안전장치 (사실상 도달 안 함)
    }
  }
  return placed.map(({ x, y }) => ({ x, y }))
}

function maxRadius(radii: number[]): number {
  return radii.reduce((m, r) => Math.max(m, r), 0) || 1
}

const loadData = async () => {
  loading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [portfolioResult, rate] = await Promise.all([
      supabase.from('portfolios').select('*').eq('user_id', user.id),
      getCachedExchangeRate(),
    ])
    exchangeRate.value = rate
    const rows = (portfolioResult.data ?? []) as PortfolioRow[]

    // 계좌가 달라도 같은 종목이면 수량·원가 합산
    const map = new Map<string, { quantity: number; costNative: number; currency: 'KRW' | 'USD'; assetClass: AssetClass; cash: boolean; row: PortfolioRow }>()
    for (const p of rows) {
      const existing = map.get(p.ticker)
      const costNative = p.avg_price * p.quantity
      if (existing) {
        existing.quantity += p.quantity
        existing.costNative += costNative
      } else {
        map.set(p.ticker, { quantity: p.quantity, costNative, currency: p.currency, assetClass: getAssetClass(p), cash: isCash(p), row: p })
      }
    }
    const holdings = [...map.entries()]

    // 현금 외 종목은 현재가+등락률 조회 (병렬). 실패하면 원가 기준으로 폴백(회색)
    const quotes = await Promise.all(
      holdings.map(([, h]) =>
        h.cash
          ? Promise.resolve<{ price: number | null; changeRate: number | null }>({ price: null, changeRate: null })
          : getStockQuote(h.row.ticker, h.row).catch(() => ({ price: null, changeRate: null })),
      ),
    )

    const built = holdings.map(([ticker, h], i) => {
      const q = quotes[i]!
      let valueNative: number
      if (q.price !== null && q.price > 0) {
        // 암호화폐 시세는 USD로 오므로, 통화가 USD가 아니면 종목 통화로 먼저 환산
        const isCryptoNonUsd = h.assetClass === 'crypto' && h.currency !== 'USD'
        const priceInCurrency = isCryptoNonUsd ? convertMoney(q.price, 'USD', h.currency, exchangeRate.value) : q.price
        valueNative = priceInCurrency * h.quantity
      } else {
        valueNative = h.costNative // 시세 조회 실패·현금: 원가/잔액 기준
      }
      const valueBase = convertMoney(valueNative, h.currency, baseCurrency.value, exchangeRate.value)
      return { ticker, label: getTickerDisplayName(ticker), valueBase, changeRate: q.changeRate }
    }).filter((b) => b.valueBase > 0)

    // 평가금액 비중 → 면적 비례(반지름 = √value)로 원 크기 산출
    built.sort((a, b) => b.valueBase - a.valueBase)
    const radii = built.map((b) => Math.sqrt(b.valueBase))
    const positions = packCircles(radii)

    const result: Bubble[] = built.map((b, i) => ({
      ...b,
      r: radii[i]!,
      x: positions[i]!.x,
      y: positions[i]!.y,
      ...colorParts(b.changeRate),
    }))

    // viewBox를 전체 버블 경계에 맞춰 자동 설정 (화면 꽉 채우기)
    if (result.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const b of result) {
        minX = Math.min(minX, b.x - b.r)
        minY = Math.min(minY, b.y - b.r)
        maxX = Math.max(maxX, b.x + b.r)
        maxY = Math.max(maxY, b.y + b.r)
      }
      const pad = (maxX - minX) * 0.04
      viewBox.value = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
    }
    bubbles.value = result
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="bubble-page">
    <!-- 헤더 -->
    <div class="bubble-header">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" style="color: #fff" @click="router.back()" />
      <div class="header-title">{{ $t('assetBubble.title') }}</div>
      <div class="header-total" v-if="!loading && bubbles.length">
        <div class="total-label">{{ $t('assetBubble.totalAsset') }}</div>
        <div class="total-value">{{ money(totalBase, exchangeRate) }}</div>
        <div class="total-date">{{ asOfDate }} {{ $t('assetBubble.asOf') }}</div>
      </div>
    </div>

    <template v-if="loading">
      <div class="center-state">
        <v-progress-circular indeterminate color="primary" />
      </div>
    </template>

    <template v-else-if="bubbles.length === 0">
      <div class="center-state">
        <v-icon size="56" color="primary" class="mb-3" style="opacity:0.4">mdi-chart-bubble</v-icon>
        <div style="color: rgba(255,255,255,0.6)">{{ $t('assetBubble.empty') }}</div>
      </div>
    </template>

    <template v-else>
      <div class="bubble-stage">
        <svg :viewBox="viewBox" class="bubble-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <!-- 구체 광택: 좌상단 하이라이트 + 하단 가장자리 음영 -->
            <radialGradient id="bubbleGlass" cx="38%" cy="30%" r="72%">
              <stop offset="0%" stop-color="#fff" stop-opacity="0.4" />
              <stop offset="42%" stop-color="#fff" stop-opacity="0.05" />
              <stop offset="78%" stop-color="#000" stop-opacity="0.02" />
              <stop offset="100%" stop-color="#000" stop-opacity="0.28" />
            </radialGradient>
          </defs>
          <g
            v-for="(b, i) in bubbles"
            :key="b.ticker"
            class="bubble-g"
            :style="{ '--delay': `${i * 0.04}s` }"
          >
            <!-- 발광 + 기본 채움 -->
            <circle
              :cx="b.x" :cy="b.y" :r="b.r"
              :fill="b.color"
              :stroke="b.stroke"
              :stroke-width="b.r * 0.02"
              :style="{ filter: `drop-shadow(0 0 ${b.r * 0.16}px ${b.glow})` }"
            />
            <!-- 광택 오버레이 -->
            <circle :cx="b.x" :cy="b.y" :r="b.r" fill="url(#bubbleGlass)" pointer-events="none" />

            <template v-if="showText(b)">
              <!-- 이름 서브라벨이 있으면 3줄, 없으면 2줄로 세로 정렬 -->
              <template v-if="showName(b)">
                <text :x="b.x" :y="b.y - b.r * 0.2" text-anchor="middle" class="bubble-ticker" :style="{ fontSize: `${b.r * 0.3}px` }">{{ b.ticker }}</text>
                <text :x="b.x" :y="b.y + b.r * 0.04" text-anchor="middle" class="bubble-name" :style="{ fontSize: `${b.r * 0.15}px` }">{{ b.label }}</text>
                <text v-if="showChange(b)" :x="b.x" :y="b.y + b.r * 0.34" text-anchor="middle" class="bubble-change" :style="{ fontSize: `${b.r * 0.2}px` }">{{ fmtChange(b.changeRate) }}</text>
              </template>
              <template v-else>
                <text :x="b.x" :y="b.y - (showChange(b) ? b.r * 0.06 : -b.r * 0.12)" text-anchor="middle" class="bubble-ticker" :style="{ fontSize: `${b.r * 0.34}px` }">{{ b.ticker }}</text>
                <text v-if="showChange(b)" :x="b.x" :y="b.y + b.r * 0.34" text-anchor="middle" class="bubble-change" :style="{ fontSize: `${b.r * 0.22}px` }">{{ fmtChange(b.changeRate) }}</text>
              </template>
            </template>
          </g>
        </svg>
      </div>

      <!-- 범례 -->
      <div class="bubble-legend">
        <span class="legend-item"><span class="legend-dot" style="background: hsl(4, 72%, 55%)" />{{ $t('assetBubble.up') }}</span>
        <span class="legend-item"><span class="legend-dot" style="background: hsl(212, 72%, 55%)" />{{ $t('assetBubble.down') }}</span>
        <span class="legend-item"><span class="legend-dot" style="background: hsl(220, 8%, 52%)" />{{ $t('assetBubble.flat') }}</span>
        <span class="legend-note">{{ $t('assetBubble.sizeNote') }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bubble-page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  /* 목업과 동일한 우주 느낌 다크 배경 (테마와 무관하게 이 화면은 다크 고정) */
  background:
    radial-gradient(ellipse 120% 80% at 50% 22%, #1a2942 0%, #0e1830 42%, #070c18 100%);
  overflow: hidden;
}

/* 은은한 별빛 */
.bubble-page::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.5), transparent),
    radial-gradient(1px 1px at 78% 12%, rgba(255,255,255,0.4), transparent),
    radial-gradient(1px 1px at 33% 42%, rgba(255,255,255,0.35), transparent),
    radial-gradient(1.4px 1.4px at 62% 33%, rgba(255,255,255,0.45), transparent),
    radial-gradient(1px 1px at 88% 62%, rgba(255,255,255,0.4), transparent),
    radial-gradient(1px 1px at 22% 72%, rgba(255,255,255,0.3), transparent),
    radial-gradient(1.2px 1.2px at 52% 82%, rgba(255,255,255,0.4), transparent),
    radial-gradient(1px 1px at 8% 55%, rgba(255,255,255,0.3), transparent);
}
.bubble-page > * { position: relative; z-index: 1; }

.bubble-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 12px 4px;
}
.header-title {
  font-weight: 700;
  padding-top: 6px;
  color: rgba(255, 255, 255, 0.95);
}
.header-total {
  margin-left: auto;
  text-align: right;
}
.total-label {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.5);
}
.total-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: #fff;
}
.total-date {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.4);
}

.bubble-stage {
  flex: 1;
  min-height: 0;
  padding: 4px 8px;
}
.bubble-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.bubble-g {
  animation: bubbleIn 0.45s ease var(--delay, 0s) both;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes bubbleIn {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}

.bubble-ticker {
  fill: #fff;
  font-weight: 700;
  font-family: inherit;
  pointer-events: none;
  paint-order: stroke;
}
.bubble-name {
  fill: rgba(255, 255, 255, 0.72);
  font-weight: 500;
  font-family: inherit;
  pointer-events: none;
}
.bubble-change {
  fill: rgba(255, 255, 255, 0.92);
  font-weight: 600;
  font-family: inherit;
  pointer-events: none;
}

.bubble-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px calc(10px + env(safe-area-inset-bottom));
  flex-wrap: wrap;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.72);
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.legend-note {
  margin-left: auto;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.45);
}

.center-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
