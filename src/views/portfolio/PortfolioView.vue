<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { prefetchTickerLogos } from '@/services/tickerLogo'
import { supabase } from '@/services/supabase'
import PortfolioAddDialog from './PortfolioAddDialog.vue'
import type { PortfolioAsset } from '@/types/portfolio'
import { showMessage } from '@/composables/useSnackbar'
import { getStockPrice } from '@/services/market'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getTickerLabel, isEtfTicker, getTickerDisplayName } from '@/utils/tickerNames'

const loading = ref(false)

interface PortfolioViewItem extends PortfolioAsset {
  currentPrice?: number
  evaluationAmount?: number
  evaluationAmountKrw?: number
  costKrw?: number
  profitAmountKrw?: number
  profitRate?: number
  isPriceFallback?: boolean // 현재가 조회 실패 시 true
}

const portfolios = ref<PortfolioViewItem[]>([])
const logoMap = ref<Record<string, string | null>>({})
const exchangeRate = ref<number | null>(null)

// ── 스와이프 상태 ─────────────────────────────────
const swipedId = ref<string | null>(null)
const SWIPE_THRESHOLD = 40
const ACTION_WIDTH = 128

// ── 드래그앤드롭 상태 ─────────────────────────────
const isSavingOrder = ref(false)
const draggingId = ref<string | null>(null)
let dragCloneEl: HTMLElement | null = null
let dragOffsetX = 0
let dragOffsetY = 0
let lastDragTargetId: string | null = null

// ── 환율 조회 ─────────────────────────────────────
const fetchExchangeRate = async (): Promise<number> => {
  const rate = await getCachedExchangeRate()
  exchangeRate.value = rate
  return rate
}

const totalEvaluationAmountKrw = computed(() =>
  portfolios.value
    .filter((item) => item.asset_type !== '현금')
    .reduce((sum, item) => sum + (item.evaluationAmountKrw ?? 0), 0),
)
const totalProfitAmountKrw = computed(() =>
  portfolios.value
    .filter((item) => item.asset_type !== '현금')
    .reduce((sum, item) => sum + (item.profitAmountKrw ?? 0), 0),
)
const totalCostKrw = computed(() =>
  portfolios.value
    .filter((item) => item.asset_type !== '현금')
    .reduce((sum, item) => sum + (item.costKrw ?? 0), 0),
)
const totalProfitRate = computed(() => {
  if (totalCostKrw.value === 0) return 0
  return (totalProfitAmountKrw.value / totalCostKrw.value) * 100
})

