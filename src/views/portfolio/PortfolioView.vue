<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import PortfolioAddDialog from './PortfolioAddDialog.vue'
import type { PortfolioForm, PortfolioAsset } from '@/types/portfolio'
import { showMessage } from '@/composables/useSnackbar'
import { getStockPrice, getExchangeRate } from '@/services/market'

const router = useRouter()
const loading = ref(false)

interface PortfolioViewItem extends PortfolioAsset {
  currentPrice?: number
  evaluationAmount?: number
  evaluationAmountKrw?: number
  profitAmount?: number
  profitAmountKrw?: number
  profitRate?: number
}

const portfolios = ref<PortfolioViewItem[]>([])
const exchangeRate = ref<number | null>(null)

const swipedId = ref<string | null>(null)
const touchStartX = ref(0)
const touchStartY = ref(0)
const SWIPE_THRESHOLD = 40
const ACTION_WIDTH = 128

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
      .order('created_at', { ascending: false })

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    const items = (data ?? []) as PortfolioAsset[]

    const [rate, ...prices] = await Promise.all([
      fetchExchangeRate(),
      ...items.map((item) => getStockPrice(item.ticker).catch(() => null)),
    ])

    portfolios.value = items.map((item, i) => {
      const currentPrice = prices[i] ?? null
      if (!currentPrice) return { ...item }

      const evaluationAmount = currentPrice * item.quantity
      const profitAmount = (currentPrice - item.avg_price) * item.quantity
      const evaluationAmountKrw =
        item.currency === 'USD' ? evaluationAmount * rate : evaluationAmount
      const profitAmountKrw = item.currency === 'USD' ? profitAmount * rate : profitAmount
      const profitRate =
        item.avg_price > 0 ? ((currentPrice - item.avg_price) / item.avg_price) * 100 : 0

      return {
        ...item,
        currentPrice,
        evaluationAmount,
        evaluationAmountKrw,
        profitAmount,
        profitAmountKrw,
        profitRate,
      }
    })
  } catch (error) {
    console.error(error)
    showMessage('보유자산 조회 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

const isDragging = ref(false)

const onDragStart = (clientX: number, clientY: number) => {
  touchStartX.value = clientX
  touchStartY.value = clientY
  isDragging.value = true
}

const onDragEnd = (clientX: number, clientY: number, id: string) => {
  if (!isDragging.value) return
  isDragging.value = false

  const dx = touchStartX.value - clientX
  const dy = Math.abs(touchStartY.value - clientY)
  if (dy > 10 && dy > Math.abs(dx)) return

  if (dx > SWIPE_THRESHOLD) {
    swipedId.value = id
  } else if (dx < -SWIPE_THRESHOLD / 2) {
    if (swipedId.value === id) swipedId.value = null
  }
}

const onTouchStart = (e: TouchEvent) => {
  onDragStart(e.touches[0]?.clientX ?? 0, e.touches[0]?.clientY ?? 0)
}
const onTouchEnd = (e: TouchEvent, id: string) => {
  onDragEnd(e.changedTouches[0]?.clientX ?? 0, e.changedTouches[0]?.clientY ?? 0, id)
}
const onMouseDown = (e: MouseEvent) => {
  onDragStart(e.clientX, e.clientY)
}
const onMouseUp = (e: MouseEvent, id: string) => {
  onDragEnd(e.clientX, e.clientY, id)
}
const closeSwipe = () => {
  swipedId.value = null
}

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

const formatKrw = (v: number) => Math.round(v).toLocaleString('ko-KR')
const formatPrice = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatPercent = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
const formatProfit = (v: number) => (v > 0 ? '+' : '') + formatKrw(v)
const assetTypeColor = (type: string): string =>
  ({ ETF: 'blue', 주식: 'purple', 채권: 'teal', 암호화폐: 'amber' })[type] ?? 'grey'

const onGlobalMouseUp = () => {
  isDragging.value = false
}

onMounted(() => {
  loadPortfolios()
  window.addEventListener('mouseup', onGlobalMouseUp)
})

onUnmounted(() => {
  window.removeEventListener('mouseup', onGlobalMouseUp)
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
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        rounded="lg"
        elevation="0"
        class="glass-btn-primary"
        @click="dialog = true"
      >
        자산 추가
      </v-btn>
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
        <v-divider style="border-color: rgba(255, 255, 255, 0.3)" class="mb-3" />
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

      <div class="text-caption text-disabled text-right mb-2 pr-1">← 밀어서 수정/삭제</div>

      <!-- 자산 카드 목록 -->
      <div
        v-for="item in portfolios"
        :key="item.id"
        class="swipe-wrap mb-2"
        @click="swipedId && swipedId !== item.id ? closeSwipe() : undefined"
      >
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

        <div
          class="swipe-card"
          :style="swipedId === item.id ? `transform: translateX(-${ACTION_WIDTH}px)` : ''"
          @touchstart.passive="onTouchStart"
          @touchend.passive="(e) => onTouchEnd(e, item.id)"
          @mousedown="onMouseDown"
          @mouseup="(e) => onMouseUp(e, item.id)"
        >
          <div
            class="glass-card asset-card pa-3"
            :class="(item.profitAmountKrw ?? 0) >= 0 ? 'border-success-left' : 'border-error-left'"
          >
            <div class="d-flex justify-space-between align-center mb-2">
              <div class="d-flex align-center ga-2">
                <span class="text-body-1 font-weight-bold">{{ item.ticker }}</span>
                <v-chip :color="assetTypeColor(item.asset_type)" size="x-small" variant="tonal">
                  {{ item.asset_type }}
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

            <div class="d-flex ga-4 mb-2">
              <div>
                <div class="text-caption text-medium-emphasis">수량</div>
                <div class="text-caption font-weight-bold">{{ item.quantity }}</div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">평균단가</div>
                <div class="text-caption font-weight-bold">
                  {{ formatPrice(item.avg_price) }} {{ item.currency }}
                </div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">현재가</div>
                <div class="text-caption font-weight-bold">
                  {{ formatPrice(item.currentPrice ?? 0) }} {{ item.currency }}
                </div>
              </div>
            </div>

            <v-divider style="border-color: rgba(255, 255, 255, 0.3)" class="mb-2" />

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
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 20px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.v-theme--dark .glass-card {
  background: rgba(17, 46, 45, 0.8);
  border-color: rgba(79, 200, 194, 0.18);
}

.glass-btn-primary {
  backdrop-filter: blur(8px);
}

.swipe-wrap {
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
</style>
