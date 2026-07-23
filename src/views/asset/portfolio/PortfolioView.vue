<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { prefetchTickerLogos } from '@/services/tickerLogo'
import { supabase } from '@/services/supabase'
import PortfolioAddDialog from './PortfolioAddDialog.vue'
import type { PortfolioAsset } from '@/types/portfolio'
import { showMessage } from '@/composables/useSnackbar'
import { getStockQuote } from '@/services/market'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getTickerLabel, isEtfTicker, getTickerDisplayName } from '@/utils/tickerNames'
import { evaluateItemBase, simpleCostBase, convertMoney } from '@/utils/portfolioMath'
import { getAssetClass, getMarket, isCash as isCashItem } from '@/config/marketConfig'
import { useUserDataStore } from '@/stores/userData'
import { useRegisterPullToRefresh, clearPullToRefresh } from '@/composables/usePullToRefresh'
import { useFontScale } from '@/composables/useFontScale'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { formatMoneyIn } from '@/utils/numberFormat'
import { isKoLocale } from '@/plugins/i18n'
import { displayAccountName } from '@/utils/accountName'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()
const userDataStore = useUserDataStore()
const loading = ref(false)

interface PortfolioViewItem extends PortfolioAsset {
  currentPrice?: number
  evaluationAmount?: number
  evaluationAmountBase?: number
  costBase?: number
  profitAmountBase?: number
  profitRate?: number
  changeRate?: number | null // 전일 대비 등락률(%)
  isPriceFallback?: boolean // 현재가 조회 실패 시 true
  groupCount?: number // 종목별 묶기 시 합쳐진 계좌(행) 수
}

const portfolios = ref<PortfolioViewItem[]>([])
const logoMap = ref<Record<string, string | null>>({})
const exchangeRate = ref<number | null>(null)
const { baseCurrency, displayCurrency, money, moneyOr } = useBaseCurrency()

// ── 스와이프 상태 ─────────────────────────────────
const swipedId = ref<string | null>(null)
const SWIPE_THRESHOLD = 40
const ACTION_WIDTH = 128

// ── 카드 플립 상태 ────────────────────────────────
// 탭하면 뒷면(상세 정보) 표시. 스와이프와 상호 배타.
const flippedId = ref<string | null>(null)
const TAP_THRESHOLD = 10 // 이동량이 이보다 작으면 탭으로 간주
const toggleFlip = (id: string) => {
  swipedId.value = null // 스와이프 열림 상태면 닫고 플립
  flippedId.value = flippedId.value === id ? null : id
}

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

const totalEvaluationAmountBase = computed(() =>
  portfolios.value
    .filter((item) => !isCashItem(item))
    .reduce((sum, item) => sum + (item.evaluationAmountBase ?? 0), 0),
)
const totalProfitAmountBase = computed(() =>
  portfolios.value
    .filter((item) => !isCashItem(item))
    .reduce((sum, item) => sum + (item.profitAmountBase ?? 0), 0),
)
const totalCostBase = computed(() =>
  portfolios.value
    .filter((item) => !isCashItem(item))
    .reduce((sum, item) => sum + (item.costBase ?? 0), 0),
)
const totalProfitRate = computed(() => {
  if (totalCostBase.value === 0) return 0
  return (totalProfitAmountBase.value / totalCostBase.value) * 100
})
const hasUSD = computed(() => portfolios.value.some((item) => item.currency === 'USD'))

