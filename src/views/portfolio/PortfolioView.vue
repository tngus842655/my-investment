<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import PortfolioAddDialog from './PortfolioAddDialog.vue'
import type { PortfolioForm, PortfolioAsset } from '@/types/portfolio'
import { showMessage } from '@/composables/useSnackbar'
import { getStockPrice, getExchangeRate } from '@/services/market'
import { getTickerLabel } from '@/utils/tickerNames'

const router = useRouter()
const loading = ref(false)

interface PortfolioViewItem extends PortfolioAsset {
  currentPrice?: number
  evaluationAmount?: number
  evaluationAmountKrw?: number
  profitAmount?: number
  profitAmountKrw?: number
  profitRate?: number
  isPriceFallback?: boolean // 현재가 조회 실패 시 true
}

const portfolios = ref<PortfolioViewItem[]>([])
const exchangeRate = ref<number | null>(null)

// ── 스와이프 상태 ─────────────────────────────────
const swipedId = ref<string | null>(null)
const SWIPE_THRESHOLD = 40
const ACTION_WIDTH = 128

// ── 드래그앤드롭 상태 ─────────────────────────────
const isDragMode = ref(false) // 드래그 모드 활성화 여부
const draggingId = ref<string | null>(null) // 현재 드래그 중인 카드 id
const dragOverId = ref<string | null>(null) // 현재 hover 중인 카드 id
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const LONG_PRESS_DURATION = 500 // 롱프레스 인식 시간 (ms)
const dragStartY = ref(0)
const isSavingOrder = ref(false)

// ── 환율 조회 ─────────────────────────────────────
const fetchExchangeRate = async (): Promise<number> => {
  try {
    const rate = await getExchangeRate('USD', 'KRW')
    if (rate && rate > 0) {
      exchangeRate.value = rate
      return rate
    }
  } catch (e) {
    console.warn('환율 조회 실패, 기본값 사용:', e)
  }
  exchangeRate.value = 1350
  return 1350
}

