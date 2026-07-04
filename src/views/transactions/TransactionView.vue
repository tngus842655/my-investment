<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getTickerDisplayName } from '@/utils/tickerNames'
import { recomputeAssetSummary } from '@/services/assetSummary'
import { useUserDataStore } from '@/stores/userData'
import { useRegisterPullToRefresh, clearPullToRefresh } from '@/composables/usePullToRefresh'
import TransactionAddDialog from './TransactionAddDialog.vue'

const userDataStore = useUserDataStore()

type TransactionType = 'BUY' | 'SELL' | 'INITIAL'
type FilterType = 'ALL' | 'BUY' | 'SELL'

interface Transaction {
  id: string
  portfolio_id: string
  transaction_type: TransactionType
  quantity: number
  unit_price: number
  transaction_date: string
  memo?: string
  portfolios: {
    ticker: string
    asset_type: string
    currency: string
    account_name: string | null
  }
}

const PAGE_SIZE = 30
const loading = ref(false)
const loadingMore = ref(false)
const refreshing = ref(false)
const hasMore = ref(true)
const currentPage = ref(0)
const transactions = ref<Transaction[]>([])
const filter = ref<FilterType>('ALL')
const selectedYear = ref<number | null>(null)
const selectedMonth = ref<number | null>(null)
const selectedAccount = ref<string | null>(null)
const accountOptions = ref<string[]>([])
const accountPortfolioIds = ref<string[]>([])

const yearOptions = ref<number[]>([])
const monthOptions = ref<number[]>([])

const loadAccountOptions = async () => {
  const portfolios = await userDataStore.ensurePortfolios()
  const accounts = [...new Set(portfolios.map((p) => p.account_name ?? '미지정'))]
  accountOptions.value = accounts.length > 1
    ? ['미지정', ...accounts.filter((a) => a !== '미지정').sort((a, b) => a.localeCompare(b, 'ko'))]
    : []
  // 초기에는 전체
  accountPortfolioIds.value = portfolios.map((p) => p.id)
}

const loadYearOptions = async () => {
  const { data } = await supabase
    .from('transactions')
    .select('transaction_date')
    .eq('user_id', userId)
    .neq('transaction_type', 'INITIAL')
  if (!data) return
  const years = [...new Set(data.map((t) => parseInt(t.transaction_date.slice(0, 4))))]
  yearOptions.value = years.sort((a, b) => b - a)
}

const loadMonthOptions = async (year: number) => {
  const { data } = await supabase
    .from('transactions')
    .select('transaction_date')
    .eq('user_id', userId)
    .neq('transaction_type', 'INITIAL')
    .gte('transaction_date', `${year}-01-01`)
    .lte('transaction_date', `${year}-12-31`)
  if (!data) return
  const months = [...new Set(data.map((t) => parseInt(t.transaction_date.slice(5, 7))))]
  monthOptions.value = months.sort((a, b) => a - b)
}

let skipMonthReset = false
watch(selectedYear, (y) => {
  if (skipMonthReset) {
    // onMounted에서 이미 월 옵션을 조회한 직후 selectedYear를 설정하는 경우 — 재조회 불필요
    skipMonthReset = false
    return
  }
  selectedMonth.value = null
  if (y) loadMonthOptions(y)
  else monthOptions.value = []
})

const parsedDateFilter = computed<string | null>(() => {
  if (!selectedYear.value) return null
  const y = selectedYear.value
  const m = selectedMonth.value
  if (m) return `${y}-${String(m).padStart(2, '0')}`
  return null
})

const addDialog = ref(false)
const editDialog = ref(false)
const deleteDialog = ref(false)
const selectedTx = ref<Transaction | null>(null)

const swipedId = ref<string | null>(null)
const SWIPE_THRESHOLD = 40
const ACTION_WIDTH = 128
const swipeTouchStartX = ref(0)
const swipeTouchStartY = ref(0)
const isDraggingSwipe = ref(false)
const isVerticalScroll = ref(false)

// stat용 전체 데이터 (경량)
interface TotalRow { transaction_type: string; quantity: number; unit_price: number; portfolios: { currency: string } | null }
const totalsData = ref<TotalRow[]>([])