// ── 자산군별 시세 안내 ─────────────────────────────
const PRICE_DELAY_INFO = [
  { emoji: '🇰🇷', labelKey: 'portfolio.priceInfo.kr', descKey: 'portfolio.priceInfo.krDesc' },
  { emoji: '🌎', labelKey: 'portfolio.priceInfo.overseas', descKey: 'portfolio.priceInfo.overseasDesc' },
  { emoji: '🪙', labelKey: 'portfolio.priceInfo.crypto', descKey: 'portfolio.priceInfo.cryptoDesc' },
  { emoji: '💱', labelKey: 'portfolio.priceInfo.fx', descKey: 'portfolio.priceInfo.fxDesc' },
]
const goToTickerNameRequest = () => {
  router.push({ name: 'feedback', query: { category: '기능제안', title: t('portfolio.registerTickerName') } })
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
        isCashItem(item)
          ? Promise.resolve(null)
          : getStockQuote(item.ticker, item).catch(() => null),
      ),
    ])

    // 포트폴리오 currency 맵 (costBaseMap 계산에 활용)
    const portfolioCurrencyMap = new Map(items.map((item) => [item.id, item.currency]))

    // 포트폴리오별 기준통화 원가 계산
    const txRows = txResult.data ?? []
    const costBaseMap = new Map<string, number>()
    for (const tx of txRows) {
      const currency = portfolioCurrencyMap.get(tx.portfolio_id) ?? 'KRW'
      const baseAmount = convertMoney(tx.unit_price * tx.quantity, currency, baseCurrency.value, rate)
      const prev = costBaseMap.get(tx.portfolio_id) ?? 0
      if (tx.transaction_type === 'BUY' || tx.transaction_type === 'INITIAL') {
        costBaseMap.set(tx.portfolio_id, prev + baseAmount)
      } else if (tx.transaction_type === 'SELL') {
        costBaseMap.set(tx.portfolio_id, prev - baseAmount)
      }
    }

    portfolios.value = items.map((item, i) => {
      const isCash = isCashItem(item)

      // 현금은 현재가 API 조회 불필요, avg_price 그대로 사용
      const quote = prices[i]
      const currentPrice = isCash ? null : quote && quote.price > 0 ? quote.price : null
      const changeRate = isCash ? null : (quote?.changeRate ?? null)

      const { currentPriceInCurrency, evaluationAmount, evaluationAmountBase } =
        evaluateItemBase(item, currentPrice, rate, baseCurrency.value)
      const isPriceFallback = !isCash && currentPriceInCurrency === null

      // 거래 내역 기준으로 계산한 기준통화 원가 (없으면 평균단가 근사치 fallback)
      const costBase = costBaseMap.get(item.id) ?? simpleCostBase(item, rate, baseCurrency.value)

      // 현금은 손익 표시 안 함
      const profitAmountBase = isPriceFallback || isCash ? 0 : evaluationAmountBase - costBase
      const profitRate =
        isPriceFallback || isCash || costBase === 0 ? 0 : (profitAmountBase / costBase) * 100

      return {
        ...item,
        currentPrice: currentPriceInCurrency ?? undefined,
        evaluationAmount,
        evaluationAmountBase,
        costBase,
        profitAmountBase,
        profitRate,
        changeRate,
        isPriceFallback,
      }
    })

    // 평가금액 합산 후 asset_summary에 저장 (현금 제외 — FIRE 예측은 투자자산 기준)
    const totalEval = portfolios.value
      .filter((item) => !isCashItem(item))
      .reduce((sum, item) => sum + (item.evaluationAmountBase ?? 0), 0)
    const totalCost = portfolios.value
      .filter((item) => !isCashItem(item))
      .reduce((sum, item) => sum + simpleCostBase(item, rate, baseCurrency.value), 0)
    const roundedEval = Math.round(totalEval)
    supabase
      .from('asset_summary')
      .upsert(
        {
          user_id: user.id,
          current_asset: roundedEval,
          investment_principal: Math.round(totalCost),
          base_currency: baseCurrency.value,
        },
        { onConflict: 'user_id' },
      )
      .then(({ error }) => {
        if (error) console.warn('asset_summary 저장 실패:', error.message)
        else userDataStore.invalidateAssetSummary()
      })

  } catch (error) {
    console.error(error)
    showMessage(t('portfolio.loadError'), 'error')
  } finally {
    loading.value = false
  }

  // 로고 fetch — 캐시 히트는 즉시 반영, 미스만 병렬 API 호출
  prefetchTickerLogos(
    portfolios.value.filter((item) => !isCashItem(item)),
    (ticker, url) => {
      logoMap.value[ticker] = url
    },
  )
}

// ── 커스텀 드래그앤드롭 ───────────────────────────
const startDrag = (e: MouseEvent | TouchEvent, item: PortfolioViewItem) => {
  e.preventDefault()
  swipedId.value = null
  flippedId.value = null

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
    showMessage(t('portfolio.saveOrderError'), 'error')
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
// 터치 직후 브라우저가 합성 마우스 이벤트를 발생시킴(핸들러가 passive라 preventDefault
// 불가). 스와이프는 멱등이라 무해했지만 플립 토글은 두 번 실행돼 상쇄되므로, 최근
// 터치 후 짧은 시간 동안 마우스 핸들러를 무시한다.
let lastTouchTime = 0

const onSwipeTouchStart = (e: TouchEvent) => {
  if (draggingId.value) return
  lastTouchTime = Date.now()
  swipeTouchStartX.value = e.touches[0]?.clientX ?? 0
  swipeTouchStartY.value = e.touches[0]?.clientY ?? 0
  isDraggingSwipe.value = true
}
const onSwipeTouchEnd = (e: TouchEvent, id: string, flippable: boolean, swipeable = true) => {
  if (!isDraggingSwipe.value) return
  lastTouchTime = Date.now()
  isDraggingSwipe.value = false
  const dx = swipeTouchStartX.value - (e.changedTouches[0]?.clientX ?? 0)
  const dy = Math.abs(swipeTouchStartY.value - (e.changedTouches[0]?.clientY ?? 0))
  // 탭(이동량이 거의 없음): 열린 스와이프는 닫기만, 그 외엔 플립 토글
  if (Math.abs(dx) < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
    if (swipedId.value === id) swipedId.value = null
    else if (flippable) toggleFlip(id)
    return
  }
  if (dy > 10 && dy > Math.abs(dx)) return
  // 종목별 묶기 카드(여러 행 합산)는 수정/삭제 대상이 애매하므로 스와이프 열기 제외
  if (dx > SWIPE_THRESHOLD) { if (!swipeable) return; swipedId.value = id; flippedId.value = null }
  else if (dx < -SWIPE_THRESHOLD / 2 && swipedId.value === id) swipedId.value = null
}
const onSwipeMouseDown = (e: MouseEvent) => {
  if (Date.now() - lastTouchTime < 700) return // 터치 후 합성 마우스 이벤트 무시
  swipeTouchStartX.value = e.clientX
  swipeTouchStartY.value = e.clientY
  isDraggingSwipe.value = true
}
const onSwipeMouseUp = (e: MouseEvent, id: string, flippable: boolean, swipeable = true) => {
  if (Date.now() - lastTouchTime < 700) return // 터치 후 합성 마우스 이벤트 무시
  if (!isDraggingSwipe.value) return
  isDraggingSwipe.value = false
  const dx = swipeTouchStartX.value - e.clientX
  const dy = Math.abs(swipeTouchStartY.value - e.clientY)
  // 클릭(이동량이 거의 없음): 열린 스와이프는 닫기만, 그 외엔 플립 토글
  if (Math.abs(dx) < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
    if (swipedId.value === id) swipedId.value = null
    else if (flippable) toggleFlip(id)
    return
  }
  if (dy > 10 && dy > Math.abs(dx)) return
  if (dx > SWIPE_THRESHOLD) { if (!swipeable) return; swipedId.value = id; flippedId.value = null }
  else if (dx < -SWIPE_THRESHOLD / 2 && swipedId.value === id) swipedId.value = null
}

const closeSwipe = () => {
  swipedId.value = null
}

// 열린 카드 자신을 클릭한 게 아니면(다른 카드·빈 영역·상단 버튼 등 어디든) 닫기
const onContainerClick = (e: MouseEvent) => {
  if (swipedId.value) {
    const swipedEl = document.querySelector(`.portfolio-card-wrap[data-id="${swipedId.value}"]`)
    if (!swipedEl?.contains(e.target as Node)) closeSwipe()
  }
  // 뒤집힌 카드 바깥을 클릭하면 플립도 닫기 (해당 카드 탭은 touchend/mouseup에서 이미 처리)
  if (flippedId.value) {
    const flippedEl = document.querySelector(`.portfolio-card-wrap[data-id="${flippedId.value}"]`)
    if (!flippedEl?.contains(e.target as Node)) flippedId.value = null
  }
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
    showMessage(t('portfolio.deleteSuccess'), 'success')
    deleteDialog.value = false
    await loadPortfolios()
  } catch (error) {
    console.error(error)
    showMessage(t('portfolio.deleteError'), 'error')
  }
}

