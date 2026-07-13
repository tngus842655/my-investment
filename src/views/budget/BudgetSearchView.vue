<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { formatBudgetAmount } from '@/utils/budgetMoney'
import type { BudgetType } from '@/types/budget'
import type { CurrencyCode } from '@/config/marketConfig'
import BudgetEntryAddDialog from './BudgetEntryAddDialog.vue'

interface EntryRow {
  id: string
  type: BudgetType
  category_id: string
  amount: number
  payment_method_id: string | null
  memo: string | null
  entry_date: string
  currency: CurrencyCode
  budget_categories: { name: string } | null
  budget_payment_methods: { name: string } | null
}

const router = useRouter()
const loading = ref(true)
const query = ref('')
const entries = ref<EntryRow[]>([])

const fetchEntries = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  loading.value = true
  const { data, error } = await supabase
    .from('budget_entries')
    .select('id, type, category_id, amount, currency, payment_method_id, memo, entry_date, budget_categories(name), budget_payment_methods(name)')
    .eq('user_id', user.id)
    .order('entry_date', { ascending: false })
    .limit(5000)
  loading.value = false
  if (error) {
    showMessage('내역을 불러오지 못했습니다.', 'error')
    return
  }
  entries.value = (data ?? []) as unknown as EntryRow[]
}

onMounted(fetchEntries)

const results = computed(() => {
  const q = (query.value ?? '').trim().toLowerCase()
  if (!q) return []
  return entries.value.filter((e) =>
    (e.memo ?? '').toLowerCase().includes(q) ||
    (e.budget_categories?.name ?? '').toLowerCase().includes(q) ||
    (e.budget_payment_methods?.name ?? '').toLowerCase().includes(q),
  )
})

const dialog = ref(false)
const editingEntry = ref<EntryRow | null>(null)

const openEditDialog = (e: EntryRow) => {
  editingEntry.value = e
  dialog.value = true
}

const dialogInitialData = computed(() =>
  editingEntry.value
    ? {
        id: editingEntry.value.id,
        type: editingEntry.value.type,
        category_id: editingEntry.value.category_id,
        amount: editingEntry.value.amount,
        payment_method_id: editingEntry.value.payment_method_id,
        memo: editingEntry.value.memo,
        entry_date: editingEntry.value.entry_date,
      }
    : null,
)

const onSaved = fetchEntries

// ── 삭제 ──────────────────────────
const deleteDialog = ref(false)
const entryToDelete = ref<EntryRow | null>(null)

const openDeleteDialog = (e: EntryRow) => {
  swipedId.value = null
  entryToDelete.value = e
  deleteDialog.value = true
}

const deleteEntry = async () => {
  if (!entryToDelete.value) return
  const { error } = await supabase.from('budget_entries').delete().eq('id', entryToDelete.value.id)
  if (error) {
    showMessage('삭제 중 오류가 발생했습니다.', 'error')
    return
  }
  deleteDialog.value = false
  entryToDelete.value = null
  showMessage('내역이 삭제되었습니다.', 'success')
  await fetchEntries()
}

