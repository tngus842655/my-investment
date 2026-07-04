<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { prefetchTickerLogos } from '@/services/tickerLogo'
import { supabase } from '@/services/supabase'
import PortfolioAddDialog from './PortfolioAddDialog.vue'
import type { PortfolioAsset } from '@/types/portfolio'
import { showMessage } from '@/composables/useSnackbar'
import { getStockPrice } from '@/services/market'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getTickerLabel, isEtfTicker, getTickerDisplayName, TICKER_NAMES } from '@/utils/tickerNames'
import { evaluateItemKrw, simpleCostKrw } from '@/utils/portfolioMath'
import { useUserDataStore } from '@/stores/userData'
import { useRegisterPullToRefresh, clearPullToRefresh } from '@/composables/usePullToRefresh'
import { useFontScale } from '@/composables/useFontScale'

const router = useRouter()
const userDataStore = useUserDataStore()
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
const hasUSD = computed(() => portfolios.value.some((item) => item.currency === 'USD'))

// ── 자산군별 시세 안내 ─────────────────────────────
const PRICE_DELAY_INFO = [
  { emoji: '🇰🇷', label: '국내주식', desc: '약 15~20분 지연' },
  { emoji: '🌎', label: '해외주식', desc: '약 15분 내외 지연' },
  { emoji: '🪙', label: '암호화폐', desc: '실시간에 가까움' },
  { emoji: '💱', label: '환율', desc: '전일 종가 기준 (하루 1회 갱신)' },
]
const goToTickerNameRequest = () => {
  router.push({ name: 'feedback', query: { category: '기능제안', title: '미국주식 한글표기명 등록요청' } })
}

// ── 포트폴리오 로드 ───────────────────────────────
const loadPortfolios = async () => {
  loading.value = true
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const user = session?.user
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

    // 다른 화면(대시보드 등)이 공유 스토어를 통해 최신 보유종목을 재사용하도록 캐시 갱신
    userDataStore.portfolios = items
    userDataStore.portfoliosLoaded = true

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

      const { currentPriceInCurrency, evaluationAmount, evaluationAmountKrw } =
        evaluateItemKrw(item, currentPrice, rate)
      const isPriceFallback = !isCash && currentPriceInCurrency === null

      // 저장된 거래별 환율로 계산한 KRW 원가 (없으면 현재 환율 fallback)
      const costKrw = costKrwMap.get(item.id) ?? simpleCostKrw(item, rate)

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

    // 평가금액 합산 후 asset_summary에 저장 (현금 제외 — FIRE 예측은 투자자산 기준)
    const totalEval = portfolios.value
      .filter((item) => item.asset_type !== '현금')
      .reduce((sum, item) => sum + (item.evaluationAmountKrw ?? 0), 0)
    const totalCost = portfolios.value
      .filter((item) => item.asset_type !== '현금')
      .reduce((sum, item) => sum + simpleCostKrw(item, rate), 0)
    const roundedEval = Math.round(totalEval)
    supabase
      .from('asset_summary')
      .upsert(
        {
          user_id: user.id,
          current_asset: roundedEval,
          investment_principal: Math.round(totalCost),
        },
        { onConflict: 'user_id' },
      )
      .then(({ error }) => {
        if (error) console.warn('asset_summary 저장 실패:', error.message)
        else userDataStore.invalidateAssetSummary()
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
    userDataStore.invalidatePortfolios()
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

// 열린 카드 자신을 클릭한 게 아니면(다른 카드·빈 영역·상단 버튼 등 어디든) 닫기
const onContainerClick = (e: MouseEvent) => {
  if (!swipedId.value) return
  const swipedEl = document.querySelector(`.portfolio-card-wrap[data-id="${swipedId.value}"]`)
  if (swipedEl?.contains(e.target as Node)) return
  closeSwipe()
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

// 화면 너비 감지 — 360px 미만(폴드 등 좁은 화면)이면 한글 축약
// 글자 크기를 키운 경우도 같은 효과(실제 표시 가능 폭이 좁아짐)이므로 함께 반영해
// 매입금액/평가손익/평가금액이 한 번에 모두 축약되어 줄바꿈 없이 통일되게 보이도록 함
const windowWidth = ref(window.innerWidth)
const onResize = () => { windowWidth.value = window.innerWidth }
const { fontScale } = useFontScale()
const isNarrowScreen = computed(() => windowWidth.value / fontScale.value < 420)

const formatKrwShort = (v: number): string => {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 100_000_000) {
    const eok = (abs / 100_000_000).toFixed(2).replace(/\.?0+$/, '')
    return `${sign}${eok}억`
  }
  if (abs >= 10_000) {
    const man = Math.round(abs / 10_000)
    return `${sign}${man.toLocaleString()}만`
  }
  return `${sign}${Math.round(abs).toLocaleString()}`
}

// 총합 카드용 — 좁은 화면이면 한글 축약, 아니면 숫자 그대로
const formatSummaryKrw = (v: number) => isNarrowScreen.value ? formatKrwShort(v) : formatKrw(v)
const formatSummaryProfit = (v: number) =>
  isNarrowScreen.value
    ? (v > 0 ? '+' : '') + formatKrwShort(v)
    : formatProfit(v)

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
const truncateAccount = (name: string) =>
  /[ㄱ-ㅎ가-힣]/.test(name) ? name.slice(0, 2) : name.slice(0, 4)
const formatProfit = (v: number) => (v > 0 ? '+' : '') + formatKrw(v)
const assetTypeColor = (type: string): string =>
  ({
    국내주식: 'blue',
    해외주식: 'purple',
    ETF: 'teal',
    암호화폐: 'amber',
    현금: 'green',
  })[type] ?? 'grey'

// ── 정렬 ─────────────────────────────────────────
type SortKey = 'custom' | 'eval' | 'profit' | 'rate' | 'name'
const SORT_STORAGE_KEY = 'firepath-portfolio-sort'
const sortKey = ref<SortKey>((localStorage.getItem(SORT_STORAGE_KEY) as SortKey) ?? 'custom')

const SORT_OPTIONS: { key: SortKey; label: string; emoji: string }[] = [
  { key: 'custom', label: '직접 정렬',  emoji: '✋' },
  { key: 'eval',   label: '평가금액순', emoji: '💰' },
  { key: 'profit', label: '손익순',     emoji: '📈' },
  { key: 'rate',   label: '수익률순',   emoji: '🎯' },
  { key: 'name',   label: '이름순',     emoji: '🔤' },
]

const setSort = (key: SortKey) => {
  sortKey.value = key
  localStorage.setItem(SORT_STORAGE_KEY, key)
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session?.user) return
    supabase.from('investment_goals')
      .update({ portfolio_sort: key })
      .eq('user_id', session.user.id)
      .then()
  })
  closeSwipe()
}

