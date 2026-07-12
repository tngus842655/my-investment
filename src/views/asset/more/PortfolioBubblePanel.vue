<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getStockQuote } from '@/services/market'
import { getTickerDisplayName } from '@/utils/tickerNames'
import { convertMoney } from '@/utils/portfolioMath'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { getAssetClass, isCash, type AssetClass, type MarketCode } from '@/config/marketConfig'

const { baseCurrency, money } = useBaseCurrency()

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
  costBase: number        // 기준통화 취득원가
  changeRate: number | null
  quantity: number
  avgPriceNative: number  // 종목 통화 기준 평균단가
  currentPriceNative: number | null // 종목 통화 기준 현재가 (미조회 시 null)
  currency: 'KRW' | 'USD'
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

// 버블 탭 → 하단에 상세 정보 카드 표시. 같은 버블 다시 탭하면 해제
const selected = ref<Bubble | null>(null)
const cardExpanded = ref(false)
const selectBubble = (b: Bubble) => {
  if (selected.value?.ticker === b.ticker) {
    selected.value = null
  } else {
    selected.value = b
  }
}
const deselect = () => { selected.value = null }
const weightPct = (b: Bubble) =>
  totalBase.value > 0 ? ((b.valueBase / totalBase.value) * 100).toFixed(1) : '0.0'

// 선택 종목의 평가손익·수익률 (원가 대비)
const detail = computed(() => {
  const b = selected.value
  if (!b) return null
  const pl = b.valueBase - b.costBase
  const plRate = b.costBase > 0 ? (pl / b.costBase) * 100 : null
  return { pl, plRate }
})

// 종목 통화(원/달러) 기준 금액 포맷 (평균단가·현재가용)
const fmtNative = (v: number | null, currency: 'KRW' | 'USD'): string => {
  if (v === null) return '-'
  if (currency === 'USD') return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return '₩' + Math.round(v).toLocaleString('ko-KR')
}
const fmtQty = (v: number): string => v.toLocaleString('en-US', { maximumFractionDigits: 8 })

// 전일 대비 총 증감액·증감률 (등락률을 아는 종목만 집계 — 현금/미조회 종목은 변동 0으로 간주)
const dayChange = computed(() => {
  let diff = 0
  let hasAny = false
  let prevTotal = 0
  for (const b of bubbles.value) {
    if (b.changeRate === null) {
      prevTotal += b.valueBase
      continue
    }
    const prev = b.valueBase / (1 + b.changeRate / 100)
    diff += b.valueBase - prev
    prevTotal += prev
    hasAny = true
  }
  if (!hasAny || prevTotal <= 0) return null
  return { diff, rate: (diff / prevTotal) * 100 }
})

// 등락률 → 색상 (한국식: 상승 빨강 / 하락 파랑 / 보합·미조회 회색), 변동폭이 클수록 진하게.
const colorParts = (cr: number | null): { color: string; stroke: string; glow: string } => {
  const neutral = cr === null || Math.abs(cr) < 0.005
  const mag = neutral ? 0 : Math.min(Math.abs(cr) / 3, 1) // 3% 이상이면 최대 채도
  const hue = neutral ? 220 : cr! > 0 ? 4 : 212
  const sat = neutral ? 8 : 62 + mag * 20
  const light = neutral ? 52 : 58 - mag * 10
  return {
    color: `hsl(${hue}, ${sat}%, ${light}%)`,
    stroke: `hsl(${hue}, ${sat}%, ${light + 16}%)`,
    glow: `hsla(${hue}, ${sat}%, ${light + 12}%, 0.6)`,
  }
}

// 종목명·등락률 텍스트를 넣기에 충분히 큰 원만 텍스트 표시 (작은 원은 생략)
const showText = (b: Bubble) => b.r >= maxR.value * 0.3
const showChange = (b: Bubble) => b.r >= maxR.value * 0.26
const showName = (b: Bubble) => b.r >= maxR.value * 0.55 && b.label !== b.ticker
const fmtChange = (cr: number | null) => cr === null ? '-' : `${cr >= 0 ? '+' : ''}${cr.toFixed(2)}%`