// ── 스와이프 (자산관리 거래내역과 동일한 방식) ──────────────────────────
const swipedId = ref<string | null>(null)
const SWIPE_THRESHOLD = 40
const ACTION_WIDTH = 128
const swipeTouchStartX = ref(0)
const swipeTouchStartY = ref(0)
const isDraggingSwipe = ref(false)
const isVerticalScroll = ref(false)

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
const onContainerClick = (e: MouseEvent) => {
  if (!swipedId.value) return
  const swipedEl = document.querySelector(`.result-card-wrap[data-id="${swipedId.value}"]`)
  if (swipedEl?.contains(e.target as Node)) return
  closeSwipe()
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6" @click="onContainerClick">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div class="font-weight-bold">내역 검색</div>
    </div>

    <v-text-field
      v-model="query"
      placeholder="메모, 카테고리, 결제수단으로 검색"
      density="compact"
      variant="outlined"
      rounded="lg"
      prepend-inner-icon="mdi-magnify"
      clearable
      hide-details
      autofocus
      class="mb-4"
      @click:clear="query = ''"
    />

    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <div v-else-if="!(query ?? '').trim()" class="text-center text-medium-emphasis py-8">
      검색어를 입력해주세요.
    </div>

    <div v-else-if="results.length === 0" class="text-center text-medium-emphasis py-8">
      검색 결과가 없습니다.
    </div>

    <div v-else class="glass-card pa-3">
      <div
        v-for="e in results"
        :key="e.id"
        class="result-card-wrap"
        :data-id="e.id"
      >
        <div class="swipe-actions">
          <button class="action-btn action-edit" @click.stop="openEditDialog(e)">
            <v-icon size="18">mdi-pencil-outline</v-icon>
            <span>수정</span>
          </button>
          <button class="action-btn action-delete" @click.stop="openDeleteDialog(e)">
            <v-icon size="18">mdi-delete-outline</v-icon>
            <span>삭제</span>
          </button>
        </div>

        <div
          class="result-row swipe-card"
          :style="swipedId === e.id ? `transform: translateX(-${ACTION_WIDTH}px)` : ''"
          @touchstart.passive="onSwipeTouchStart"
          @touchmove.passive="onSwipeTouchMove"
          @touchend.passive="(ev) => onSwipeTouchEnd(ev, e.id)"
          @mousedown="onSwipeMouseDown"
          @mouseup="(ev) => onSwipeMouseUp(ev, e.id)"
        >
          <div class="result-info">
            <div class="result-title">{{ e.memo || e.budget_categories?.name || '' }}</div>
            <div class="result-sub">
              {{ e.entry_date }} · {{ e.budget_categories?.name }}
              <span v-if="e.budget_payment_methods?.name"> · {{ e.budget_payment_methods.name }}</span>
            </div>
          </div>
          <span :class="e.type === 'INCOME' ? 'income-color' : 'expense-color'">{{ formatBudgetAmount(e.amount, e.currency) }}</span>
        </div>
      </div>
      <p class="swipe-hint">← 항목을 왼쪽으로 밀면 수정/삭제할 수 있어요</p>
    </div>

    <BudgetEntryAddDialog v-model="dialog" :initial-data="dialogInitialData" @saved="onSaved" />

    <v-dialog v-model="deleteDialog" max-width="320">
      <v-card rounded="xl" class="glass-dialog">
        <v-card-title class="text-center pt-6">내역 삭제</v-card-title>
        <v-card-text class="text-center text-medium-emphasis">이 내역을 삭제하시겠습니까?</v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-btn block variant="text" @click="deleteDialog = false">취소</v-btn>
          <v-btn block color="error" @click="deleteEntry">삭제</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.back-btn {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.back-btn:active { opacity: 0.6; }

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 20px;
}

.income-color { color: rgb(var(--v-theme-primary)); }
.expense-color { color: rgb(var(--v-theme-error)); }

.result-card-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.result-card-wrap:first-child { border-top: none; }

.swipe-actions {
  position: absolute;
  right: 2px;
  top: 2px;
  bottom: 2px;
  width: 116px;
  display: flex;
}
.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: none;
  cursor: pointer;
  font-size: 0.625rem;
  font-weight: 600;
  color: #fff;
  transition: filter 0.15s;
}
.action-btn:active { filter: brightness(0.9); }
.action-edit {
  background: var(--fp-primary);
  border-radius: 10px 0 0 10px;
}
.action-delete {
  background: var(--fp-error);
  border-radius: 0 10px 10px 0;
}
.swipe-card {
  position: relative;
  z-index: 1;
  transition: transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: transform;
  background: rgb(var(--v-theme-surface));
}
.swipe-hint {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.35);
  text-align: center;
  margin: 8px 0 0;
}

.result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  cursor: pointer;
}
.result-info {
  flex: 1;
  min-width: 0;
}
.result-title {
  font-size: 0.8125rem;
  font-weight: 600;
}
.result-sub {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
</style>