let userId = ''

async function buildQuery(from: number, to: number) {
  let q = supabase
    .from('transactions')
    .select('*, portfolios(ticker, asset_type, currency, account_name)')
    .eq('user_id', userId)
    .neq('transaction_type', 'INITIAL')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filter.value !== 'ALL') q = q.eq('transaction_type', filter.value)
  if (selectedAccount.value && accountPortfolioIds.value.length > 0)
    q = q.in('portfolio_id', accountPortfolioIds.value)
  const df = parsedDateFilter.value
  if (df) {
    if (df.length === 7) {
      // YYYY-MM → 해당 월 전체
      const [y, m] = df.split('-').map(Number)
      const lastDay = new Date(y!, m!, 0).getDate()
      q = q.gte('transaction_date', `${df}-01`).lte('transaction_date', `${df}-${lastDay}`)
    } else {
      // YYYY-MM-DD → 해당 날짜만
      q = q.eq('transaction_date', df)
    }
  }
  return q
}

// ── 페이지 로드 ───────────────────────────────────
const loadPage = async (pageNum: number) => {
  if (pageNum === 0) {
    if (transactions.value.length === 0) loading.value = true
    else loadingMore.value = true
  } else loadingMore.value = true
  try {
    const from = pageNum * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const q = await buildQuery(from, to)
    const { data, error } = await q
    if (error) throw error

    const rows = (data ?? []).filter(
      (tx) => (tx.portfolios as { asset_type: string } | null)?.asset_type !== '현금',
    ) as Transaction[]

    if (pageNum === 0) transactions.value = rows
    else transactions.value = [...transactions.value, ...rows]

    hasMore.value = rows.length === PAGE_SIZE
    currentPage.value = pageNum
  } catch (e) {
    console.error(e)
    showMessage('거래내역 조회 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const resetAndLoad = async () => {
  currentPage.value = 0
  hasMore.value = true
  await loadPage(0)
  await nextTick()
  if (observer && sentinel.value) {
    observer.unobserve(sentinel.value)
    observer.observe(sentinel.value)
  }
}

const loadMore = async () => {
  if (!hasMore.value || loadingMore.value) return
  await loadPage(currentPage.value + 1)
}

const getScrollContainer = () =>
  document.querySelector<HTMLElement>('.app-content') ?? window as unknown as HTMLElement

const refreshWithScroll = async () => {
  const container = getScrollContainer()
  const scrollY = container instanceof HTMLElement ? container.scrollTop : window.scrollY
  await Promise.all([resetAndLoad(), loadTotals()])
  await nextTick()
  if (container instanceof HTMLElement) container.scrollTop = scrollY
  else window.scrollTo({ top: scrollY })
}

const refresh = async () => {
  refreshing.value = true
  await Promise.all([resetAndLoad(), loadTotals()])
  refreshing.value = false
}

// stat 전용 조회 (현재 필터/날짜 조건 반영)
const loadTotals = async () => {
  let q = supabase
    .from('transactions')
    .select('transaction_type, quantity, unit_price, portfolios(currency)')
    .eq('user_id', userId)
    .neq('transaction_type', 'INITIAL')

  if (filter.value !== 'ALL') q = q.eq('transaction_type', filter.value)
  if (selectedAccount.value && accountPortfolioIds.value.length > 0)
    q = q.in('portfolio_id', accountPortfolioIds.value)
  const df = parsedDateFilter.value
  if (df) {
    if (df.length === 7) {
      const [y, m] = df.split('-').map(Number)
      const lastDay = new Date(y!, m!, 0).getDate()
      q = q.gte('transaction_date', `${df}-01`).lte('transaction_date', `${df}-${lastDay}`)
    } else {
      q = q.eq('transaction_date', df)
    }
  }

  const { data } = await q
  totalsData.value = (data ?? []) as unknown as TotalRow[]
}

// ── 삭제 ─────────────────────────────────────────
const deleteTx = async () => {
  if (!selectedTx.value) return
  try {
    const { error } = await supabase.from('transactions').delete().eq('id', selectedTx.value.id)
    if (error) throw error
    showMessage('거래내역이 삭제되었습니다.', 'success')
    const deletedId = selectedTx.value.id
    deleteDialog.value = false
    selectedTx.value = null
    transactions.value = transactions.value.filter((t) => t.id !== deletedId)
    loadTotals()
    // DB 트리거가 portfolios.quantity/avg_price를 재계산하므로 캐시 무효화
    userDataStore.invalidatePortfolios()
    // 대시보드 등에서 총자산이 바로 반영되도록 백그라운드로 재계산
    recomputeAssetSummary(userId)
  } catch (e) {
    console.error(e)
    showMessage('삭제 중 오류가 발생했습니다.', 'error')
  }
}

const openEditDialog = (item: Transaction) => {
  swipedId.value = null
  selectedTx.value = item
  editDialog.value = true
}

const openDeleteDialog = (item: Transaction) => {
  swipedId.value = null
  selectedTx.value = item
  deleteDialog.value = true
}

watch(filter, () => { resetAndLoad(); loadTotals() })
watch(parsedDateFilter, () => {
  resetAndLoad()
  loadTotals()
})
watch(selectedAccount, async (acc) => {
  const portfolios = await userDataStore.ensurePortfolios()
  accountPortfolioIds.value = (
    acc ? portfolios.filter((p) => (p.account_name ?? '미지정') === acc) : portfolios
  ).map((p) => p.id)
  resetAndLoad()
  loadTotals()
})

// ── 무한스크롤 (IntersectionObserver) ────────────
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const setupObserver = () => {
  if (!sentinel.value) return
  observer = new IntersectionObserver(
    (entries) => { if (entries[0]?.isIntersecting) loadMore() },
    { threshold: 0.1 },
  )
  observer.observe(sentinel.value)
}

// ── 그룹 (표시용) ─────────────────────────────────
const grouped = computed(() => {
  const map = new Map<string, Transaction[]>()
  for (const t of transactions.value) {
    const key = t.transaction_date.slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
})

const usdToKrw = ref(0)

const hasUSD = computed(() =>
  totalsData.value.some((t) => t.portfolios?.currency === 'USD'),
)

const totalBuy = computed(() => {
  const krw = totalsData.value
    .filter((t) => t.transaction_type === 'BUY' && t.portfolios?.currency === 'KRW')
    .reduce((s, t) => s + t.quantity * t.unit_price, 0)
  const usd = totalsData.value
    .filter((t) => t.transaction_type === 'BUY' && t.portfolios?.currency === 'USD')
    .reduce((s, t) => s + t.quantity * t.unit_price, 0)
  return krw + usd * (usdToKrw.value || 1)
})

const totalSell = computed(() => {
  const krw = totalsData.value
    .filter((t) => t.transaction_type === 'SELL' && t.portfolios?.currency === 'KRW')
    .reduce((s, t) => s + t.quantity * t.unit_price, 0)
  const usd = totalsData.value
    .filter((t) => t.transaction_type === 'SELL' && t.portfolios?.currency === 'USD')
    .reduce((s, t) => s + t.quantity * t.unit_price, 0)
  return krw + usd * (usdToKrw.value || 1)
})



const truncateAccount = (name: string) =>
  /[ㄱ-ㅎ가-힣]/.test(name) ? name.slice(0, 2) : name.slice(0, 4)

const formatDate = (d: string) => {
  const date = new Date(d)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const formatKrwValue = (total: number) => {
  if (total >= 100000000) {
    const eok = Math.floor(total / 100000000)
    const rem = Math.round((total % 100000000) / 10000000)
    return rem > 0 ? `${eok}억 ${rem}천만원` : `${eok}억원`
  }
  if (total >= 10000) return `${Math.round(total / 10000).toLocaleString()}만원`
  return `${Math.round(total).toLocaleString()}원`
}

const formatAmount = (t: Transaction) => {
  const total = t.quantity * t.unit_price
  const cur = t.portfolios?.currency ?? 'KRW'
  if (cur === 'USD') {
    return (
      '$' +
      (total % 1 === 0
        ? total.toLocaleString('en-US')
        : total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    )
  }
  return formatKrwValue(total)
}

const formatAmountKrw = (t: Transaction) => {
  const total = t.quantity * t.unit_price * usdToKrw.value
  return `(${formatKrwValue(total)})`
}

const formatUnitPrice = (t: Transaction) => {
  const p = t.unit_price
  const cur = t.portfolios?.currency ?? 'KRW'
  if (cur === 'USD') {
    return (
      '$' +
      (p % 1 === 0
        ? p.toLocaleString('en-US')
        : p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    )
  }
  if (p >= 10000) return `${Math.round(p / 10000).toLocaleString()}만`
  return Math.round(p).toLocaleString()
}

const formatStatAmount = (v: number) => {
  if (v >= 100000000) return `${Math.floor(v / 100000000).toLocaleString()}억`
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만`
  return v.toLocaleString()
}

const assetTypeColor = (type: string) =>
  ({ 국내주식: 'blue', 해외주식: 'purple', ETF: 'teal', 암호화폐: 'amber', 현금: 'green' })[type] ??
  'grey'

// ── 스와이프 ──────────────────────────────────────
const onSwipeTouchStart = (e: TouchEvent) => {
  swipeTouchStartX.value = e.touches[0]?.clientX ?? 0
  swipeTouchStartY.value = e.touches[0]?.clientY ?? 0
  isDraggingSwipe.value = true
  isVerticalScroll.value = false
}
const onSwipeTouchMove = (e: TouchEvent) => {
  if (!isDraggingSwipe.value || isVerticalScroll.value) return
  const dx = Math.abs(swipeTouchStartX.value - (e.touches[0]?.clientX ?? 0))
  const dy = Math.abs(swipeTouchStartY.value - (e.touches[0]?.clientY ?? 0))
  if (dy > dx && dy > 5) isVerticalScroll.value = true
}
const onSwipeTouchEnd = (e: TouchEvent, id: string) => {
  if (!isDraggingSwipe.value) return
  isDraggingSwipe.value = false
  if (isVerticalScroll.value) return
  const dx = swipeTouchStartX.value - (e.changedTouches[0]?.clientX ?? 0)
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
  const swipedEl = document.querySelector(`.tx-card-wrap[data-id="${swipedId.value}"]`)
  if (swipedEl?.contains(e.target as Node)) return
  closeSwipe()
}

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return
  userId = session.user.id
  await Promise.all([loadYearOptions(), loadAccountOptions()])

  // 최근 거래가 있는 연/월을 기본 필터로 선택 (가독성 개선 — 진입 시 전체 내역이 한번에 쏟아지지 않도록)
  let defaultFilterApplied = false
  if (yearOptions.value.length > 0) {
    const latestYear = yearOptions.value[0]!
    await loadMonthOptions(latestYear)
    if (monthOptions.value.length > 0) {
      skipMonthReset = true
      selectedYear.value = latestYear
      selectedMonth.value = monthOptions.value[monthOptions.value.length - 1]!
      defaultFilterApplied = true
    }
  }
  if (!defaultFilterApplied) await Promise.all([resetAndLoad(), loadTotals()])

  usdToKrw.value = await getCachedExchangeRate()
  await nextTick()
  setupObserver()
  useRegisterPullToRefresh(refresh)
})

onUnmounted(() => {
  observer?.disconnect()
  clearPullToRefresh()
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" @click="onContainerClick">
    <!-- 헤더 -->
    <div class="d-flex justify-space-between align-center mb-5">
      <div class="d-flex align-center ga-2">
        <img src="/icons/icon-record.png" class="header-icon" alt="기록" />
        <div>
          <div class="text-h5 font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">
            거래내역
          </div>
          <div class="text-body-2 text-medium-emphasis">매수 / 매도 기록</div>
        </div>
      </div>
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

    <!-- 스켈레톤 -->
    <template v-if="loading">
      <div class="stat-grid mb-4">
        <v-skeleton-loader type="card" class="rounded-xl" style="height: 80px" />
        <v-skeleton-loader type="card" class="rounded-xl" style="height: 80px" />
      </div>
      <v-skeleton-loader
        v-for="n in 3"
        :key="n"
        type="list-item-three-line"
        class="glass-card mb-2 rounded-xl"
      />
    </template>

    <template v-else>
      <!-- 요약 stat grid -->
      <div class="stat-grid mb-4">
        <div class="stat-card">
          <div class="d-flex align-center ga-1 mb-1">
            <v-icon size="13" color="success">mdi-arrow-down-bold</v-icon>
            <span class="stat-label">총 매수</span>
          </div>
          <div class="stat-value">
            {{ formatStatAmount(totalBuy) }}<span class="stat-unit">원</span>
          </div>
          <div class="text-caption text-disabled">
            {{ totalsData.filter((t) => t.transaction_type === 'BUY').length }}건
          </div>
        </div>
        <div class="stat-card">
          <div class="d-flex align-center ga-1 mb-1">
            <v-icon size="13" color="error">mdi-arrow-up-bold</v-icon>
            <span class="stat-label">총 매도</span>
          </div>
          <div class="stat-value">
            {{ formatStatAmount(totalSell) }}<span class="stat-unit">원</span>
          </div>
          <div class="text-caption text-disabled">
            {{ totalsData.filter((t) => t.transaction_type === 'SELL').length }}건
          </div>
        </div>
      </div>

      <!-- 필터 세그먼트 -->
      <div class="filter-wrap mb-4">
        <button
          v-for="f in ['ALL', 'BUY', 'SELL'] as FilterType[]"
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

      <!-- 계좌 필터 -->
      <div v-if="accountOptions.length > 0" class="account-filter-row mb-3">
        <button
          class="account-chip"
          :class="{ 'account-chip-active': selectedAccount === null }"
          @click="selectedAccount = null; closeSwipe()"
        >전체</button>
        <button
          v-for="acc in accountOptions"
          :key="acc"
          class="account-chip"
          :class="{ 'account-chip-active': selectedAccount === acc }"
          @click="selectedAccount = acc; closeSwipe()"
        >{{ acc }}</button>
      </div>

      <!-- 날짜 드롭다운 + 건수 -->
      <div class="d-flex align-center mb-3 ga-2">
        <div class="date-filter-wrap">
          <select v-model="selectedYear" class="date-select">
            <option :value="null">연도</option>
            <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}년</option>
          </select>
          <select v-model="selectedMonth" class="date-select" :disabled="!selectedYear">
            <option :value="null">월</option>
            <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}월</option>
          </select>
          <button v-if="selectedYear" class="date-clear-btn" @click="selectedYear = null; selectedMonth = null">
            <v-icon size="12">mdi-close</v-icon>
          </button>
          <span v-if="hasUSD && usdToKrw" class="date-hint">적용환율 {{ Math.round(usdToKrw).toLocaleString() }}원 (전일 기준)</span>
        </div>
        <span class="text-caption text-disabled flex-shrink-0 ml-auto">총 {{ totalsData.length }}건</span>
      </div>

      <!-- 빈 상태 -->
      <template v-if="transactions.length === 0 && !loading">
        <div class="glass-card py-12 text-center">
          <v-icon size="48" color="primary" class="mb-4" style="opacity: 0.4"
            >mdi-swap-horizontal</v-icon
          >
          <div class="text-h6 font-weight-medium text-medium-emphasis">
            {{ parsedDateFilter || filter !== 'ALL' ? '검색 결과가 없습니다' : '거래내역이 없습니다' }}
          </div>
          <div class="text-body-2 text-disabled mt-1">
            {{ parsedDateFilter || filter !== 'ALL' ? '다른 날짜나 필터를 선택해보세요.' : '거래 추가 버튼으로 첫 거래를 기록하세요.' }}
          </div>
          <v-btn
            v-if="!parsedDateFilter && filter === 'ALL'"
            color="primary"
            variant="tonal"
            rounded="lg"
            class="mt-6"
            prepend-icon="mdi-plus"
            @click="addDialog = true"
          >
            거래 추가
          </v-btn>
        </div>
      </template>

      <!-- 타임라인 -->
      <template v-else>
        <div v-for="[monthKey, items] in grouped" :key="monthKey" class="mb-2">
          <div
            v-for="item in items"
            :key="item.id"
            class="tx-card-wrap mb-2"
            :data-id="item.id"
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
              @touchstart.passive="onSwipeTouchStart"
              @touchmove.passive="onSwipeTouchMove"
              @touchend.passive="(e) => onSwipeTouchEnd(e, item.id)"
              @mousedown="onSwipeMouseDown"
              @mouseup="(e) => onSwipeMouseUp(e, item.id)"
            >
              <div
                class="glass-card tx-card"
                :class="item.transaction_type === 'BUY' ? 'border-buy-left' : 'border-sell-left'"
              >
                <div class="d-flex align-center ga-2">
                  <!-- 타입 아이콘 -->
                  <div class="type-badge" :class="item.transaction_type === 'BUY' ? 'type-buy' : 'type-sell'">
                    <v-icon size="14">{{ item.transaction_type === 'BUY' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold' }}</v-icon>
                  </div>

                  <!-- 종목 정보 -->
                  <div class="flex-grow-1 min-width-0">
                    <!-- 1줄: 종목명 + 배지 + 날짜 -->
                    <div class="d-flex align-center justify-space-between mb-1">
                      <div class="d-flex align-center ga-1 flex-grow-1 min-width-0">
                        <span class="tx-name">{{ getTickerDisplayName(item.portfolios?.ticker) }}</span>
                        <span v-if="getTickerDisplayName(item.portfolios?.ticker) !== item.portfolios?.ticker" class="tx-ticker flex-shrink-0">{{ item.portfolios?.ticker }}</span>
                        <span class="asset-badge flex-shrink-0" :style="`color: rgb(var(--v-theme-${assetTypeColor(item.portfolios?.asset_type)}))`">{{ item.portfolios?.asset_type }}</span>
                        <span v-if="item.portfolios?.account_name && item.portfolios.account_name !== '미지정'" class="account-tag flex-shrink-0">{{ truncateAccount(item.portfolios.account_name) }}</span>
                        <span class="tx-type-badge flex-shrink-0" :class="item.transaction_type === 'BUY' ? 'badge-buy' : 'badge-sell'">{{ item.transaction_type === 'BUY' ? '매수' : '매도' }}</span>
                      </div>
                      <div class="d-flex align-center ga-1">
                        <v-tooltip v-if="item.memo" :text="item.memo" location="top">
                          <template #activator="{ props }">
                            <v-icon v-bind="props" size="12" style="color: rgba(var(--v-theme-on-surface), 0.35); cursor: pointer">mdi-note-text-outline</v-icon>
                          </template>
                        </v-tooltip>
                        <span class="date-label">{{ formatDate(item.transaction_date) }}</span>
                      </div>
                    </div>
                    <!-- 2줄: 수량 × 단가 / 금액 -->
                    <div class="d-flex align-center justify-space-between">
                      <span class="tx-detail">{{ item.quantity % 1 === 0 ? item.quantity : Number(item.quantity).toFixed(4) }}주 × {{ formatUnitPrice(item) }}</span>
                      <span class="tx-amount" :class="item.transaction_type === 'BUY' ? 'amount-plus' : 'amount-minus'">
                        {{ item.transaction_type === 'BUY' ? '+' : '-' }}{{ formatAmount(item) }}
                        <span v-if="item.portfolios?.currency === 'USD' && usdToKrw" class="tx-amount-krw">{{ formatAmountKrw(item) }}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 무한스크롤 sentinel -->
        <div ref="sentinel" style="height: 1px" />
        <div v-if="loadingMore" class="text-center py-4">
          <v-progress-circular indeterminate size="24" color="primary" />
        </div>
        <p class="swipe-hint">← 카드를 왼쪽으로 밀면 수정/삭제할 수 있어요</p>
      </template>
    </template>
  </v-container>

  <!-- 거래 추가 다이얼로그 -->
  <TransactionAddDialog
    v-model="addDialog"
    :initial-type="filter === 'SELL' ? 'SELL' : 'BUY'"
    :initial-account="selectedAccount ?? undefined"
    @saved="refresh"
  />

  <!-- 거래 수정 다이얼로그 -->
  <TransactionAddDialog
    v-model="editDialog"
    :initial-data="
      selectedTx
        ? {
            id: selectedTx.id,
            portfolio_id: selectedTx.portfolio_id,
            transaction_type: selectedTx.transaction_type as 'BUY' | 'SELL',
            quantity: selectedTx.quantity,
            unit_price: selectedTx.unit_price,
            transaction_date: selectedTx.transaction_date,
            memo: selectedTx.memo,
          }
        : null
    "
    @saved="refreshWithScroll"
  />

  <!-- 삭제 확인 -->
  <v-dialog v-model="deleteDialog" max-width="320">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-6">거래 삭제</v-card-title>
      <v-card-text class="text-center text-medium-emphasis">
        <strong>{{ selectedTx?.portfolios?.ticker }}</strong>
        {{ selectedTx?.transaction_type === 'BUY' ? '매수' : '매도' }} 거래를 삭제하시겠습니까?<br />
        <span class="text-caption">이 작업은 되돌릴 수 없습니다.</span>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn block variant="text" @click="deleteDialog = false">취소</v-btn>
        <v-btn block color="error" @click="deleteTx">삭제</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.swipe-hint {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.35);
  text-align: center;
  margin: 0 0 8px;
}

.header-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
}


.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.stat-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--fp-outline);
  border-radius: 16px;
  padding: 14px 16px;
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
  font-size: 18px;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}

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
  font-size: 11px;
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
  transition:
    background 0.18s ease,
    color 0.18s ease;
}
.filter-btn.active {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.month-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.45);
  padding: 0 2px;
}
.month-toggle {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: opacity 0.15s;
}
.month-toggle:active { opacity: 0.6; }

.type-badge {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.type-buy {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}
.type-sell {
  background: rgba(var(--v-theme-error), 0.1);
  color: var(--fp-error);
}

.date-label {
  font-size: 10px;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.3);
  flex-shrink: 0;
}

.tx-name {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tx-ticker {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.35);
  flex-shrink: 0;
}
.asset-badge {
  font-size: 9px;
  font-weight: 600;
  opacity: 0.8;
  flex-shrink: 0;
}
.account-tag {
  display: inline-block;
  font-size: 9px;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  border-radius: 4px;
  padding: 1px 5px;
  vertical-align: middle;
}
.tx-type-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
}
.badge-buy {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}
.badge-sell {
  background: rgba(var(--v-theme-error), 0.1);
  color: var(--fp-error);
}
.tx-detail {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.tx-amount {
  font-size: 13px;
  font-weight: 700;
}
.tx-amount-krw {
  font-size: 13px;
  font-weight: 700;
}
.amount-minus {
  color: rgb(var(--v-theme-error));
}
.amount-plus {
  color: rgb(var(--v-theme-on-surface));
}

.text-teal {
  color: var(--fp-primary) !important;
}

.tx-card {
  border-left: 3px solid transparent !important;
  border-radius: 16px !important;
  padding: 10px 12px !important;
}
.border-buy-left {
  border-left-color: rgb(var(--v-theme-success)) !important;
}
.border-sell-left {
  border-left-color: rgb(var(--v-theme-error)) !important;
}

.tx-card-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
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
  background: var(--fp-primary);
  border-radius: 20px 0 0 20px;
}
.action-delete {
  background: var(--fp-error);
  border-radius: 0 20px 20px 0;
}
.swipe-card {
  position: relative;
  z-index: 1;
  transition: transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: transform;
  /* will-change로 별도 합성 레이어가 되면서 부모의 overflow:hidden 클리핑이
     라운드 코너에서 정확히 안 맞물려 뒤쪽 스와이프 버튼이 새어 보이는 문제 —
     이 레이어 자신도 같은 반경으로 직접 클리핑하도록 함 */
  border-radius: 16px;
  overflow: hidden;
}


.min-width-0 {
  min-width: 0;
}

.date-filter-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 12px;
  padding: 4px 6px;
}
.date-select {
  height: 28px;
  padding: 0 22px 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24'%3E%3Cpath fill='%23888' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
  background-color: rgb(var(--v-theme-surface));
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.date-select:disabled {
  opacity: 0.35;
  cursor: default;
}
.date-hint {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.35);
  white-space: nowrap;
  padding: 0 4px;
}
.date-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.1);
  color: rgba(var(--v-theme-on-surface), 0.5);
  cursor: pointer;
  flex-shrink: 0;
}

</style>