// ── 포맷 유틸 ─────────────────────────────────────
const formatKrw = (v: number) => Math.round(v).toLocaleString('ko-KR')

// 보유자산 카드 평가금액/손익 — 표시통화(기준통화 또는 미리보기)로 포맷.
// 앞면 2번째 줄은 카드 폭 전체를 쓰는 한 줄이라 현실적인 값은 항상 들어감 → 숫자 그대로(full)
const displayEval = (v: number) => money(v, exchangeRate.value ?? 1350, 'full')
const displayProfit = (v: number) => (v > 0 ? '+' : '') + displayEval(v)

// 카드 뒷면 보유비중 — 투자자산(현금 제외) 평가금액 합계 대비 비율
const weightPercent = (item: PortfolioViewItem): number => {
  const total = totalEvaluationAmountBase.value
  if (!total) return 0
  return ((item.evaluationAmountBase ?? 0) / total) * 100
}

// 현금 카드: 보유 통화 그대로 표기 (기준통화 병기용)
const formatNative = (item: PortfolioViewItem) => {
  const v = item.avg_price * item.quantity
  // ko 외 로케일 KRW: 한글 단위(억/만) 대신 국제 표기 (1억 미만은 콤마 전체, 이상은 축약)
  if (item.currency === 'KRW' && !isKoLocale()) return formatMoneyIn(v, 'KRW', v >= 100000000 ? 'short' : 'full')
  return (item.currency === 'USD' ? '$' : '') + formatPrice(v, item.currency) + (item.currency === 'KRW' ? '원' : '')
}

// 화면 너비 감지 — 360px 미만(폴드 등 좁은 화면)이면 한글 축약
const windowWidth = ref(window.innerWidth)
const onResize = () => { windowWidth.value = window.innerWidth }
const isNarrowScreen = computed(() => windowWidth.value < 420)
const { fontScale } = useFontScale()

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

// 총합 카드용 — 기준통화가 원화면 좁은 화면일 때만 한글 축약, 그 외/미리보기는 통화 포맷
const formatSummaryKrw = (v: number) =>
  moneyOr(v, exchangeRate.value ?? 1350, (x) => (isNarrowScreen.value ? formatKrwShort(x) : formatKrw(x)))
const formatSummaryProfit = (v: number) =>
  moneyOr(
    v,
    exchangeRate.value ?? 1350,
    (x) => (isNarrowScreen.value ? (x > 0 ? '+' : '') + formatKrwShort(x) : formatProfit(x)),
  )

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

// 카드 뒷면 현재가/평균단가 — 보유 통화 그대로(원화·달러 기호 병기).
// 2열 그리드 반칸이라 폭이 좁으므로 값 길이로 개별 판단: 여유 있으면 숫자 그대로,
// 반칸을 넘칠 만큼 큰 값(대략 억 단위 이상)만 억/만으로 축약
const nativePrice = (v: number, currency: string) => {
  if (currency === 'KRW') {
    const full = Math.round(v).toLocaleString('ko-KR') + '원'
    return full.length > 11 ? formatPrice(v, 'KRW') + '원' : full
  }
  return (currency === 'USD' ? '$' : '') + formatPrice(v, currency)
}

const truncateAccount = (name: string) =>
  /[ㄱ-ㅎ가-힣]/.test(name) ? name.slice(0, 2) : name.slice(0, 4)
const formatProfit = (v: number) => (v > 0 ? '+' : '') + formatKrw(v)

// ── 요약 카드 라벨/값 실제 겹침 여부 측정 ──────────────────
// 화면에 안 보이는 측정용 사본(항상 한 줄, 줄바꿈 없음)의 실제 너비가
// 칸 너비를 넘는지 봐서, 정말 넘칠 것 같을 때만 라벨/값을 위아래로 쌓음
const summaryMeasureRef = ref<HTMLElement | null>(null)
const summaryStacked = ref(false)