// ── 계좌 필터 ─────────────────────────────────────
const selectedAccount = ref<string | null>(null)

const accountOptions = computed(() => {
  const accounts = [...new Set(portfolios.value.map((p) => p.account_name ?? '미지정'))]
  if (accounts.length <= 1) return []
  return ['미지정', ...accounts.filter((a) => a !== '미지정').sort((a, b) => a.localeCompare(b, 'ko'))]
})

const sortedPortfolios = computed(() => {
  const base = (() => {
    if (sortKey.value === 'custom') return portfolios.value
    const list = [...portfolios.value]
    switch (sortKey.value) {
      case 'eval':   return list.sort((a, b) => (b.evaluationAmountKrw ?? 0) - (a.evaluationAmountKrw ?? 0))
      case 'profit': return list.sort((a, b) => (b.profitAmountKrw ?? 0) - (a.profitAmountKrw ?? 0))
      case 'rate':   return list.sort((a, b) => (b.profitRate ?? 0) - (a.profitRate ?? 0))
      case 'name': {
        const getName = (ticker: string) => TICKER_NAMES[ticker.toUpperCase()] ?? ticker
        return list.sort((a, b) => getName(a.ticker).localeCompare(getName(b.ticker), 'ko'))
      }
      default:       return list
    }
  })()
  if (!selectedAccount.value) return base
  return base.filter((p) => (p.account_name ?? '미지정') === selectedAccount.value)
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
  window.addEventListener('resize', onResize)
  useRegisterPullToRefresh(loadPortfolios)
})
onUnmounted(() => {
  dragCloneEl?.remove()
  window.removeEventListener('mouseup', onGlobalMouseUp)
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', endDrag)
  window.removeEventListener('resize', onResize)
  clearPullToRefresh()
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" @click="onContainerClick">
    <!-- 헤더 -->
    <div class="asset-header d-flex justify-space-between align-center mb-5">
      <div class="d-flex align-center ga-2" style="min-width: 0">
        <img src="/icons/icon-asset.png" class="header-icon" alt="자산" />
        <div style="min-width: 0">
          <div class="font-weight-bold header-title" style="color: rgb(var(--v-theme-on-surface))">
            보유자산
          </div>
          <div class="text-medium-emphasis header-title">실시간 평가금액 기준</div>
        </div>
      </div>
      <div class="d-flex ga-2 align-center" style="flex-shrink: 0">
        <v-chip v-if="isSavingOrder" size="small" color="primary" variant="tonal">
          저장 중...
        </v-chip>
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
        <div class="font-weight-medium text-medium-emphasis">자산이 없습니다</div>
        <div class="text-disabled mt-1">자산 추가 버튼으로 첫 자산을 등록하세요.</div>
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
        <div class="summary-grid">
          <div class="summary-row" :class="{ 'summary-row--stacked': isNarrowScreen }">
            <span class="text-medium-emphasis">매입금액</span>
            <span class="font-weight-medium">{{ formatSummaryKrw(totalCostKrw) }}</span>
          </div>
          <div class="summary-row" :class="{ 'summary-row--stacked': isNarrowScreen }">
            <span class="text-medium-emphasis">평가손익</span>
            <span
              class="font-weight-medium"
              :class="totalProfitAmountKrw >= 0 ? 'text-success' : 'text-error'"
            >{{ formatSummaryProfit(totalProfitAmountKrw) }}</span>
          </div>
          <div class="summary-row" :class="{ 'summary-row--stacked': isNarrowScreen }">
            <span class="text-medium-emphasis">평가금액</span>
            <span class="font-weight-medium">{{ formatSummaryKrw(totalEvaluationAmountKrw) }}</span>
          </div>
          <div class="summary-row" :class="{ 'summary-row--stacked': isNarrowScreen }">
            <span class="text-medium-emphasis">수익률</span>
            <span
              class="font-weight-medium"
              :class="totalProfitRate >= 0 ? 'text-success' : 'text-error'"
              >{{ formatPercent(totalProfitRate) }}</span
            >
          </div>
        </div>
      </div>

      <!-- 계좌 필터 -->
      <div v-if="accountOptions.length > 0" class="account-filter-row mb-2">
        <button
          class="account-chip"
          :class="{ 'account-chip-active': selectedAccount === null }"
          @click="selectedAccount = null"
        >전체</button>
        <button
          v-for="acc in accountOptions"
          :key="acc"
          class="account-chip"
          :class="{ 'account-chip-active': selectedAccount === acc }"
          @click="selectedAccount = acc"
        >{{ acc }}</button>
      </div>

      <!-- 정렬 바 -->
      <div class="d-flex justify-space-between align-center mb-1">
        <div class="d-flex align-center ga-1">
          <span style="font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.4)">
            총 {{ sortedPortfolios.length }}건
          </span>
          <v-menu location="bottom start">
            <template #activator="{ props }">
              <v-icon v-bind="props" size="13" style="color: rgba(var(--v-theme-on-surface), 0.35)"
                >mdi-information-outline</v-icon
              >
            </template>
            <div class="glass-card pa-3" style="max-width: 240px">
              <div class="font-weight-medium mb-2">자산군별 시세 갱신 안내</div>
              <div
                v-for="info in PRICE_DELAY_INFO"
                :key="info.label"
                class="d-flex align-center justify-space-between mb-1"
                style="font-size: 0.6875rem"
              >
                <span>{{ info.emoji }} {{ info.label }}</span>
                <span class="text-disabled ml-2">{{ info.desc }}</span>
              </div>
              <div
                class="d-flex align-center ga-1 mt-2 pt-2"
                style="font-size: 0.6875rem; color: rgb(var(--v-theme-primary)); cursor: pointer; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08)"
                @click="goToTickerNameRequest"
              >
                <v-icon size="12" color="primary">mdi-pencil-plus-outline</v-icon>
                <span>미국주식 한글표기명 등록요청</span>
              </div>
            </div>
          </v-menu>
        </div>
        <div class="d-flex align-center ga-2">
          <span
            v-if="hasUSD && exchangeRate"
            style="font-size: 0.625rem; color: rgba(var(--v-theme-on-surface), 0.35)"
          >
            적용환율 {{ Math.round(exchangeRate).toLocaleString() }}원 (전일 기준)
          </span>
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
                @click="setSort(opt.key)"
              >
                <v-list-item-title style="font-size: 0.8125rem">
                  <span style="margin-right: 6px">{{ opt.emoji }}</span>{{ opt.label }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
      </div>

      <!-- 자산 카드 목록 -->
      <TransitionGroup name="cards" tag="div">
        <div
          v-for="item in sortedPortfolios"
          :key="item.id"
          class="portfolio-card-wrap mb-1"
          :data-id="item.id"
          :style="draggingId === item.id ? { opacity: '0', pointerEvents: 'none' } : {}"
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
              class="glass-card asset-card pa-2"
              :class="item.asset_type === '현금' ? 'border-cash-left' : (item.profitAmountKrw ?? 0) >= 0 ? 'border-success-left' : 'border-error-left'"
            >
              <!-- 상단: 종목명 + 수익률 + 드래그 핸들 -->
              <div class="d-flex justify-space-between align-center mb-1" style="gap: 6px">
                <div class="d-flex align-center ga-2" style="min-width: 0; flex: 1">
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
                    :class="{ 'logo-bg-etf': (item.asset_type === 'ETF' || isEtfTicker(item.ticker)) && !logoMap[item.ticker], 'logo-bg-kr': item.currency === 'KRW' && item.asset_type !== '현금' && !isEtfTicker(item.ticker), }"
                  >
                    <img
                      v-if="item.asset_type === '현금' && item.ticker === 'CASH_USD'"
                      src="/icons/icon-dollar.png"
                      class="ticker-logo"
                      alt="달러현금"
                    />
                    <img
                      v-else-if="item.asset_type === '현금'"
                      src="/icons/icon-won.png"
                      class="ticker-logo"
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
                  <div style="min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 4px">
                    <template v-if="item.asset_type === '현금'">
                      <span class="ticker-name">{{
                        getTickerLabel(item.ticker).name
                      }}</span>
                      <span v-if="item.account_name && item.account_name !== '미지정'" class="account-tag ml-1">{{ truncateAccount(item.account_name) }}</span>
                    </template>
                    <template v-else-if="getTickerLabel(item.ticker).showTicker">
                      <span class="ticker-name">{{
                        getTickerLabel(item.ticker).name
                      }}</span>
                      <span v-if="item.currency === 'USD'" class="ticker-sub ml-1">{{ item.ticker }}</span>
                      <span v-if="item.account_name && item.account_name !== '미지정'" class="account-tag ml-1">{{ truncateAccount(item.account_name) }}</span>
                    </template>
                    <template v-else>
                      <span class="ticker-name">{{ item.ticker }}</span>
                      <span v-if="item.account_name && item.account_name !== '미지정'" class="account-tag ml-1">{{ truncateAccount(item.account_name) }}</span>
                    </template>
                  </div>
                </div>
                <v-chip
                  v-if="item.asset_type !== '현금'"
                  :color="(item.profitRate ?? 0) >= 0 ? 'success' : 'error'"
                  size="x-small"
                  variant="tonal"
                  style="flex-shrink: 0"
                >
                  {{ formatPercent(item.profitRate ?? 0) }}
                </v-chip>
              </div>

              <!-- 현금 카드 -->
              <template v-if="item.asset_type === '현금'">
                <div class="card-amount text-primary mt-1">
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
                <!-- 수량 · 평가금액 | 손익 한 줄 -->
                <div class="d-flex justify-space-between align-center mt-1" style="gap: 6px">
                  <div style="min-width: 0; overflow: hidden">
                    <span class="compact-label">{{ item.quantity }}주</span>
                    <span class="compact-sep mx-1">·</span>
                    <span class="card-amount text-primary" style="white-space: nowrap">
                      {{ formatKrw(item.evaluationAmountKrw ?? 0) }}원
                    </span>
                  </div>
                  <div
                    class="card-amount"
                    :class="(item.profitAmountKrw ?? 0) >= 0 ? 'text-success' : 'text-error'"
                    style="flex-shrink: 0; white-space: nowrap"
                  >
                    {{ formatProfit(item.profitAmountKrw ?? 0) }}원
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </TransitionGroup>
      <p v-if="sortedPortfolios.length > 0" class="swipe-hint">← 카드를 왼쪽으로 밀면 수정/삭제할 수 있어요</p>
    </template>
  </v-container>

  <PortfolioAddDialog v-model="dialog" :initial-account="selectedAccount ?? undefined" @saved="loadPortfolios" />
  <PortfolioAddDialog v-model="editDialog" :initial-data="selectedPortfolio" @saved="onSaved" />

  <v-dialog v-model="deleteDialog" max-width="320">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-6">자산 삭제</v-card-title>
      <v-card-text class="text-center text-medium-emphasis">
        <strong>{{ selectedPortfolio ? getTickerDisplayName(selectedPortfolio.ticker) : '' }}</strong
        >을(를) 삭제하시겠습니까?<br />
        <span class="text-error">
          <template v-if="selectedPortfolio?.asset_type !== '현금'">해당 자산의 거래내역도 모두 함께 삭제됩니다.<br /></template>이 작업은 되돌릴 수 없습니다.
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
.asset-header {
  flex-wrap: wrap;
  row-gap: 8px;
}

.header-title {
  word-break: keep-all;
  overflow-wrap: break-word;
}

.header-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
}


.ticker-logo-wrap {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.ticker-logo {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.logo-bg-etf {
  background: rgba(var(--v-theme-primary), 0.1);
}
.logo-bg-kr {
  background: rgba(var(--v-theme-warning), 0.1);
}
.logo-text {
  font-size: 0.6875rem;
  font-weight: 800;
  letter-spacing: -0.5px;
}
.logo-text-etf {
  color: var(--fp-primary);
}
.logo-text-kr {
  color: var(--fp-warning);
}

.ticker-name {
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.card-amount {
  font-size: 0.8125rem;
  font-weight: 700;
}

.ticker-sub {
  font-size: 0.6875rem;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.account-tag {
  display: inline-block;
  font-size: 0.625rem;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  border-radius: 4px;
  padding: 1px 5px;
  vertical-align: middle;
}

.compact-price-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}
.compact-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.compact-sep {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.3);
}
.compact-arrow {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.35);
  margin: 0 1px;
}
.compact-fail {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.3);
}

/* ── 스와이프 래퍼 ── */
.portfolio-card-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  transition: transform 0.2s ease;
}

.swipe-hint {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.35);
  text-align: center;
  margin: 0 0 8px;
}