const totalEvaluationAmountKrw = computed(() =>
  portfolios.value.reduce((sum, item) => sum + (item.evaluationAmountKrw ?? 0), 0),
)
const totalProfitAmountKrw = computed(() =>
  portfolios.value.reduce((sum, item) => sum + (item.profitAmountKrw ?? 0), 0),
)
const totalProfitRate = computed(() => {
  const totalCost = portfolios.value.reduce((sum, item) => {
    const costKrw =
      item.currency === 'USD'
        ? item.avg_price * item.quantity * (exchangeRate.value ?? 1350)
        : item.avg_price * item.quantity
    return sum + costKrw
  }, 0)
  if (totalCost === 0) return 0
  return (totalProfitAmountKrw.value / totalCost) * 100
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

    const [rate, ...prices] = await Promise.all([
      fetchExchangeRate(),
      ...items.map((item) =>
        getStockPrice(item.ticker, item.asset_type, item.currency).catch(() => null),
      ),
    ])

    portfolios.value = items.map((item, i) => {
      const currentPrice = prices[i] && prices[i]! > 0 ? prices[i] : null

      // 암호화폐 + KRW: Finnhub은 USD로 반환하므로 환율 곱해서 KRW 현재가로 변환
      const isCryptoKrw = item.asset_type === '암호화폐' && item.currency === 'KRW'
      const currentPriceInCurrency = currentPrice
        ? isCryptoKrw
          ? currentPrice * rate
          : currentPrice
        : null

      const price = currentPriceInCurrency ?? item.avg_price
      const isPriceFallback = currentPriceInCurrency === null

      const evaluationAmount = price * item.quantity
      const profitAmount = isPriceFallback ? 0 : (price - item.avg_price) * item.quantity
      // 암호화폐 KRW는 이미 KRW로 변환됐으므로 추가 환율 변환 불필요
      const evaluationAmountKrw =
        item.currency === 'USD' && !isCryptoKrw ? evaluationAmount * rate : evaluationAmount
      const profitAmountKrw =
        item.currency === 'USD' && !isCryptoKrw ? profitAmount * rate : profitAmount
      const profitRate = isPriceFallback
        ? 0
        : item.avg_price > 0
          ? ((price - item.avg_price) / item.avg_price) * 100
          : 0

      return {
        ...item,
        currentPrice: currentPriceInCurrency ?? undefined,
        evaluationAmount,
        evaluationAmountKrw,
        profitAmount,
        profitAmountKrw,
        profitRate,
        isPriceFallback,
      }
    })
  } catch (error) {
    console.error(error)
    showMessage('보유자산 조회 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

// ── 롱프레스 핸들러 ───────────────────────────────
const onCardLongPressStart = (e: TouchEvent | MouseEvent, id: string) => {
  // 드래그 모드면 무시
  if (isDragMode.value) return
  // 스와이프 열려있으면 무시
  if (swipedId.value) {
    swipedId.value = null
    return
  }

  const clientY = e instanceof TouchEvent ? (e.touches[0]?.clientY ?? 0) : e.clientY
  dragStartY.value = clientY

  longPressTimer.value = setTimeout(() => {
    isDragMode.value = true
    draggingId.value = id
    swipedId.value = null
    // 진동 피드백 (모바일)
    if (navigator.vibrate) navigator.vibrate(40)
  }, LONG_PRESS_DURATION)
}

const onCardLongPressEnd = () => {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

// 롱프레스 중 손가락/마우스가 너무 많이 움직이면 취소
// 마우스는 클릭 시 약간 움직이므로 터치보다 임계값을 크게 설정
const onCardLongPressMove = (e: TouchEvent | MouseEvent) => {
  if (isDragMode.value) return
  const clientY = e instanceof TouchEvent ? (e.touches[0]?.clientY ?? 0) : e.clientY
  const threshold = e instanceof TouchEvent ? 8 : 6
  if (Math.abs(clientY - dragStartY.value) > threshold) {
    onCardLongPressEnd()
  }
}

// ── 드래그 중 이동 핸들러 (window 레벨에서 처리) ──
const onWindowMouseMove = (e: MouseEvent) => {
  onCardLongPressMove(e)
  if (!isDragMode.value || !draggingId.value) return
  e.preventDefault()

  const clientY = e.clientY
  const cards = document.querySelectorAll('.portfolio-card-wrap')
  let targetId: string | null = null

  cards.forEach((card) => {
    const rect = card.getBoundingClientRect()
    if (clientY > rect.top && clientY < rect.bottom) {
      targetId = (card as HTMLElement).dataset.id ?? null
    }
  })

  if (targetId && targetId !== draggingId.value) {
    dragOverId.value = targetId
    reorderItems(draggingId.value, targetId)
  }
}

const onDragMove = (e: TouchEvent, id: string) => {
  if (!isDragMode.value || draggingId.value !== id) return
  e.preventDefault()

  const clientY = e.touches[0]?.clientY ?? 0
  const cards = document.querySelectorAll('.portfolio-card-wrap')
  let targetId: string | null = null

  cards.forEach((card) => {
    const rect = card.getBoundingClientRect()
    if (clientY > rect.top && clientY < rect.bottom) {
      targetId = (card as HTMLElement).dataset.id ?? null
    }
  })

  if (targetId && targetId !== draggingId.value) {
    dragOverId.value = targetId
    reorderItems(draggingId.value, targetId)
  }
}

// 배열 순서 변경
const reorderItems = (fromId: string, toId: string) => {
  const list = [...portfolios.value]
  const fromIdx = list.findIndex((p) => p.id === fromId)
  const toIdx = list.findIndex((p) => p.id === toId)
  if (fromIdx === -1 || toIdx === -1) return
  const moved = list.splice(fromIdx, 1)[0]
  if (!moved) return
  list.splice(toIdx, 0, moved)
  portfolios.value = list
}

// ── 드래그 종료 → Supabase 저장 ──────────────────
const onDragEnd = async () => {
  if (!isDragMode.value) return
  isDragMode.value = false
  draggingId.value = null
  dragOverId.value = null
  onCardLongPressEnd()

  // 현재 순서를 sort_order로 저장
  isSavingOrder.value = true
  try {
    const updates = portfolios.value.map((item, index) => ({
      id: item.id,
      sort_order: index,
    }))

    for (const update of updates) {
      await supabase
        .from('portfolios')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id)
    }
  } catch (error) {
    console.error(error)
    showMessage('순서 저장 중 오류가 발생했습니다.', 'error')
  } finally {
    isSavingOrder.value = false
  }
}

// ── 드래그 모드 취소 ──────────────────────────────
const cancelDragMode = () => {
  if (!isDragMode.value) return
  isDragMode.value = false
  draggingId.value = null
  dragOverId.value = null
  onCardLongPressEnd()
  loadPortfolios() // 취소 시 원래 순서로 복구
}

// ── 기존 스와이프 핸들러 (드래그 모드 아닐 때만) ──
const isDraggingSwipe = ref(false)
const swipeTouchStartX = ref(0)
const swipeTouchStartY = ref(0)

const onSwipeTouchStart = (e: TouchEvent) => {
  if (isDragMode.value) return
  swipeTouchStartX.value = e.touches[0]?.clientX ?? 0
  swipeTouchStartY.value = e.touches[0]?.clientY ?? 0
  isDraggingSwipe.value = true
}
const onSwipeTouchEnd = (e: TouchEvent, id: string) => {
  if (isDragMode.value || !isDraggingSwipe.value) return
  isDraggingSwipe.value = false
  const dx = swipeTouchStartX.value - (e.changedTouches[0]?.clientX ?? 0)
  const dy = Math.abs(swipeTouchStartY.value - (e.changedTouches[0]?.clientY ?? 0))
  if (dy > 10 && dy > Math.abs(dx)) return
  if (dx > SWIPE_THRESHOLD) swipedId.value = id
  else if (dx < -SWIPE_THRESHOLD / 2 && swipedId.value === id) swipedId.value = null
}
const onSwipeMouseDown = (e: MouseEvent) => {
  if (isDragMode.value) return
  swipeTouchStartX.value = e.clientX
  swipeTouchStartY.value = e.clientY
  isDraggingSwipe.value = true
}
const onSwipeMouseUp = (e: MouseEvent, id: string) => {
  if (isDragMode.value || !isDraggingSwipe.value) return
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

const savePortfolio = async (item: PortfolioForm) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      showMessage('로그인이 필요합니다.', 'error')
      return
    }
    const { error } = await supabase.from('portfolios').insert({
      user_id: user.id,
      ticker: item.ticker,
      asset_type: item.asset_type,
      quantity: item.quantity,
      avg_price: item.avg_price,
      currency: item.currency,
      sort_order: portfolios.value.length, // 새 항목은 맨 뒤
    })
    if (error) {
      showMessage(error.message, 'error')
      return
    }
    showMessage('자산이 등록되었습니다.', 'success')
    await loadPortfolios()
  } catch (error) {
    console.error(error)
    showMessage('자산 등록 중 오류가 발생했습니다.', 'error')
  }
}

const updatePortfolio = async (item: PortfolioForm) => {
  if (!selectedPortfolio.value) return
  try {
    const { error } = await supabase
      .from('portfolios')
      .update({
        ticker: item.ticker,
        asset_type: item.asset_type,
        quantity: item.quantity,
        avg_price: item.avg_price,
        currency: item.currency,
      })
      .eq('id', selectedPortfolio.value.id)
    if (error) {
      showMessage(error.message, 'error')
      return
    }
    showMessage('자산이 수정되었습니다.', 'success')
    editDialog.value = false
    await loadPortfolios()
  } catch (error) {
    console.error(error)
    showMessage('자산 수정 중 오류가 발생했습니다.', 'error')
  }
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

const onGlobalMouseUp = () => {
  isDraggingSwipe.value = false
  if (isDragMode.value) onDragEnd()
}

onMounted(() => {
  loadPortfolios()
  window.addEventListener('mouseup', onGlobalMouseUp)
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('touchend', onDragEnd)
})
onUnmounted(() => {
  window.removeEventListener('mouseup', onGlobalMouseUp)
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('touchend', onDragEnd)
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" @click.self="closeSwipe">
    <!-- 헤더 -->
    <div class="d-flex justify-space-between align-center mb-5">
      <div>
        <div class="text-h5 font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">
          보유자산
        </div>
        <div class="text-body-2 text-medium-emphasis">실시간 평가금액 기준</div>
      </div>
      <div class="d-flex ga-2 align-center">
        <v-fade-transition>
          <v-chip
            v-if="isDragMode"
            size="small"
            color="primary"
            variant="tonal"
            @click="cancelDragMode"
          >
            <v-icon start size="14">mdi-close</v-icon>
            순서 변경 중
          </v-chip>
        </v-fade-transition>
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
          v-if="!isDragMode"
          color="primary"
          prepend-icon="mdi-plus"
          rounded="lg"
          elevation="0"
          @click="dialog = true"
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
          @click="dialog = true"
        >
          자산 추가
        </v-btn>
      </div>
    </template>

    <template v-else>
      <!-- 총 요약 카드 -->
      <div class="glass-card pa-4 mb-4">
        <div class="text-caption text-medium-emphasis font-weight-medium mb-1">총 평가자산</div>
        <div class="text-h5 font-weight-medium mb-3" style="color: rgb(var(--v-theme-on-surface))">
          {{ formatKrw(totalEvaluationAmountKrw)
          }}<span class="text-body-1 font-weight-regular">원</span>
        </div>
        <v-divider class="mb-3" />
        <div class="d-flex align-center ga-4">
          <div>
            <div class="text-caption text-medium-emphasis">총 손익</div>
            <div
              class="text-body-2 font-weight-medium"
              :class="totalProfitAmountKrw >= 0 ? 'text-success' : 'text-error'"
            >
              {{ formatProfit(totalProfitAmountKrw) }}원
            </div>
          </div>
          <v-divider vertical style="height: 28px; border-color: rgba(255, 255, 255, 0.3)" />
          <div>
            <div class="text-caption text-medium-emphasis">수익률</div>
            <div
              class="text-body-2 font-weight-medium"
              :class="totalProfitRate >= 0 ? 'text-success' : 'text-error'"
            >
              {{ formatPercent(totalProfitRate) }}
            </div>
          </div>
          <v-spacer />
          <div v-if="exchangeRate" class="text-caption text-disabled">
            USD {{ Math.round(exchangeRate).toLocaleString('ko-KR') }}원
          </div>
        </div>
      </div>

      <!-- 힌트 -->
      <!-- 자산 카드 목록 -->
      <div
        v-for="item in portfolios"
        :key="item.id"
        class="portfolio-card-wrap mb-2"
        :data-id="item.id"
        :class="{
          'is-dragging': draggingId === item.id,
          'is-drag-over': dragOverId === item.id && draggingId !== item.id,
          'drag-mode': isDragMode,
        }"
        @click="swipedId && swipedId !== item.id ? closeSwipe() : undefined"
      >
        <!-- 스와이프 액션 (드래그 모드 아닐 때만) -->
        <div v-if="!isDragMode" class="swipe-actions">
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
          :style="
            !isDragMode && swipedId === item.id ? `transform: translateX(-${ACTION_WIDTH}px)` : ''
          "
          @touchstart.passive="
            (e) => {
              onCardLongPressStart(e, item.id)
              onSwipeTouchStart(e)
            }
          "
          @touchmove.passive="
            (e) => {
              onCardLongPressMove(e)
              onDragMove(e, item.id)
            }
          "
          @touchend.passive="
            (e) => {
              onCardLongPressEnd()
              onSwipeTouchEnd(e, item.id)
            }
          "
          @mousedown="
            (e) => {
              onCardLongPressStart(e, item.id)
              onSwipeMouseDown(e)
            }
          "
          @mouseup="
            (e) => {
              onCardLongPressEnd()
              onSwipeMouseUp(e, item.id)
            }
          "
        >
          <div
            class="glass-card asset-card pa-3"
            :class="(item.profitAmountKrw ?? 0) >= 0 ? 'border-success-left' : 'border-error-left'"
          >
            <!-- 상단: 종목명 + 타입 + 통화 + 수익률 + 드래그 핸들 -->
            <div class="d-flex justify-space-between align-center mb-2">
              <div class="d-flex align-center ga-2">
                <v-icon
                  v-if="isDragMode"
                  size="18"
                  style="color: rgba(var(--v-theme-on-surface), 0.35); cursor: grab"
                >
                  mdi-drag-vertical
                </v-icon>
                <div>
                  <template v-if="getTickerLabel(item.ticker).showTicker">
                    <span class="text-body-1 font-weight-bold">{{
                      getTickerLabel(item.ticker).name
                    }}</span>
                    <span class="ticker-sub ml-1">{{ item.ticker }}</span>
                  </template>
                  <template v-else>
                    <span class="text-body-1 font-weight-bold">{{ item.ticker }}</span>
                  </template>
                </div>
                <v-chip :color="assetTypeColor(item.asset_type)" size="x-small" variant="tonal">
                  {{ item.asset_type }}
                </v-chip>
                <v-chip size="x-small" variant="tonal" color="grey">
                  {{ item.currency }}
                </v-chip>
              </div>
              <v-chip
                :color="(item.profitRate ?? 0) >= 0 ? 'success' : 'error'"
                size="x-small"
                variant="tonal"
              >
                {{ formatPercent(item.profitRate ?? 0) }}
              </v-chip>
            </div>

            <!-- 수량 / 평균단가 / 현재가 -->
            <div class="d-flex ga-4 mb-2">
              <div>
                <div class="text-caption text-medium-emphasis">수량</div>
                <div class="text-caption font-weight-bold">{{ item.quantity }}</div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">평균단가</div>
                <div class="text-caption font-weight-bold">
                  {{ formatPrice(item.avg_price, item.currency) }}
                </div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">현재가</div>
                <div class="text-caption font-weight-bold">
                  <template v-if="item.isPriceFallback">
                    <span style="color: rgba(var(--v-theme-on-surface), 0.35)">조회 실패</span>
                  </template>
                  <template v-else>
                    {{ formatPrice(item.currentPrice ?? 0, item.currency) }}
                  </template>
                </div>
              </div>
            </div>

            <v-divider class="mb-2" />

            <!-- 평가금액 + 평가손익 -->
            <div class="d-flex justify-space-between align-center">
              <div>
                <div class="text-caption text-medium-emphasis">평가금액</div>
                <div class="text-body-2 font-weight-bold text-primary">
                  {{ formatKrw(item.evaluationAmountKrw ?? 0) }}원
                </div>
              </div>
              <div class="text-right">
                <div class="text-caption text-medium-emphasis">평가손익</div>
                <div
                  class="text-body-2 font-weight-bold"
                  :class="(item.profitAmountKrw ?? 0) >= 0 ? 'text-success' : 'text-error'"
                >
                  {{ formatProfit(item.profitAmountKrw ?? 0) }}원
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

  <PortfolioAddDialog v-model="dialog" @save="savePortfolio" />
  <PortfolioAddDialog
    v-model="editDialog"
    :initial-data="selectedPortfolio"
    @save="updatePortfolio"
  />

  <v-dialog v-model="deleteDialog" max-width="320">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-6">자산 삭제</v-card-title>
      <v-card-text class="text-center text-medium-emphasis">
        <strong>{{ selectedPortfolio?.ticker }}</strong
        >을(를) 삭제하시겠습니까?<br />
        <span class="text-caption">이 작업은 되돌릴 수 없습니다.</span>
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
.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
  transition:
    background 0.25s ease,
    border-color 0.25s ease;
}

.v-theme--dark .glass-card {
  background: rgb(var(--v-theme-surface));
  border-color: rgba(93, 214, 207, 0.15);
}

.ticker-sub {
  font-size: 11px;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

/* ── 스와이프 래퍼 ── */
.portfolio-card-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  transition: transform 0.2s ease;
}

/* ── 드래그 중인 카드 ── */
.portfolio-card-wrap.is-dragging {
  opacity: 0.5;
  transform: scale(0.97);
  z-index: 10;
}

/* ── 드롭 대상 카드 (위치 표시) ── */
.portfolio-card-wrap.is-drag-over {
  transform: translateY(-4px);
}
.portfolio-card-wrap.is-drag-over::before {
  content: '';
  position: absolute;
  top: -3px;
  left: 12px;
  right: 12px;
  height: 3px;
  background: rgb(var(--v-theme-primary));
  border-radius: 99px;
  z-index: 10;
}

/* ── 드래그 모드일 때 카드 커서 변경 ── */
.portfolio-card-wrap.drag-mode {
  cursor: grab;
  user-select: none;
}
.portfolio-card-wrap.drag-mode:active {
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

.glass-dialog {
  background: rgb(var(--v-theme-surface)) !important;
  border: 1px solid rgba(0, 0, 0, 0.07) !important;
}
.v-theme--dark .glass-dialog {
  background: rgba(13, 46, 45, 0.92) !important;
  border-color: rgba(79, 200, 194, 0.2) !important;
}
</style>