const checkSummaryOverflow = () => {
  const el = summaryMeasureRef.value
  if (!el) return
  const rows = el.querySelectorAll<HTMLElement>('.summary-row--measure')
  let overflow = false
  rows.forEach((row) => {
    if (row.scrollWidth > row.clientWidth + 1) overflow = true
  })
  summaryStacked.value = overflow
}

const summaryMeasureKey = computed(() =>
  [
    formatSummaryKrw(totalCostBase.value),
    formatSummaryProfit(totalProfitAmountBase.value),
    formatSummaryKrw(totalEvaluationAmountBase.value),
    formatPercent(totalProfitRate.value),
    fontScale.value,
  ].join('|'),
)

watch(summaryMeasureKey, () => nextTick(checkSummaryOverflow))
const assetColor = (item: PortfolioViewItem): string => {
  switch (getAssetClass(item)) {
    case 'stock': return getMarket(item) === 'KR' ? 'blue' : 'purple'
    case 'etf': return 'teal'
    case 'crypto': return 'amber'
    case 'cash': return 'green'
    default: return 'grey'
  }
}

// ── 정렬 ─────────────────────────────────────────
type SortKey = 'custom' | 'eval' | 'profit' | 'rate' | 'name'
const SORT_STORAGE_KEY = 'firepath-portfolio-sort'
const sortKey = ref<SortKey>((localStorage.getItem(SORT_STORAGE_KEY) as SortKey) ?? 'custom')