// ── 원 패킹: 스파이럴 초기배치 후 중력+충돌 완화로 밀집(Circle Packing 느낌) ──
interface Node { x: number; y: number; r: number }
function packCircles(radii: number[]): { x: number; y: number }[] {
  const n = radii.length
  const maxRad = radii.reduce((m, r) => Math.max(m, r), 0) || 1
  const GAP = maxRad * 0.008        // 버블 간 최소 간격 (작게 → 밀집)
  const GOLDEN = 2.399963229728653
  const step = maxRad * 0.42
  const nodes: Node[] = radii.map((r) => ({ x: 0, y: 0, r }))

  // 1) 스파이럴 초기 배치 (겹치지 않는 첫 지점)
  const placed: Node[] = []
  for (let k = 0; k < n; k++) {
    const nd = nodes[k]!
    if (k === 0) { placed.push(nd); continue }
    for (let i = 1; ; i++) {
      const rad = step * Math.sqrt(i)
      const ang = i * GOLDEN
      const x = rad * Math.cos(ang)
      const y = rad * Math.sin(ang)
      if (!placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + nd.r + GAP)) {
        nd.x = x; nd.y = y; placed.push(nd); break
      }
      if (i > 100000) { nd.x = x; nd.y = y; placed.push(nd); break }
    }
  }

  // 2) 완화: 매 반복마다 중심으로 살짝 당기고(중력), 겹치는 쌍은 밀어냄
  const ITER = 160
  for (let t = 0; t < ITER; t++) {
    const g = 0.018
    for (const nd of nodes) { nd.x *= (1 - g); nd.y *= (1 - g) }
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const na = nodes[a]!, nb = nodes[b]!
        const dx = nb.x - na.x, dy = nb.y - na.y
        const d = Math.hypot(dx, dy)
        const minD = na.r + nb.r + GAP
        if (d > 0 && d < minD) {
          const push = (minD - d) / 2
          const ux = dx / d, uy = dy / d
          na.x -= ux * push; na.y -= uy * push
          nb.x += ux * push; nb.y += uy * push
        } else if (d === 0) {
          na.x -= 0.01; nb.x += 0.01
        }
      }
    }
  }
  return nodes.map(({ x, y }) => ({ x, y }))
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
      // 암호화폐 시세는 USD로 오므로, 통화가 USD가 아니면 종목 통화로 먼저 환산
      const isCryptoNonUsd = h.assetClass === 'crypto' && h.currency !== 'USD'
      const currentPriceNative = q.price !== null && q.price > 0
        ? (isCryptoNonUsd ? convertMoney(q.price, 'USD', h.currency, exchangeRate.value) : q.price)
        : null
      const valueNative = currentPriceNative !== null
        ? currentPriceNative * h.quantity
        : h.costNative // 시세 조회 실패·현금: 원가/잔액 기준
      const valueBase = convertMoney(valueNative, h.currency, baseCurrency.value, exchangeRate.value)
      const costBase = convertMoney(h.costNative, h.currency, baseCurrency.value, exchangeRate.value)
      return {
        ticker,
        label: getTickerDisplayName(ticker),
        valueBase,
        costBase,
        changeRate: q.changeRate,
        quantity: h.quantity,
        avgPriceNative: h.quantity > 0 ? h.costNative / h.quantity : 0,
        currentPriceNative,
        currency: h.currency,
      }
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
      const pad = (maxX - minX) * 0.03
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
  <div class="bubble-panel">
    <!-- 총 평가금액 + 전일 대비 -->
    <div class="bubble-header" v-if="!loading && bubbles.length">
      <div class="total-label">{{ $t('assetBubble.totalAsset') }}</div>
      <div class="total-value">{{ money(totalBase, exchangeRate) }}</div>
      <div
        v-if="dayChange"
        class="total-change"
        :class="dayChange.diff >= 0 ? 'chg-up' : 'chg-down'"
      >{{ dayChange.diff >= 0 ? '+' : '-' }}{{ money(Math.abs(dayChange.diff), exchangeRate) }} ({{ dayChange.rate >= 0 ? '+' : '' }}{{ dayChange.rate.toFixed(2) }}%)</div>
      <div class="total-date">{{ asOfDate }} {{ $t('assetBubble.asOf') }}</div>
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
        <svg :viewBox="viewBox" class="bubble-svg" preserveAspectRatio="xMidYMid meet" @click="deselect">
          <defs>
            <!-- 구체 광택: 좌상단 하이라이트 + 하단 가장자리 음영 -->
            <radialGradient id="bubbleGlass" cx="38%" cy="30%" r="72%">
              <stop offset="0%" stop-color="#fff" stop-opacity="0.4" />
              <stop offset="42%" stop-color="#fff" stop-opacity="0.05" />
              <stop offset="78%" stop-color="#000" stop-opacity="0.02" />
              <stop offset="100%" stop-color="#000" stop-opacity="0.28" />
            </radialGradient>
          </defs>
          <!-- 바깥 g: 첫 진입 등장 애니메이션 / 안쪽 g: 선택 확대·펄스 (충돌 방지 위해 분리) -->
          <g
            v-for="(b, i) in bubbles"
            :key="b.ticker"
            class="bubble-enter"
            :class="{ 'bubble-dim': selected && selected.ticker !== b.ticker }"
            :style="{ '--delay': `${0.15 + i * 0.035}s` }"
          >
            <g
              class="bubble-scale"
              :class="{ 'bubble-selected': selected?.ticker === b.ticker }"
              @click.stop="selectBubble(b)"
            >
              <!-- 발광 + 기본 채움 -->
              <circle
                :cx="b.x" :cy="b.y" :r="b.r"
                :fill="b.color"
                :stroke="b.stroke"
                :stroke-width="b.r * 0.02"
                :style="{ filter: `drop-shadow(0 0 ${b.r * (selected?.ticker === b.ticker ? 0.34 : 0.14)}px ${b.glow})` }"
              />
              <!-- 광택 오버레이 -->
              <circle :cx="b.x" :cy="b.y" :r="b.r" fill="url(#bubbleGlass)" pointer-events="none" />
              <!-- 선택 링 -->
              <circle
                v-if="selected?.ticker === b.ticker"
                :cx="b.x" :cy="b.y" :r="b.r * 1.04"
                fill="none"
                stroke="rgba(255,255,255,0.9)"
                :stroke-width="b.r * 0.025"
                pointer-events="none"
              />

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
          </g>
        </svg>
      </div>

      <!-- 선택한 버블 상세 (탭하면 전체 지표로 확장) -->
      <v-expand-transition>
        <div v-if="selected && detail" class="detail-card">
          <div class="detail-head" @click="cardExpanded = !cardExpanded">
            <div class="detail-left">
              <div class="detail-ticker">
                {{ selected.ticker }}
                <span v-if="selected.label !== selected.ticker" class="detail-name">{{ selected.label }}</span>
              </div>
              <div class="detail-change" :class="(selected.changeRate ?? 0) >= 0 ? 'chg-up' : 'chg-down'">
                {{ $t('assetBubble.dayChange') }} {{ fmtChange(selected.changeRate) }}
              </div>
            </div>
            <div class="detail-right">
              <div class="detail-value">{{ money(selected.valueBase, exchangeRate) }}</div>
              <div class="detail-weight">{{ $t('assetBubble.weight') }} {{ weightPct(selected) }}%</div>
            </div>
            <v-icon size="20" class="detail-chevron" :class="{ 'chevron-open': cardExpanded }" style="color: rgba(255,255,255,0.6)">mdi-chevron-up</v-icon>
          </div>

          <v-expand-transition>
            <div v-if="cardExpanded" class="detail-grid">
              <div class="grid-item">
                <div class="grid-label">{{ $t('assetBubble.pl') }}</div>
                <div class="grid-value" :class="detail.pl >= 0 ? 'chg-up' : 'chg-down'">
                  {{ detail.pl >= 0 ? '+' : '-' }}{{ money(Math.abs(detail.pl), exchangeRate) }}
                </div>
              </div>
              <div class="grid-item">
                <div class="grid-label">{{ $t('assetBubble.returnRate') }}</div>
                <div class="grid-value" :class="(detail.plRate ?? 0) >= 0 ? 'chg-up' : 'chg-down'">
                  {{ detail.plRate === null ? '-' : `${detail.plRate >= 0 ? '+' : ''}${detail.plRate.toFixed(2)}%` }}
                </div>
              </div>
              <div class="grid-item">
                <div class="grid-label">{{ $t('assetBubble.avgPrice') }}</div>
                <div class="grid-value">{{ fmtNative(selected.avgPriceNative, selected.currency) }}</div>
              </div>
              <div class="grid-item">
                <div class="grid-label">{{ $t('assetBubble.currentPrice') }}</div>
                <div class="grid-value">{{ fmtNative(selected.currentPriceNative, selected.currency) }}</div>
              </div>
              <div class="grid-item">
                <div class="grid-label">{{ $t('assetBubble.quantity') }}</div>
                <div class="grid-value">{{ fmtQty(selected.quantity) }}</div>
              </div>
              <div class="grid-item">
                <div class="grid-label">{{ $t('assetBubble.totalAsset') }}</div>
                <div class="grid-value">{{ money(selected.valueBase, exchangeRate) }}</div>
              </div>
            </div>
          </v-expand-transition>
        </div>
      </v-expand-transition>

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
.bubble-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  /* 목업과 동일한 우주 느낌 다크 배경 (테마와 무관하게 이 패널은 다크 고정) */
  background:
    radial-gradient(ellipse 120% 80% at 50% 22%, #1a2942 0%, #0e1830 42%, #070c18 100%);
  overflow: hidden;
}