/* ── 드래그 카드 이동 애니메이션 ── */
.account-filter-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.account-chip {
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  background: none;
  cursor: pointer;
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
  transition: all 0.15s;
}
.account-chip:active { opacity: 0.7; }
.account-chip-active {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.07);
}

.sort-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  background: none;
  cursor: pointer;
  font-size: 0.6875rem;
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
  /* minmax(0, 1fr): 글자 크기가 커져 내용이 칸보다 길어져도 넘치지 않고
     칸 안에서 줄바꿈되도록 함 */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px 16px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
/* isNarrowScreen(좁은 화면 또는 글자 크기 확대)일 때 4칸 전부 동시에 이 모양으로
   전환 — 칸마다 내용 길이에 따라 따로따로 줄바꿈되어 들쭉날쭉해지는 것을 방지 */
.summary-row--stacked {
  flex-direction: column;
  align-items: flex-start;
  white-space: normal;
  gap: 2px;
}
.summary-amount-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.summary-amount-sub {
  font-size: 0.5625rem;
  color: rgba(var(--v-theme-on-surface), 0.35);
  line-height: 1.3;
  margin-top: 1px;
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
  /* 카드 클리핑 경계와 정확히 맞닿지 않도록 사방으로 여유를 두어, 서브픽셀
     오차로 클리핑이 어긋나도 버튼 색이 아니라 배경만 살짝 보이게 함 */
  right: 6px;
  top: 6px;
  bottom: 6px;
  width: 116px;
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
  font-size: 0.6875rem;
  font-weight: 600;
  color: #fff;
  transition: filter 0.15s;
}
.action-btn:active {
  filter: brightness(0.9);
}
.action-edit {
  background: var(--fp-primary);
  border-radius: 16px 0 0 16px;
}
.action-delete {
  background: var(--fp-error);
  border-radius: 0 16px 16px 0;
}

.swipe-card {
  position: relative;
  z-index: 1;
  transition: transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: transform;
  border-radius: 20px;
  overflow: hidden;
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
  border-left-color: var(--fp-success) !important;
}

.glass-dialog {
  background: var(--fp-surface) !important;
  border: 1px solid var(--fp-outline) !important;
}
</style>
