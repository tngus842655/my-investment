<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppTheme } from '@/composables/useAppTheme'
import TransactionAddDialog from './TransactionAddDialog.vue'

const router = useRouter()
const { isDark } = useAppTheme()
const addDialog = ref(false)

type TransactionType = 'BUY' | 'SELL'
type FilterType = 'ALL' | 'BUY' | 'SELL'

interface Transaction {
  id: string
  transaction_type: TransactionType
  ticker: string
  asset_type: string
  quantity: number
  unit_price: number
  currency: 'KRW' | 'USD'
  transaction_date: string
  memo?: string
}

// ── 더미 데이터 ──────────────────────────────────
const dummyTransactions: Transaction[] = [
  {
    id: '1',
    transaction_type: 'BUY',
    ticker: 'AAPL',
    asset_type: '해외주식',
    quantity: 5,
    unit_price: 195.5,
    currency: 'USD',
    transaction_date: '2025-06-20',
    memo: '분할매수',
  },
  {
    id: '2',
    transaction_type: 'SELL',
    ticker: 'NVDA',
    asset_type: '해외주식',
    quantity: 2,
    unit_price: 1080.0,
    currency: 'USD',
    transaction_date: '2025-06-18',
  },
  {
    id: '3',
    transaction_type: 'BUY',
    ticker: '005930',
    asset_type: '국내주식',
    quantity: 10,
    unit_price: 72400,
    currency: 'KRW',
    transaction_date: '2025-06-15',
    memo: '삼성전자 적립',
  },
  {
    id: '4',
    transaction_type: 'BUY',
    ticker: 'BTC',
    asset_type: '암호화폐',
    quantity: 0.05,
    unit_price: 95000000,
    currency: 'KRW',
    transaction_date: '2025-05-30',
  },
  {
    id: '5',
    transaction_type: 'SELL',
    ticker: 'AAPL',
    asset_type: '해외주식',
    quantity: 3,
    unit_price: 210.0,
    currency: 'USD',
    transaction_date: '2025-05-22',
    memo: '일부 익절',
  },
  {
    id: '6',
    transaction_type: 'BUY',
    ticker: 'VOO',
    asset_type: 'ETF',
    quantity: 4,
    unit_price: 480.0,
    currency: 'USD',
    transaction_date: '2025-05-10',
  },
]

const filter = ref<FilterType>('ALL')
const swipedId = ref<string | null>(null)
const SWIPE_THRESHOLD = 40
const ACTION_WIDTH = 128

const swipeTouchStartX = ref(0)
const swipeTouchStartY = ref(0)
const isDraggingSwipe = ref(false)

const filtered = computed(() => {
  if (filter.value === 'ALL') return dummyTransactions
  return dummyTransactions.filter((t) => t.transaction_type === filter.value)
})