// ── 포트폴리오 로드 ───────────────────────────────
const loadPortfolios = async () => {
  loading.value = true
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    const items = (data ?? []) as PortfolioAsset[]

    const [rate, txResult, ...prices] = await Promise.all([
      fetchExchangeRate(),
      supabase
        .from('transactions')
        .select('portfolio_id, transaction_type, quantity, unit_price, exchange_rate')
        .eq('user_id', user.id),
      ...items.map((item) =>
        item.asset_type === '현금'
          ? Promise.resolve(null)
          : getStockPrice(item.ticker, item.asset_type, item.currency).catch(() => null),
      ),
    ])

    // 포트폴리오 currency 맵 (costKrwMap 계산에 활용)
    const portfolioCurrencyMap = new Map(items.map((item) => [item.id, item.currency]))

    // 포트폴리오별 KRW 원가 계산 (USD만 환율 적용)
    const txRows = txResult.data ?? []
    const costKrwMap = new Map<string, number>()
    for (const tx of txRows) {
      const currency = portfolioCurrencyMap.get(tx.portfolio_id) ?? 'KRW'
      const isUsd = currency === 'USD'
      const txRate = isUsd ? rate : 1
      const krwAmount = tx.unit_price * tx.quantity * txRate
      const prev = costKrwMap.get(tx.portfolio_id) ?? 0
      if (tx.transaction_type === 'BUY' || tx.transaction_type === 'INITIAL') {
        costKrwMap.set(tx.portfolio_id, prev + krwAmount)
      } else if (tx.transaction_type === 'SELL') {
        costKrwMap.set(tx.portfolio_id, prev - krwAmount)
      }
    }

    portfolios.value = items.map((item, i) => {
      const isCash = item.asset_type === '현금'

      // 현금은 현재가 API 조회 불필요, avg_price 그대로 사용
      const currentPrice = isCash ? null : prices[i] && prices[i]! > 0 ? prices[i] : null

      // 암호화폐 + KRW: Finnhub은 USD로 반환하므로 환율 곱해서 KRW 현재가로 변환
      const isCryptoKrw = item.asset_type === '암호화폐' && item.currency === 'KRW'
      const currentPriceInCurrency = currentPrice
        ? isCryptoKrw
          ? currentPrice * rate
          : currentPrice
        : null

      const price = currentPriceInCurrency ?? item.avg_price
      const isPriceFallback = !isCash && currentPriceInCurrency === null

      const evaluationAmount = price * item.quantity
      const evaluationAmountKrw =
        item.currency === 'USD' && !isCryptoKrw ? evaluationAmount * rate : evaluationAmount

      // 저장된 거래별 환율로 계산한 KRW 원가 (없으면 현재 환율 fallback)
      const costKrw =
        costKrwMap.get(item.id) ??
        (item.currency === 'USD' && !isCryptoKrw
          ? item.avg_price * item.quantity * rate
          : item.avg_price * item.quantity)

      // 현금은 손익 표시 안 함
      const profitAmountKrw = isPriceFallback || isCash ? 0 : evaluationAmountKrw - costKrw
      const profitRate =
        isPriceFallback || isCash || costKrw === 0 ? 0 : (profitAmountKrw / costKrw) * 100

      return {
        ...item,
        currentPrice: currentPriceInCurrency ?? undefined,
        evaluationAmount,
        evaluationAmountKrw,
        costKrw,
        profitAmountKrw,
        profitRate,
        isPriceFallback,
      }
    })

    // 평가금액 합산 후 asset_summary에 저장 (대시보드와 동기화)
    const totalEval = portfolios.value.reduce(
      (sum, item) => sum + (item.evaluationAmountKrw ?? 0),
      0,
    )
    const totalCost = portfolios.value.reduce((sum, item) => {
      const costKrw =
        item.currency === 'USD'
          ? item.avg_price * item.quantity * rate
          : item.avg_price * item.quantity
      return sum + costKrw
    }, 0)
    supabase
      .from('asset_summary')
      .upsert(
        {
          user_id: user.id,
          current_asset: Math.round(totalEval),
          investment_principal: Math.round(totalCost),
        },
        { onConflict: 'user_id' },
      )
      .then(({ error }) => {
        if (error) console.warn('asset_summary 저장 실패:', error.message)
      })
  } catch (error) {
    console.error(error)
    showMessage('보유자산 조회 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }

  // 로고 fetch — 캐시 히트는 즉시 반영, 미스만 병렬 API 호출
  prefetchTickerLogos(
    portfolios.value.filter((item) => item.asset_type !== '현금'),
    (ticker, url) => {
      logoMap.value[ticker] = url
    },
  )
}

// ── 커스텀 드래그앤드롭 ───────────────────────────
const startDrag = (e: MouseEvent | TouchEvent, item: PortfolioViewItem) => {
  e.preventDefault()
  swipedId.value = null

  const touch = e instanceof TouchEvent ? e.touches[0]! : e
  const cardEl = (e.currentTarget as HTMLElement).closest('.portfolio-card-wrap') as HTMLElement
  if (!cardEl) return

  const rect = cardEl.getBoundingClientRect()
  dragOffsetX = touch.clientX - rect.left
  dragOffsetY = touch.clientY - rect.top
  draggingId.value = item.id
  lastDragTargetId = null

  // 카드 복사본 생성 → body에 붙여서 커서를 따라다니게 함
  const clone = cardEl.cloneNode(true) as HTMLElement
  clone.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    z-index: 9999;
    pointer-events: none;
    border-radius: 20px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.28);
    transform: scale(1.03);
    opacity: 0.97;
    transition: box-shadow 0.15s;
  `
  document.body.appendChild(clone)
  dragCloneEl = clone

  if (navigator.vibrate) navigator.vibrate(30)
}

const onDragMove = (e: MouseEvent | TouchEvent) => {
  if (!draggingId.value || !dragCloneEl) return
  if (e instanceof TouchEvent) e.preventDefault()

  const touch = e instanceof TouchEvent ? e.touches[0]! : e
  const clientX = touch.clientX
  const clientY = touch.clientY

  // 클론 이동
  dragCloneEl.style.left = `${clientX - dragOffsetX}px`
  dragCloneEl.style.top = `${clientY - dragOffsetY}px`

  // 어느 카드 위에 있는지 확인 → 중간점 기준으로만 재정렬 (떨림 방지)
  const cards = document.querySelectorAll<HTMLElement>('.portfolio-card-wrap[data-id]')
  let newTargetId: string | null = null

  cards.forEach((card) => {
    const targetId = card.dataset.id
    if (!targetId || targetId === draggingId.value) return
    const rect = card.getBoundingClientRect()
    if (clientY < rect.top || clientY > rect.bottom) return

    const dragIdx = portfolios.value.findIndex((p) => p.id === draggingId.value)
    const targetIdx = portfolios.value.findIndex((p) => p.id === targetId)
    const threshold = rect.height * 0.35
    if (
      (dragIdx < targetIdx && clientY > rect.top + threshold) ||
      (dragIdx > targetIdx && clientY < rect.bottom - threshold)
    ) {
      newTargetId = targetId
    }
  })

  if (newTargetId && newTargetId !== lastDragTargetId) {
    lastDragTargetId = newTargetId
    reorderItems(draggingId.value!, newTargetId)
  } else if (!newTargetId) {
    lastDragTargetId = null
  }
}

const endDrag = async () => {
  if (!draggingId.value) return

  dragCloneEl?.remove()
  dragCloneEl = null
  draggingId.value = null

  isSavingOrder.value = true
  try {
    for (let i = 0; i < portfolios.value.length; i++) {
      await supabase.from('portfolios').update({ sort_order: i }).eq('id', portfolios.value[i]!.id)
    }
  } catch (error) {
    console.error(error)
    showMessage('순서 저장 중 오류가 발생했습니다.', 'error')
  } finally {
    isSavingOrder.value = false
  }
}

const reorderItems = (fromId: string, toId: string) => {
  const list = [...portfolios.value]
  const fromIdx = list.findIndex((p) => p.id === fromId)
  const toIdx = list.findIndex((p) => p.id === toId)
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
  const moved = list.splice(fromIdx, 1)[0]!
  list.splice(toIdx, 0, moved)
  portfolios.value = list
}

// ── 스와이프 핸들러 ────────────────────────────────
const isDraggingSwipe = ref(false)
const swipeTouchStartX = ref(0)
const swipeTouchStartY = ref(0)

const onSwipeTouchStart = (e: TouchEvent) => {
  if (draggingId.value) return
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

const closeSwipe = () => {
  swipedId.value = null
}

// ── 다이얼로그 ────────────────────────────────────
const dialog = ref(false)
const editDialog = ref(false)
const deleteDialog = ref(false)
const selectedPortfolio = ref<PortfolioViewItem | null>(null)

const openDeleteDialog = (item: PortfolioViewItem) => {
  swipedId.value = null
  selectedPortfolio.value = item
  deleteDialog.value = true
}
const openEditDialog = (item: PortfolioViewItem) => {
  swipedId.value = null
  selectedPortfolio.value = item
  editDialog.value = true
}

const onSaved = async () => {
  editDialog.value = false
  await loadPortfolios()
}

const deletePortfolio = async () => {
  if (!selectedPortfolio.value) return
  try {
    const { error } = await supabase
      .from('portfolios')
      .delete()
      .eq('id', selectedPortfolio.value.id)
    if (error) {
      showMessage(error.message, 'error')
      return
    }
    showMessage('자산이 삭제되었습니다.', 'success')
    deleteDialog.value = false
    await loadPortfolios()
  } catch (error) {
    console.error(error)
    showMessage('자산 삭제 중 오류가 발생했습니다.', 'error')
  }
}

// ── 포맷 유틸 ─────────────────────────────────────
const formatKrw = (v: number) => Math.round(v).toLocaleString('ko-KR')

// 평균단가/현재가 표시 — KRW는 금액이 크면 축약, USD는 소수점 처리
const formatPrice = (v: number, currency: string) => {
  if (currency === 'KRW') {
    if (v >= 100000000) {
      const eok = Math.floor(v / 100000000)
      const remainder = Math.round((v % 100000000) / 1000000)
      return remainder > 0 ? `${eok}억 ${remainder}백만` : `${eok}억`
    }
    if (v >= 10000) {
      const man = Math.floor(v / 10000)
      const remainder = Math.round(v % 10000)
      return remainder > 0
        ? `${man.toLocaleString()}만 ${remainder.toLocaleString()}`
        : `${man.toLocaleString()}만`
    }
    return Math.round(v).toLocaleString('ko-KR')
  }
  // USD: 소수점 있을 때만 표시
  return v % 1 === 0
    ? v.toLocaleString('en-US')
    : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatPercent = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
const formatProfit = (v: number) => (v > 0 ? '+' : '') + formatKrw(v)
const assetTypeColor = (type: string): string =>
  ({
    국내주식: 'blue',
    해외주식: 'purple',
    ETF: 'teal',
    암호화폐: 'amber',
    현금: 'green',
  })[type] ?? 'grey'

const isRefreshing = ref(false)

const refresh = async () => {
  isRefreshing.value = true
  await loadPortfolios()
  isRefreshing.value = false
}

// ── 정렬 ─────────────────────────────────────────
type SortKey = 'custom' | 'eval' | 'profit' | 'rate' | 'name'
const sortKey = ref<SortKey>('custom')

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'custom', label: '직접 정렬' },
  { key: 'eval',   label: '평가금액순' },
  { key: 'profit', label: '손익순' },
  { key: 'rate',   label: '수익률순' },
  { key: 'name',   label: '이름순' },
]

const sortedPortfolios = computed(() => {
  if (sortKey.value === 'custom') return portfolios.value
  const list = [...portfolios.value]
  switch (sortKey.value) {
    case 'eval':   return list.sort((a, b) => (b.evaluationAmountKrw ?? 0) - (a.evaluationAmountKrw ?? 0))
    case 'profit': return list.sort((a, b) => (b.profitAmountKrw ?? 0) - (a.profitAmountKrw ?? 0))
    case 'rate':   return list.sort((a, b) => (b.profitRate ?? 0) - (a.profitRate ?? 0))
    case 'name':   return list.sort((a, b) => a.ticker.localeCompare(b.ticker))
    default:       return list
  }
})

const onGlobalMouseUp = () => {
  isDraggingSwipe.value = false
  endDrag()
}

onMounted(async () => {
  await loadPortfolios()
  window.addEventListener('mouseup', onGlobalMouseUp)
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('touchmove', onDragMove, { passive: false })
  window.addEventListener('touchend', endDrag)
})
onUnmounted(() => {
  dragCloneEl?.remove()
  window.removeEventListener('mouseup', onGlobalMouseUp)
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', endDrag)
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" @click.self="closeSwipe">
    <!-- 헤더 -->
    <div class="d-flex justify-space-between align-center mb-5">
      <div class="d-flex align-center ga-2">
        <img src="/icons/icon-asset.png" class="header-icon" alt="자산" />
        <div>
          <div class="text-h5 font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">
            보유자산
          </div>
          <div class="text-body-2 text-medium-emphasis">실시간 평가금액 기준</div>
        </div>
      </div>
      <div class="d-flex ga-2 align-center">
        <v-chip v-if="isSavingOrder" size="small" color="primary" variant="tonal">
          저장 중...
        </v-chip>
        <v-btn
          icon="mdi-refresh"
          variant="outlined"
          size="small"
          rounded="circle"
          elevation="0"
          :loading="isRefreshing"
          style="border-color: rgba(var(--v-theme-on-surface), 0.15)"
          @click="refresh"
        />
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          rounded="lg"
          elevation="0"
          @click="closeSwipe(); dialog = true"
        >
          자산 추가
        </v-btn>
      </div>
    </div>

    <!-- 스켈레톤 로딩 -->
    <template v-if="loading">
      <div
        v-for="n in 3"
        :key="n"
        class="glass-card mb-2"
        style="height: 120px; border-radius: 20px"
      />
    </template>

    <!-- 빈 상태 -->
    <template v-else-if="portfolios.length === 0">
      <div class="glass-card py-12 text-center">
        <v-icon size="48" color="primary" class="mb-4" style="opacity: 0.4"
          >mdi-chart-line-variant</v-icon
        >
        <div class="text-h6 font-weight-medium text-medium-emphasis">자산이 없습니다</div>
        <div class="text-body-2 text-disabled mt-1">자산 추가 버튼으로 첫 자산을 등록하세요.</div>
        <v-btn
          color="primary"
          variant="tonal"
          rounded="lg"
          class="mt-6"
          prepend-icon="mdi-plus"
          @click="closeSwipe(); dialog = true"
        >
          자산 추가
        </v-btn>
      </div>
    </template>

    <template v-else>
      <!-- 총 요약 카드 -->
      <div class="glass-card pa-4 mb-4">
        <div class="d-flex justify-space-between align-center mb-3">
          <span style="font-size: 11px; font-weight: 600; color: rgba(var(--v-theme-on-surface), 0.4); letter-spacing: 0.04em; text-transform: uppercase">요약</span>
          <!-- 정렬 메뉴 -->
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <button v-bind="props" class="sort-btn" :class="{ 'sort-btn-active': sortKey !== 'custom' }">
                <v-icon size="12">mdi-sort</v-icon>
                <span>{{ sortKey === 'custom' ? '정렬' : SORT_OPTIONS.find(o => o.key === sortKey)?.label }}</span>
                <v-icon size="11">mdi-chevron-down</v-icon>
              </button>
            </template>
            <v-list density="compact" rounded="lg" min-width="130" elevation="4">
              <v-list-item
                v-for="opt in SORT_OPTIONS"
                :key="opt.key"
                :active="sortKey === opt.key"
                :color="sortKey === opt.key ? 'primary' : undefined"
                @click="sortKey = opt.key; closeSwipe()"
              >
                <v-list-item-title style="font-size: 13px">{{ opt.label }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
        <div class="summary-grid">
          <div class="summary-row">
            <span class="text-caption text-medium-emphasis">매입금액</span>
            <span class="text-caption font-weight-medium">{{ formatKrw(totalCostKrw) }}</span>
          </div>
          <div class="summary-row">
            <span class="text-caption text-medium-emphasis">평가손익</span>
            <span
              class="text-caption font-weight-medium"
              :class="totalProfitAmountKrw >= 0 ? 'text-success' : 'text-error'"
              >{{ formatProfit(totalProfitAmountKrw) }}</span
            >
          </div>
          <div class="summary-row">
            <span class="text-caption text-medium-emphasis">평가금액</span>
            <span class="text-caption font-weight-medium">{{
              formatKrw(totalEvaluationAmountKrw)
            }}</span>
          </div>
          <div class="summary-row">
            <span class="text-caption text-medium-emphasis">수익률(%)</span>
            <span
              class="text-caption font-weight-medium"
              :class="totalProfitRate >= 0 ? 'text-success' : 'text-error'"
              >{{ formatPercent(totalProfitRate) }}</span
            >
          </div>
        </div>
      </div>

      <!-- 자산 카드 목록 -->
      <TransitionGroup name="cards" tag="div">
        <div
          v-for="item in sortedPortfolios"
          :key="item.id"
          class="portfolio-card-wrap mb-2"
          :data-id="item.id"
          :style="draggingId === item.id ? { opacity: '0', pointerEvents: 'none' } : {}"
          @click="swipedId && swipedId !== item.id ? closeSwipe() : undefined"
        >
          <!-- 스와이프 액션 -->
          <div class="swipe-actions">
            <button class="action-btn action-edit" @click.stop="openEditDialog(item)">
              <v-icon size="18">mdi-pencil-outline</v-icon>
              <span>수정</span>
            </button>
            <button class="action-btn action-delete" @click.stop="openDeleteDialog(item)">
              <v-icon size="18">mdi-delete-outline</v-icon>
              <span>삭제</span>
            </button>
          </div>

          <!-- 카드 본체 -->
          <div
            class="swipe-card"
            :style="swipedId === item.id ? `transform: translateX(-${ACTION_WIDTH}px)` : ''"
            @touchstart.passive="(e) => onSwipeTouchStart(e)"
            @touchend.passive="(e) => onSwipeTouchEnd(e, item.id)"
            @mousedown="(e) => onSwipeMouseDown(e)"
            @mouseup="(e) => onSwipeMouseUp(e, item.id)"
          >
            <div
              class="glass-card asset-card pa-3"
              :class="
                item.asset_type === '현금'
                  ? 'border-cash-left'
                  : (item.profitAmountKrw ?? 0) >= 0
                    ? 'border-success-left'
                    : 'border-error-left'
              "
            >
              <!-- 상단: 종목명 + 수익률 + 드래그 핸들 -->
              <div class="d-flex justify-space-between align-center mb-2">
                <div class="d-flex align-center ga-2">
                  <v-icon
                    v-if="sortKey === 'custom'"
                    class="drag-handle"
                    size="18"
                    style="
                      color: rgba(var(--v-theme-on-surface), 0.35);
                      cursor: grab;
                      touch-action: none;
                      user-select: none;
                    "
                    @mousedown.stop="(e: MouseEvent) => startDrag(e, item)"
                    @touchstart.stop.prevent="(e: TouchEvent) => startDrag(e, item)"
                  >
                    mdi-drag-vertical
                  </v-icon>
                  <div v-else style="width: 18px; flex-shrink: 0" />
                  <!-- 로고 -->
                  <div
                    class="ticker-logo-wrap"
                    :class="{
                      'logo-bg-etf':
                        (item.asset_type === 'ETF' || isEtfTicker(item.ticker)) &&
                        !logoMap[item.ticker],
                      'logo-bg-kr':
                        item.currency === 'KRW' &&
                        item.asset_type !== '현금' &&
                        !isEtfTicker(item.ticker),
                    }"
                  >
                    <img
                      v-if="item.asset_type === '현금' && item.ticker === 'CASH_USD'"
                      src="/icons/icon-dollar.png"
                      class="ticker-logo ticker-logo-blend"
                      alt="달러현금"
                    />
                    <img
                      v-else-if="item.asset_type === '현금'"
                      src="/icons/icon-won.png"
                      class="ticker-logo ticker-logo-blend"
                      alt="원화현금"
                    />
                    <img
                      v-else-if="logoMap[item.ticker]"
                      :src="logoMap[item.ticker]!"
                      class="ticker-logo"
                      :alt="item.ticker"
                    />
                    <span
                      v-else-if="item.asset_type === 'ETF' || isEtfTicker(item.ticker)"
                      class="logo-text logo-text-etf"
                      >E</span
                    >
                    <span
                      v-else-if="item.currency === 'KRW' && item.asset_type !== '현금'"
                      class="logo-text logo-text-kr"
                      >국</span
                    >
                    <v-icon v-else size="20" :color="assetTypeColor(item.asset_type)"
                      >mdi-chart-line</v-icon
                    >
                  </div>
                  <div>
                    <template v-if="item.asset_type === '현금'">
                      <span class="text-body-1 font-weight-bold">{{
                        getTickerLabel(item.ticker).name
                      }}</span>
                    </template>
                    <template v-else-if="getTickerLabel(item.ticker).showTicker">
                      <span class="text-body-1 font-weight-bold">{{
                        getTickerLabel(item.ticker).name
                      }}</span>
                      <span class="ticker-sub ml-1">{{ item.ticker }}</span>
                    </template>
                    <template v-else>
                      <span class="text-body-1 font-weight-bold">{{ item.ticker }}</span>
                    </template>
                  </div>
                </div>
                <v-chip
                  v-if="item.asset_type !== '현금'"
                  :color="(item.profitRate ?? 0) >= 0 ? 'success' : 'error'"
                  size="x-small"
                  variant="tonal"
                >
                  {{ formatPercent(item.profitRate ?? 0) }}
                </v-chip>
              </div>

              <!-- 현금 카드 -->
              <template v-if="item.asset_type === '현금'">
                <div class="text-body-2 font-weight-bold text-primary mt-1">
                  <template v-if="item.currency === 'USD'">
                    ${{ formatPrice(item.avg_price * item.quantity, 'USD') }}
                    <span class="compact-sep ml-1">·</span>
                    <span class="compact-label ml-1"
                      >{{ formatKrw(item.evaluationAmountKrw ?? 0) }}원</span
                    >
                  </template>
                  <template v-else> {{ formatKrw(item.evaluationAmountKrw ?? 0) }}원 </template>
                </div>
              </template>

              <!-- 일반 자산 카드 -->
              <template v-else>
                <!-- 수량 · 평균단가 → 현재가 한 줄 -->
                <div class="compact-price-row">
                  <span class="compact-label">{{ item.quantity }}주</span>
                  <span class="compact-sep">·</span>
                  <span class="compact-label">{{
                    formatPrice(item.avg_price, item.currency)
                  }}</span>
                  <span class="compact-arrow">→</span>
                  <template v-if="item.isPriceFallback">
                    <span class="compact-fail">조회 실패</span>
                  </template>
                  <template v-else>
                    <span class="compact-label">{{
                      formatPrice(item.currentPrice ?? 0, item.currency)
                    }}</span>
                  </template>
                </div>
                <!-- 평가금액 + 평가손익 한 줄 -->
                <div class="d-flex justify-space-between align-center mt-2">
                  <div class="text-body-2 font-weight-bold text-primary">
                    {{ formatKrw(item.evaluationAmountKrw ?? 0) }}원
                  </div>
                  <div
                    class="text-body-2 font-weight-bold"
                    :class="(item.profitAmountKrw ?? 0) >= 0 ? 'text-success' : 'text-error'"
                  >
                    {{ formatProfit(item.profitAmountKrw ?? 0) }}원
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </template>
  </v-container>

  <PortfolioAddDialog v-model="dialog" @saved="loadPortfolios" />
  <PortfolioAddDialog v-model="editDialog" :initial-data="selectedPortfolio" @saved="onSaved" />

  <v-dialog v-model="deleteDialog" max-width="320">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-6">자산 삭제</v-card-title>
      <v-card-text class="text-center text-medium-emphasis">
        <strong>{{ selectedPortfolio ? getTickerDisplayName(selectedPortfolio.ticker) : '' }}</strong
        >을(를) 삭제하시겠습니까?<br />
        <span class="text-caption text-error">
          해당 종목의 거래내역도 모두 함께 삭제됩니다.<br />이 작업은 되돌릴 수 없습니다.
        </span>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn block variant="text" @click="deleteDialog = false">취소</v-btn>
        <v-btn block color="error" @click="deletePortfolio">삭제</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.header-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
  transition:
    background 0.25s ease,
    border-color 0.25s ease;
}

.ticker-logo-wrap {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.ticker-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
.ticker-logo-blend {
}
.logo-bg-etf {
  background: #e8f4ff;
}
.logo-bg-kr {
  background: #fff3e0;
}
.logo-text {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.5px;
}
.logo-text-etf {
  color: #1565c0;
}
.logo-text-kr {
  color: #e65100;
}

.ticker-sub {
  font-size: 11px;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.compact-price-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}
.compact-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.compact-sep {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.3);
}
.compact-arrow {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.35);
  margin: 0 1px;
}
.compact-fail {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.3);
}

/* ── 스와이프 래퍼 ── */
.portfolio-card-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  transition: transform 0.2s ease;
}

/* ── 드래그 카드 이동 애니메이션 ── */
.sort-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  background: none;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
  transition: all 0.15s;
}
.sort-btn:active { opacity: 0.7; }
.sort-btn-active {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.07);
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.cards-move {
  transition: transform 180ms ease;
}

.drag-handle {
  touch-action: none;
  cursor: grab;
  -webkit-user-select: none;
  user-select: none;
}
.drag-handle:active {
  cursor: grabbing;
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
.action-btn:active {
  filter: brightness(0.9);
}
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

.asset-card {
  border-left: 3px solid transparent !important;
  border-radius: 20px !important;
}
.border-success-left {
  border-left-color: rgb(var(--v-theme-success)) !important;
}
.border-error-left {
  border-left-color: rgb(var(--v-theme-error)) !important;
}
.border-cash-left {
  border-left-color: #4caf50 !important;
}

.glass-dialog {
  background: rgb(var(--v-theme-surface)) !important;
  border: 1px solid rgba(0, 0, 0, 0.07) !important;
}
</style>