const SORT_OPTIONS: { key: SortKey; labelKey: string; emoji: string }[] = [
  { key: 'custom', labelKey: 'portfolio.sortOptions.custom', emoji: '✋' },
  { key: 'eval',   labelKey: 'portfolio.sortOptions.eval',   emoji: '💰' },
  { key: 'profit', labelKey: 'portfolio.sortOptions.profit', emoji: '📈' },
  { key: 'rate',   labelKey: 'portfolio.sortOptions.rate',   emoji: '🎯' },
  { key: 'name',   labelKey: 'portfolio.sortOptions.name',   emoji: '🔤' },
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

// ── 종목별 묶기 ───────────────────────────────────
// 여러 계좌에 흩어진 같은 종목을 한 카드로 합산해서 보기 (표시 전용 — DB 행은 그대로)
const GROUP_STORAGE_KEY = 'firepath-portfolio-group-ticker'
const groupByTicker = ref(localStorage.getItem(GROUP_STORAGE_KEY) === 'true')
const toggleGroupByTicker = () => {
  groupByTicker.value = !groupByTicker.value
  localStorage.setItem(GROUP_STORAGE_KEY, String(groupByTicker.value))
  // 종목별은 계좌 구분을 무시하고 합치는 모드라, 켜질 때 계좌 필터를 전체로 되돌린다
  if (groupByTicker.value) selectedAccount.value = null
  swipedId.value = null
  flippedId.value = null
}

// 같은 티커끼리 수량·평가금액·원가·손익 합산. 평균단가는 수량 가중 평균(종목 통화 기준).
// 한 계좌뿐인 종목은 원본 행을 그대로 반환해 스와이프 수정/삭제가 계속 동작한다.
const mergeByTicker = (list: PortfolioViewItem[]): PortfolioViewItem[] => {
  const map = new Map<string, PortfolioViewItem>()
  for (const p of list) {
    const existing = map.get(p.ticker)
    if (!existing) {
      map.set(p.ticker, { ...p, groupCount: 1 })
      continue
    }
    const totalQty = existing.quantity + p.quantity
    if (totalQty > 0) {
      existing.avg_price = (existing.avg_price * existing.quantity + p.avg_price * p.quantity) / totalQty
    }
    existing.quantity = totalQty
    existing.evaluationAmount = (existing.evaluationAmount ?? 0) + (p.evaluationAmount ?? 0)
    existing.evaluationAmountBase = (existing.evaluationAmountBase ?? 0) + (p.evaluationAmountBase ?? 0)
    existing.costBase = (existing.costBase ?? 0) + (p.costBase ?? 0)
    existing.profitAmountBase = (existing.profitAmountBase ?? 0) + (p.profitAmountBase ?? 0)
    existing.profitRate = (existing.costBase ?? 0) > 0
      ? ((existing.profitAmountBase ?? 0) / (existing.costBase ?? 1)) * 100
      : existing.profitRate
    existing.isPriceFallback = existing.isPriceFallback || p.isPriceFallback
    existing.groupCount = (existing.groupCount ?? 1) + 1
  }
  // 합쳐진 카드는 원본 행 id와 겹치지 않는 가상 id 부여 (스와이프/플립 키용)
  return [...map.values()].map((p) => ((p.groupCount ?? 1) > 1 ? { ...p, id: `group:${p.ticker}` } : p))
}

const sortedPortfolios = computed(() => {
  let base: PortfolioViewItem[] = selectedAccount.value
    ? portfolios.value.filter((p) => (p.account_name ?? '미지정') === selectedAccount.value)
    : portfolios.value
  if (groupByTicker.value) base = mergeByTicker(base)
  if (sortKey.value === 'custom') return base
  const list = [...base]
  switch (sortKey.value) {
    case 'eval':   return list.sort((a, b) => (b.evaluationAmountBase ?? 0) - (a.evaluationAmountBase ?? 0))
    case 'profit': return list.sort((a, b) => (b.profitAmountBase ?? 0) - (a.profitAmountBase ?? 0))
    case 'rate':   return list.sort((a, b) => (b.profitRate ?? 0) - (a.profitRate ?? 0))
    case 'name': {
      return list.sort((a, b) => getTickerDisplayName(a.ticker).localeCompare(getTickerDisplayName(b.ticker), 'ko'))
    }
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
    <div class="asset-header d-flex justify-space-between align-center mb-3">
      <div class="d-flex align-center ga-2" style="min-width: 0">
        <img src="/icons/icon-asset.png" class="header-icon" :alt="$t('portfolio.headerAlt')" />
        <div class="font-weight-bold header-title" style="color: rgb(var(--v-theme-on-surface))">
          {{ $t('portfolio.title') }}
        </div>
      </div>
      <div class="d-flex ga-2 align-center" style="flex-shrink: 0">
        <v-chip v-if="isSavingOrder" size="small" color="primary" variant="tonal">
          {{ $t('portfolio.savingOrder') }}
        </v-chip>
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          rounded="lg"
          elevation="0"
          @click="closeSwipe(); dialog = true"
        >
          {{ $t('portfolio.addAsset') }}
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
        <div class="font-weight-medium text-medium-emphasis">{{ $t('portfolio.emptyTitle') }}</div>
        <div class="text-disabled mt-1">{{ $t('portfolio.emptyHint') }}</div>
        <v-btn
          color="primary"
          variant="tonal"
          rounded="lg"
          class="mt-6"
          prepend-icon="mdi-plus"
          @click="closeSwipe(); dialog = true"
        >
          {{ $t('portfolio.addAsset') }}
        </v-btn>
      </div>
    </template>

    <template v-else>
      <!-- 총 요약 카드 -->
      <div class="glass-card pa-4 mb-4" style="position: relative">
        <div class="summary-grid">
          <div class="summary-row" :class="{ 'summary-row--stacked': summaryStacked }">
            <span class="text-medium-emphasis">{{ $t('portfolio.cost') }}</span>
            <span class="font-weight-medium">{{ formatSummaryKrw(totalCostBase) }}</span>
          </div>
          <div class="summary-row" :class="{ 'summary-row--stacked': summaryStacked }">
            <span class="text-medium-emphasis">{{ $t('portfolio.profit') }}</span>
            <span
              class="font-weight-medium"
              :class="totalProfitAmountBase >= 0 ? 'text-success' : 'text-error'"
            >{{ formatSummaryProfit(totalProfitAmountBase) }}</span>
          </div>
          <div class="summary-row" :class="{ 'summary-row--stacked': summaryStacked }">
            <span class="text-medium-emphasis">{{ $t('portfolio.evalAmount') }}</span>
            <span class="font-weight-medium">{{ formatSummaryKrw(totalEvaluationAmountBase) }}</span>
          </div>
          <div class="summary-row" :class="{ 'summary-row--stacked': summaryStacked }">
            <span class="text-medium-emphasis">{{ $t('portfolio.returnRate') }}</span>
            <span
              class="font-weight-medium"
              :class="totalProfitRate >= 0 ? 'text-success' : 'text-error'"
              >{{ formatPercent(totalProfitRate) }}</span
            >
          </div>
        </div>

        <!-- 측정 전용 사본 — 화면에 안 보임, 실제로 넘치는지 측정만 함 -->
        <div ref="summaryMeasureRef" class="summary-grid summary-grid--measure" aria-hidden="true">
          <div class="summary-row summary-row--measure">
            <span>{{ $t('portfolio.cost') }}</span><span>{{ formatSummaryKrw(totalCostBase) }}</span>
          </div>
          <div class="summary-row summary-row--measure">
            <span>{{ $t('portfolio.profit') }}</span><span>{{ formatSummaryProfit(totalProfitAmountBase) }}</span>
          </div>
          <div class="summary-row summary-row--measure">
            <span>{{ $t('portfolio.evalAmount') }}</span><span>{{ formatSummaryKrw(totalEvaluationAmountBase) }}</span>
          </div>
          <div class="summary-row summary-row--measure">
            <span>{{ $t('portfolio.returnRate') }}</span><span>{{ formatPercent(totalProfitRate) }}</span>
          </div>
        </div>
      </div>

      <!-- 계좌 필터 + 종목별 묶기 (한 줄 고정: 계좌가 많으면 칩 영역만 가로 스크롤) -->
      <div v-if="accountOptions.length > 0" class="account-filter-row mb-2">
        <button
          class="account-chip group-chip"
          :class="{ 'account-chip-active': groupByTicker }"
          @click="toggleGroupByTicker"
        >
          <v-icon size="12">mdi-layers-outline</v-icon>{{ $t('portfolio.groupByTicker') }}
        </button>
        <!-- 종목별 모드에서는 계좌 필터가 무의미하므로 숨김 (종목별 토글만 남김) -->
        <template v-if="!groupByTicker">
          <div class="chip-divider" />
          <div class="account-chip-scroll">
            <button
              class="account-chip"
              :class="{ 'account-chip-active': selectedAccount === null }"
              @click="selectedAccount = null"
            >{{ $t('portfolio.filterAll') }}</button>
            <button
              v-for="acc in accountOptions"
              :key="acc"
              class="account-chip"
              :class="{ 'account-chip-active': selectedAccount === acc }"
              @click="selectedAccount = acc"
            >{{ displayAccountName(acc) }}</button>
          </div>
        </template>
      </div>

      <!-- 정렬 바 -->
      <div class="d-flex justify-space-between align-center mb-1">
        <div class="d-flex align-center ga-1">
          <span style="font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.4)">
            {{ $t('portfolio.totalCount', { n: sortedPortfolios.length }) }}
          </span>
          <v-menu location="bottom start">
            <template #activator="{ props }">
              <v-icon v-bind="props" size="13" style="color: rgba(var(--v-theme-on-surface), 0.35)"
                >mdi-information-outline</v-icon
              >
            </template>
            <div class="glass-card pa-3" style="max-width: 240px">
              <div class="font-weight-medium mb-2">{{ $t('portfolio.priceInfoTitle') }}</div>
              <div
                v-for="info in PRICE_DELAY_INFO"
                :key="info.labelKey"
                class="d-flex align-center justify-space-between mb-1"
                style="font-size: 0.6875rem"
              >
                <span>{{ info.emoji }} {{ $t(info.labelKey) }}</span>
                <span class="text-disabled ml-2">{{ $t(info.descKey) }}</span>
              </div>
              <div
                class="d-flex align-center ga-1 mt-2 pt-2"
                style="font-size: 0.6875rem; color: rgb(var(--v-theme-primary)); cursor: pointer; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08)"
                @click="goToTickerNameRequest"
              >
                <v-icon size="12" color="primary">mdi-pencil-plus-outline</v-icon>
                <span>{{ $t('portfolio.registerTickerName') }}</span>
              </div>
            </div>
          </v-menu>
        </div>
        <div class="d-flex align-center ga-2">
          <span
            v-if="hasUSD && exchangeRate"
            style="font-size: 0.625rem; color: rgba(var(--v-theme-on-surface), 0.35)"
          >
            {{ $t('portfolio.appliedRate', { rate: Math.round(exchangeRate).toLocaleString() }) }}
          </span>
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <button v-bind="props" class="sort-btn" :class="{ 'sort-btn-active': sortKey !== 'custom' }">
                <v-icon size="12">mdi-sort</v-icon>
                <span>{{ sortKey === 'custom' ? $t('portfolio.sort') : $t(SORT_OPTIONS.find(o => o.key === sortKey)?.labelKey ?? 'portfolio.sort') }}</span>
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
                  <span style="margin-right: 6px">{{ opt.emoji }}</span>{{ $t(opt.labelKey) }}
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
          class="portfolio-card-wrap"
          :data-id="item.id"
          :style="draggingId === item.id ? { opacity: '0', pointerEvents: 'none' } : {}"
        >
          <!-- 스와이프 액션 (열림 상태에서만 렌더 — 플립 전환 중 뒤에 비치지 않도록) -->
          <div v-show="swipedId === item.id" class="swipe-actions">
            <button class="action-btn action-edit" @click.stop="openEditDialog(item)">
              <v-icon size="18">mdi-pencil-outline</v-icon>
              <span>{{ $t('common.edit') }}</span>
            </button>
            <button class="action-btn action-delete" @click.stop="openDeleteDialog(item)">
              <v-icon size="18">mdi-delete-outline</v-icon>
              <span>{{ $t('common.delete') }}</span>
            </button>
          </div>

          <!-- 카드 본체 -->
          <div
            class="swipe-card"
            :style="swipedId === item.id ? `transform: translateX(-${ACTION_WIDTH}px)` : ''"
            @touchstart.passive="(e) => onSwipeTouchStart(e)"
            @touchend.passive="(e) => onSwipeTouchEnd(e, item.id, !isCashItem(item), (item.groupCount ?? 1) <= 1)"
            @mousedown="(e) => onSwipeMouseDown(e)"
            @mouseup="(e) => onSwipeMouseUp(e, item.id, !isCashItem(item), (item.groupCount ?? 1) <= 1)"
          >
          <!-- 플립 컨테이너: 앞뒤 face를 겹쳐 탭 시 3D 회전 -->
          <div class="flip-inner" :class="{ 'flip-inner--flipped': flippedId === item.id }">
            <!-- 앞면 -->
            <div class="flip-face flip-front">
            <div
              class="glass-card asset-card px-2 py-1"
              :class="isCashItem(item) ? 'border-cash-left' : (item.profitAmountBase ?? 0) >= 0 ? 'border-success-left' : 'border-error-left'"
            >
              <!-- 상단: 종목명 + 수익률 + 드래그 핸들 -->
              <div class="d-flex justify-space-between align-center mb-1" style="gap: 6px">
                <div class="d-flex align-center ga-2" style="min-width: 0; flex: 1">
                  <v-icon
                    v-if="sortKey === 'custom' && !groupByTicker"
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
                    :class="{ 'logo-bg-etf': (getAssetClass(item) === 'etf' || isEtfTicker(item.ticker)) && !logoMap[item.ticker], 'logo-bg-kr': item.currency === 'KRW' && !isCashItem(item) && !isEtfTicker(item.ticker), }"
                  >
                    <img
                      v-if="isCashItem(item) && item.ticker === 'CASH_USD'"
                      src="/icons/icon-dollar.png"
                      class="ticker-logo"
                      :alt="$t('ticker.cashUsd')"
                    />
                    <img
                      v-else-if="isCashItem(item)"
                      src="/icons/icon-won.png"
                      class="ticker-logo"
                      :alt="$t('ticker.cashKrw')"
                    />
                    <img
                      v-else-if="logoMap[item.ticker]"
                      :src="logoMap[item.ticker]!"
                      class="ticker-logo"
                      :alt="item.ticker"
                    />
                    <span
                      v-else-if="getAssetClass(item) === 'etf' || isEtfTicker(item.ticker)"
                      class="logo-text logo-text-etf"
                      >E</span
                    >
                    <span
                      v-else-if="item.currency === 'KRW' && !isCashItem(item)"
                      class="logo-text logo-text-kr"
                      >{{ $t('portfolio.krBadge') }}</span
                    >
                    <v-icon v-else size="20" :color="assetColor(item)"
                      >mdi-chart-line</v-icon
                    >
                  </div>
                  <div style="min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 4px">
                    <template v-if="isCashItem(item)">
                      <span class="ticker-name">{{
                        getTickerLabel(item.ticker).name
                      }}</span>
                      <span v-if="(item.groupCount ?? 1) > 1" class="account-tag ml-1">{{ $t('portfolio.accountsBadge', { n: item.groupCount }) }}</span>
                      <span v-else-if="item.account_name && item.account_name !== '미지정'" class="account-tag ml-1">{{ truncateAccount(item.account_name) }}</span>
                    </template>
                    <template v-else-if="getTickerLabel(item.ticker).showTicker">
                      <span class="ticker-name">{{
                        getTickerLabel(item.ticker).name
                      }}</span>
                      <span v-if="item.currency === 'USD'" class="ticker-sub ml-1">{{ item.ticker }}</span>
                      <span v-if="(item.groupCount ?? 1) > 1" class="account-tag ml-1">{{ $t('portfolio.accountsBadge', { n: item.groupCount }) }}</span>
                      <span v-else-if="item.account_name && item.account_name !== '미지정'" class="account-tag ml-1">{{ truncateAccount(item.account_name) }}</span>
                    </template>
                    <template v-else>
                      <span class="ticker-name">{{ item.ticker }}</span>
                      <span v-if="(item.groupCount ?? 1) > 1" class="account-tag ml-1">{{ $t('portfolio.accountsBadge', { n: item.groupCount }) }}</span>
                      <span v-else-if="item.account_name && item.account_name !== '미지정'" class="account-tag ml-1">{{ truncateAccount(item.account_name) }}</span>
                    </template>
                  </div>
                </div>
                <v-chip
                  v-if="!isCashItem(item)"
                  :color="(item.profitRate ?? 0) >= 0 ? 'success' : 'error'"
                  size="x-small"
                  variant="tonal"
                  style="flex-shrink: 0"
                >
                  {{ formatPercent(item.profitRate ?? 0) }}
                </v-chip>
              </div>

              <!-- 현금 카드 -->
              <template v-if="isCashItem(item)">
                <div class="card-amount text-primary mt-1">
                  <template v-if="displayCurrency === baseCurrency && item.currency !== baseCurrency">
                    {{ formatNative(item) }}
                    <span class="compact-sep ml-1">·</span>
                    <span class="compact-label ml-1">{{ displayEval(item.evaluationAmountBase ?? 0) }}</span>
                  </template>
                  <template v-else> {{ displayEval(item.evaluationAmountBase ?? 0) }} </template>
                </div>
              </template>

              <!-- 일반 자산 카드 -->
              <template v-else>
                <!-- 수량 · 평가금액 | 손익 한 줄 -->
                <div class="d-flex justify-space-between align-center mt-1" style="gap: 6px">
                  <div style="min-width: 0; overflow: hidden">
                    <span class="compact-label">{{ $t('portfolio.shares', { n: item.quantity }) }}</span>
                    <span class="compact-sep mx-1">·</span>
                    <span class="card-amount text-primary" style="white-space: nowrap">
                      {{ displayEval(item.evaluationAmountBase ?? 0) }}
                    </span>
                  </div>
                  <div
                    class="card-amount"
                    :class="(item.profitAmountBase ?? 0) >= 0 ? 'text-success' : 'text-error'"
                    style="flex-shrink: 0; white-space: nowrap"
                  >
                    {{ displayProfit(item.profitAmountBase ?? 0) }}
                  </div>
                </div>
              </template>
            </div>
            </div>
            <!-- 뒷면: 상세 정보 (현금 카드는 뒷면 없음). 앞면과 중복되는 종목명·수익률은 생략 -->
            <div v-if="!isCashItem(item)" class="flip-face flip-back">
              <div
                class="glass-card asset-card px-2 py-1 d-flex flex-column justify-center"
                :class="(item.profitAmountBase ?? 0) >= 0 ? 'border-success-left' : 'border-error-left'"
              >
                <!-- 상세 지표 2×2 그리드 -->
                <div class="flip-back-grid">
                  <div class="flip-metric">
                    <span class="flip-metric-label">{{ $t('portfolio.avgPrice') }}</span>
                    <span class="flip-metric-value">{{ nativePrice(item.avg_price, item.currency) }}</span>
                  </div>
                  <div class="flip-metric">
                    <span class="flip-metric-label">{{ $t('portfolio.dayChange') }}</span>
                    <span
                      class="flip-metric-value"
                      :class="item.changeRate == null ? '' : item.changeRate >= 0 ? 'text-success' : 'text-error'"
                    >{{ item.changeRate != null ? formatPercent(item.changeRate) : '—' }}</span>
                  </div>
                  <div class="flip-metric">
                    <span class="flip-metric-label">{{ $t('portfolio.currentPrice') }}</span>
                    <span class="flip-metric-value">{{ item.currentPrice != null ? nativePrice(item.currentPrice, item.currency) : '—' }}</span>
                  </div>
                  <div class="flip-metric">
                    <span class="flip-metric-label">{{ $t('portfolio.weight') }}</span>
                    <span class="flip-metric-value">{{ weightPercent(item).toFixed(1) }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </TransitionGroup>
      <p v-if="sortedPortfolios.length > 0" class="swipe-hint">
        {{ $t('portfolio.swipeHint') }}<br />{{ $t('portfolio.tapHint') }}
      </p>
    </template>
  </v-container>

  <PortfolioAddDialog v-model="dialog" :initial-account="selectedAccount ?? undefined" @saved="loadPortfolios" />
  <PortfolioAddDialog v-model="editDialog" :initial-data="selectedPortfolio" @saved="onSaved" />

  <v-dialog v-model="deleteDialog" max-width="320">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-6">{{ $t('portfolio.deleteTitle') }}</v-card-title>
      <v-card-text class="text-center text-medium-emphasis">
        <i18n-t keypath="portfolio.deleteConfirm" tag="span" scope="global">
          <template #name><strong>{{ selectedPortfolio ? getTickerDisplayName(selectedPortfolio.ticker) : '' }}</strong></template>
        </i18n-t><br />
        <span class="text-error">
          <template v-if="!selectedPortfolio || !isCashItem(selectedPortfolio)">{{ $t('portfolio.deleteCascade') }}<br /></template>{{ $t('portfolio.deleteIrreversible') }}
        </span>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn block variant="text" @click="deleteDialog = false">{{ $t('common.cancel') }}</v-btn>
        <v-btn block color="error" @click="deletePortfolio">{{ $t('common.delete') }}</v-btn>
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
  /* 공간이 부족하면 종목명이 먼저 …으로 잘리도록 (서브/계좌 태그보다 우선 축소) */
  flex-shrink: 1;
  /* 아주 긴 종목명은 이 상한에서 무조건 …으로 자름 (카드 밖 삐져나감 방지).
     "KODEX 미국나스닥100" 같은 일반 이름은 유지하고 "KODEX 200타겟위클리커버드콜"
     처럼 과하게 긴 이름만 잘리는 값. 더 좁은 화면에서는 flex-shrink로 더 줄어듦 */
  max-width: 8.5rem;
}

.card-amount {
  font-size: 0.8125rem;
  font-weight: 700;
}

.ticker-sub {
  font-size: 0.6875rem;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.45);
  /* 종목명이 잘리더라도 서브 티커는 안 줄고 안 접히게 */
  flex-shrink: 0;
  white-space: nowrap;
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
  /* 계좌 태그는 안 줄고 안 접히게 — 좁은 화면에서 글자가 2줄로 깨지던 문제 방지 */
  flex-shrink: 0;
  white-space: nowrap;
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
  margin-bottom: 0.2rem;
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
  align-items: center;
}
.account-chip-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex-wrap: nowrap;
  min-width: 0;
  /* 계좌가 많아도 한 줄 유지 — 칩 영역만 가로 스크롤 (스크롤바 숨김) */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.account-chip-scroll::-webkit-scrollbar {
  display: none;
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
  white-space: nowrap;
  flex-shrink: 0;
}
.group-chip {
  display: flex;
  align-items: center;
  gap: 3px;
}
.chip-divider {
  width: 1px;
  height: 14px;
  background: rgba(var(--v-theme-on-surface), 0.12);
  flex-shrink: 0;
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
/* 실제로 넘칠 것 같을 때(summaryStacked)만 4칸 전부 동시에 이 모양으로 전환 —
   칸마다 내용 길이에 따라 따로따로 줄바꿈되어 들쭉날쭉해지는 것을 방지 */
.summary-row--stacked {
  flex-direction: column;
  align-items: flex-start;
  white-space: normal;
  gap: 2px;
}

/* 측정 전용 사본 — 실제 화면에는 안 보이지만 레이아웃은 그대로 차지해서
   진짜 넘치는지(scrollWidth > clientWidth) 측정하는 데 사용 */
.summary-grid--measure {
  position: absolute;
  inset: 0;
  visibility: hidden;
  pointer-events: none;
  z-index: -1;
}
.summary-row--measure {
  white-space: nowrap;
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
  /* 3D 원근 — 자식 .flip-inner 회전에 적용. overflow:hidden은 이 요소(원근
     부모)에 있고 preserve-3d 요소 자신에는 없으므로 flat으로 강제되지 않음 */
  perspective: 1200px;
}

/* ── 카드 플립 (탭 시 위아래로 뒤집힘) ── */
.flip-inner {
  position: relative;
  /* 앞/뒷면 face를 같은 그리드 셀에 겹침 */
  display: grid;
  /* 앞뒤 높이를 고정으로 동일하게 맞춤. rem이라 폰트 스케일에 연동됨
     (16px 기준 64px) */
  height: 4rem;
  transform-style: preserve-3d;
  transition: transform 0.5s cubic-bezier(0.4, 0.2, 0.2, 1);
}
.flip-inner--flipped {
  transform: rotateX(180deg);
}
.flip-face {
  grid-area: 1 / 1; /* 두 face를 겹침 */
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
/* 앞뒤 카드 본체가 고정 높이를 꽉 채우도록 (뒷면 하단 비침 방지) */
.flip-face > .asset-card {
  height: 100%;
  box-sizing: border-box;
}
.flip-back {
  transform: rotateX(180deg);
}

.flip-back-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 12px;
  width: 100%;
}
.flip-metric {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.flip-metric-label {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  white-space: nowrap;
}
.flip-metric-value {
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