/* 은은한 별빛 */
.bubble-panel::before {
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
.bubble-panel > * { position: relative; z-index: 1; }

.bubble-header {
  padding: 12px 16px 4px;
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
.total-change {
  font-size: 0.75rem;
  font-weight: 600;
}
.chg-up { color: hsl(4, 82%, 64%); }
.chg-down { color: hsl(212, 82%, 66%); }
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

/* 첫 진입: 살짝 튀며 자리 잡는 등장 (스태거) */
.bubble-enter {
  animation: bubbleIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) var(--delay, 0s) both;
  transition: opacity 0.25s ease;
}
.bubble-enter.bubble-dim {
  opacity: 0.28;
}
@keyframes bubbleIn {
  from { opacity: 0; transform: scale(0.2); }
  to { opacity: 1; transform: scale(1); }
}
.bubble-enter,
.bubble-scale {
  transform-box: fill-box;
  transform-origin: center;
}

/* 선택 시 확대 + 글로우 펄스 */
.bubble-scale {
  cursor: pointer;
  transition: transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.bubble-scale.bubble-selected {
  animation: selPulse 1.6s ease-in-out infinite;
}
@keyframes selPulse {
  0%, 100% { transform: scale(1.09); }
  50% { transform: scale(1.14); }
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

.detail-card {
  margin: 0 12px 4px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.13);
  backdrop-filter: blur(8px);
  overflow: hidden;
}
.detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  cursor: pointer;
}
.detail-left {
  min-width: 0;
}
.detail-ticker {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #fff;
}
.detail-name {
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  margin-left: 4px;
}
.detail-change {
  font-size: 0.75rem;
  font-weight: 600;
  margin-top: 2px;
}
.detail-right {
  margin-left: auto;
  text-align: right;
}
.detail-value {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #fff;
}
.detail-weight {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 2px;
}
.detail-chevron {
  transition: transform 0.25s ease;
}
.chevron-open {
  transform: rotate(180deg);
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1px;
  background: rgba(255, 255, 255, 0.08);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.grid-item {
  background: rgba(10, 16, 30, 0.55);
  padding: 10px 12px;
}
.grid-label {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 3px;
}
.grid-value {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #fff;
}

.bubble-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px 12px;
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