// 월별 그룹핑
const grouped = computed(() => {
  const map = new Map<string, Transaction[]>()
  for (const t of filtered.value) {
    const key = t.transaction_date.slice(0, 7) // YYYY-MM
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
})

const totalBuy = computed(() =>
  dummyTransactions
    .filter((t) => t.transaction_type === 'BUY')
    .reduce((s, t) => s + t.quantity * t.unit_price, 0),
)
const totalSell = computed(() =>
  dummyTransactions
    .filter((t) => t.transaction_type === 'SELL')
    .reduce((s, t) => s + t.quantity * t.unit_price, 0),
)

const formatMonthLabel = (key: string) => {
  const [y, m] = key.split('-')
  return `${y}년 ${parseInt(m!)}월`
}

const formatDate = (d: string) => {
  const date = new Date(d)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const formatAmount = (t: Transaction) => {
  const total = t.quantity * t.unit_price
  if (t.currency === 'USD') {
    return `$${total % 1 === 0 ? total.toLocaleString('en-US') : total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (total >= 100000000) {
    const eok = Math.floor(total / 100000000)
    const remainder = Math.round((total % 100000000) / 10000000)
    return remainder > 0 ? `${eok}억 ${remainder}천만원` : `${eok}억원`
  }
  if (total >= 10000) {
    return `${Math.round(total / 10000).toLocaleString()}만원`
  }
  return `${Math.round(total).toLocaleString()}원`
}

const formatUnitPrice = (t: Transaction) => {
  const p = t.unit_price
  if (t.currency === 'USD') {
    return `$${p % 1 === 0 ? p.toLocaleString('en-US') : p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (p >= 10000) return `${Math.round(p / 10000).toLocaleString()}만`
  return Math.round(p).toLocaleString()
}

const assetTypeColor = (type: string) =>
  ({ 국내주식: 'blue', 해외주식: 'purple', ETF: 'teal', 암호화폐: 'amber', 현금: 'green' })[type] ??
  'grey'

// ── 스와이프 ──────────────────────────────────────
const onSwipeTouchStart = (e: TouchEvent) => {
  swipeTouchStartX.value = e.touches[0]?.clientX ?? 0
  swipeTouchStartY.value = e.touches[0]?.clientY ?? 0
  isDraggingSwipe.value = true
}
const onSwipeTouchEnd = (e: TouchEvent, id: string) => {
  if (!isDraggingSwipe.value) return
  isDraggingSwipe.value = false
  const dx = swipeTouchStartX.value - (e.changedTouches[0]?.clientX ?? 0)
  const dy = Math.abs(swipeTouchStartY.value - (e.changedTouches[0]?.clientY ?? 0))
  if (dy > 10 && dy > Math.abs(dx)) return
  if (dx > SWIPE_THRESHOLD) swipedId.value = id
  else if (dx < -SWIPE_THRESHOLD / 2 && swipedId.value === id) swipedId.value = null
}
const onSwipeMouseDown = (e: MouseEvent) => {
  swipeTouchStartX.value = e.clientX
  swipeTouchStartY.value = e.clientY
  isDraggingSwipe.value = true
}
const onSwipeMouseUp = (e: MouseEvent, id: string) => {
  if (!isDraggingSwipe.value) return
  isDraggingSwipe.value = false
  const dx = swipeTouchStartX.value - e.clientX
  const dy = Math.abs(swipeTouchStartY.value - e.clientY)
  if (dy > 10 && dy > Math.abs(dx)) return
  if (dx > SWIPE_THRESHOLD) swipedId.value = id
  else if (dx < -SWIPE_THRESHOLD / 2 && swipedId.value === id) swipedId.value = null
}
const closeSwipe = () => { swipedId.value = null }
</script>

<template>
  <v-container class="pa-4 pa-sm-6" @click.self="closeSwipe">
    <!-- 헤더 -->
    <div class="d-flex justify-space-between align-center mb-5">
      <div>
        <div class="text-h5 font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">
          거래내역
        </div>
        <div class="text-body-2 text-medium-emphasis">매수 / 매도 기록</div>
      </div>
      <div class="d-flex ga-2 align-center">
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          rounded="lg"
          elevation="0"
          @click="addDialog = true"
        >
          거래 추가
        </v-btn>
      </div>
    </div>

    <!-- 요약 카드 -->
    <div class="stat-grid mb-4">
      <div class="stat-card">
        <div class="d-flex align-center ga-1 mb-1">
          <v-icon size="13" color="teal">mdi-arrow-down-bold</v-icon>
          <span class="stat-label">총 매수</span>
        </div>
        <div class="stat-value">
          {{ totalBuy >= 10000 ? Math.round(totalBuy / 10000).toLocaleString() + '만' : totalBuy.toLocaleString() }}
          <span class="stat-unit">원~</span>
        </div>
        <div class="stat-count text-caption text-disabled">
          {{ dummyTransactions.filter(t => t.transaction_type === 'BUY').length }}건
        </div>
      </div>
      <div class="stat-card">
        <div class="d-flex align-center ga-1 mb-1">
          <v-icon size="13" color="error">mdi-arrow-up-bold</v-icon>
          <span class="stat-label">총 매도</span>
        </div>
        <div class="stat-value">
          {{ totalSell >= 10000 ? Math.round(totalSell / 10000).toLocaleString() + '만' : totalSell.toLocaleString() }}
          <span class="stat-unit">원~</span>
        </div>
        <div class="stat-count text-caption text-disabled">
          {{ dummyTransactions.filter(t => t.transaction_type === 'SELL').length }}건
        </div>
      </div>
    </div>

    <!-- 필터 세그먼트 -->
    <div class="filter-wrap mb-4">
      <button
        v-for="f in (['ALL', 'BUY', 'SELL'] as FilterType[])"
        :key="f"
        class="filter-btn"
        :class="{ active: filter === f }"
        @click="filter = f; closeSwipe()"
      >
        <v-icon v-if="f === 'BUY'" size="13" class="mr-1">mdi-arrow-down-bold</v-icon>
        <v-icon v-else-if="f === 'SELL'" size="13" class="mr-1">mdi-arrow-up-bold</v-icon>
        {{ f === 'ALL' ? '전체' : f === 'BUY' ? '매수' : '매도' }}
      </button>
    </div>

    <!-- 빈 상태 -->
    <template v-if="filtered.length === 0">
      <div class="glass-card py-12 text-center">
        <v-icon size="48" color="primary" class="mb-4" style="opacity: 0.4">mdi-swap-horizontal</v-icon>
        <div class="text-h6 font-weight-medium text-medium-emphasis">거래내역이 없습니다</div>
        <div class="text-body-2 text-disabled mt-1">거래 추가 버튼으로 첫 거래를 기록하세요.</div>
      </div>
    </template>

    <!-- 타임라인 -->
    <template v-else>
      <div v-for="[monthKey, items] in grouped" :key="monthKey" class="mb-2">
        <!-- 월 헤더 -->
        <div class="month-label mb-2">
          <span>{{ formatMonthLabel(monthKey) }}</span>
          <span class="ml-2 text-disabled">{{ items.length }}건</span>
        </div>

        <!-- 거래 카드 -->
        <div
          v-for="item in items"
          :key="item.id"
          class="tx-card-wrap mb-2"
          @click="swipedId && swipedId !== item.id ? closeSwipe() : undefined"
        >
          <!-- 스와이프 액션 -->
          <div class="swipe-actions">
            <button class="action-btn action-edit" @click.stop>
              <v-icon size="18">mdi-pencil-outline</v-icon>
              <span>수정</span>
            </button>
            <button class="action-btn action-delete" @click.stop>
              <v-icon size="18">mdi-delete-outline</v-icon>
              <span>삭제</span>
            </button>
          </div>

          <!-- 카드 본체 -->
          <div
            class="swipe-card"
            :style="swipedId === item.id ? `transform: translateX(-${ACTION_WIDTH}px)` : ''"
            @touchstart.passive="onSwipeTouchStart"
            @touchend.passive="(e) => onSwipeTouchEnd(e, item.id)"
            @mousedown="onSwipeMouseDown"
            @mouseup="(e) => onSwipeMouseUp(e, item.id)"
          >
            <div
              class="glass-card tx-card pa-3"
              :class="item.transaction_type === 'BUY' ? 'border-buy-left' : 'border-sell-left'"
            >
              <div class="d-flex align-start ga-3">
                <!-- 타입 아이콘 뱃지 -->
                <div
                  class="type-badge"
                  :class="item.transaction_type === 'BUY' ? 'type-buy' : 'type-sell'"
                >
                  <v-icon size="16">
                    {{ item.transaction_type === 'BUY' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold' }}
                  </v-icon>
                </div>

                <!-- 종목 정보 -->
                <div class="flex-grow-1 min-width-0">
                  <div class="d-flex align-center justify-space-between mb-1">
                    <div class="d-flex align-center ga-1 flex-wrap">
                      <span class="text-body-2 font-weight-bold">{{ item.ticker }}</span>
                      <v-chip :color="assetTypeColor(item.asset_type)" size="x-small" variant="tonal">
                        {{ item.asset_type }}
                      </v-chip>
                    </div>
                    <!-- 날짜 + 거래유형 뱃지 -->
                    <div class="d-flex align-center ga-1 flex-shrink-0">
                      <v-chip
                        :color="item.transaction_type === 'BUY' ? 'teal' : 'error'"
                        size="x-small"
                        variant="tonal"
                      >
                        {{ item.transaction_type === 'BUY' ? '매수' : '매도' }}
                      </v-chip>
                      <span class="date-label">{{ formatDate(item.transaction_date) }}</span>
                    </div>
                  </div>

                  <!-- 수량 × 단가 -->
                  <div class="d-flex align-center ga-1 mb-1">
                    <span class="text-caption text-medium-emphasis">
                      {{ item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(4) }}주
                    </span>
                    <span class="text-caption text-disabled">×</span>
                    <span class="text-caption text-medium-emphasis">{{ formatUnitPrice(item) }}</span>
                  </div>

                  <v-divider class="mb-2" />

                  <!-- 합계 + 메모 -->
                  <div class="d-flex align-center justify-space-between">
                    <div
                      class="text-body-2 font-weight-bold"
                      :class="item.transaction_type === 'BUY' ? 'text-teal' : 'text-error'"
                    >
                      {{ item.transaction_type === 'BUY' ? '' : '-' }}{{ formatAmount(item) }}
                    </div>
                    <div v-if="item.memo" class="d-flex align-center ga-1">
                      <v-icon size="11" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-note-text-outline</v-icon>
                      <span class="memo-text">{{ item.memo }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <v-btn
      class="mt-4"
      variant="text"
      prepend-icon="mdi-arrow-left"
      style="color: rgba(var(--v-theme-on-surface), 0.7)"
      @click="router.back()"
    >
      뒤로가기
    </v-btn>
  </v-container>

  <TransactionAddDialog v-model="addDialog" />
</template>

<style scoped>
.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
  transition: background 0.25s ease, border-color 0.25s ease;
}
.v-theme--dark .glass-card {
  border-color: rgba(93, 214, 207, 0.15);
}

/* ── 요약 스탯 ── */
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.stat-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 16px;
  padding: 14px 16px;
}
.v-theme--dark .stat-card {
  border-color: rgba(93, 214, 207, 0.15);
}
.stat-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.stat-value {
  font-size: 18px;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.3;
}
.stat-unit {
  font-size: 12px;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

/* ── 필터 세그먼트 ── */
.filter-wrap {
  display: flex;
  gap: 6px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 12px;
  padding: 4px;
}
.filter-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 0;
  border: none;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.55);
  transition: background 0.18s ease, color 0.18s ease;
}
.filter-btn.active {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.v-theme--dark .filter-btn.active {
  background: rgba(93, 214, 207, 0.12);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

/* ── 월 헤더 ── */
.month-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.45);
  padding: 0 2px;
}

/* ── 타입 뱃지 ── */
.type-badge {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.type-buy {
  background: rgba(0, 150, 136, 0.12);
  color: #009688;
}
.type-sell {
  background: rgba(211, 47, 47, 0.1);
  color: #d32f2f;
}

/* ── 날짜 라벨 ── */
.date-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

/* ── 메모 ── */
.memo-text {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 텍스트 컬러 ── */
.text-teal {
  color: #009688 !important;
}

/* ── 좌측 accent ── */
.tx-card {
  border-left: 3px solid transparent !important;
  border-radius: 20px !important;
}
.border-buy-left {
  border-left-color: #009688 !important;
}
.border-sell-left {
  border-left-color: rgb(var(--v-theme-error)) !important;
}

/* ── 스와이프 ── */
.tx-card-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
}
.swipe-actions {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 128px;
  display: flex;
}
.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  transition: filter 0.15s;
}
.action-btn:active { filter: brightness(0.9); }
.action-edit {
  background: #0e8a82;
  border-radius: 20px 0 0 20px;
}
.action-delete {
  background: #d32f2f;
  border-radius: 0 20px 20px 0;
}
.swipe-card {
  position: relative;
  z-index: 1;
  transition: transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: transform;
}

.min-width-0 { min-width: 0; }
</style>
