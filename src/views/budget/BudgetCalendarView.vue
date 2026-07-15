<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useI18n } from 'vue-i18n'
import { formatYearMonth } from '@/utils/dateFormat'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { loadRatesToBase, toBaseAmount, formatBudgetAmount, formatBudgetSumBare } from '@/utils/budgetMoney'
import type { BudgetType } from '@/types/budget'
import type { CurrencyCode } from '@/config/marketConfig'
import BudgetEntryAddDialog from './BudgetEntryAddDialog.vue'
import BudgetMonthYearCard from './BudgetMonthYearCard.vue'

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
const today = new Date()
const subTab = ref<'calendar' | 'daily' | 'monthly'>('calendar')

const year = ref(today.getFullYear())
const month = ref(today.getMonth() + 1) // 1~12
const monthlyYear = ref(today.getFullYear())

const loading = ref(true)
const entries = ref<EntryRow[]>([])
const yearEntries = ref<EntryRow[]>([])

// 집계는 행별 통화를 기준통화로 환산 후 합산, 단건은 기록된 통화 그대로 표시 (budgetMoney.ts)
const { t, tm, rt } = useI18n()
const { baseCurrency } = useBaseCurrency()
const rates = ref<Record<string, number>>({})
const toBase = (e: EntryRow) => toBaseAmount(e.amount, e.currency, baseCurrency.value, rates.value)
const fmtAmount = formatBudgetAmount
const fmtBase = (v: number) => formatBudgetAmount(v, baseCurrency.value)
const fmtBare = (v: number) => formatBudgetSumBare(v, baseCurrency.value)

const pad2 = (n: number) => String(n).padStart(2, '0')

const fetchMonthEntries = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  loading.value = true
  const start = `${year.value}-${pad2(month.value)}-01`
  const end = `${year.value}-${pad2(month.value)}-${pad2(new Date(year.value, month.value, 0).getDate())}`
  const { data, error } = await supabase
    .from('budget_entries')
    .select('id, type, category_id, amount, currency, payment_method_id, memo, entry_date, budget_categories(name), budget_payment_methods(name)')
    .eq('user_id', user.id)
    .gte('entry_date', start)
    .lte('entry_date', end)
    .order('entry_date')
  loading.value = false
  if (error) {
    showMessage(t('budget.calendar.loadFailed'), 'error')
    return
  }
  const rows = (data ?? []) as unknown as EntryRow[]
  rates.value = { ...rates.value, ...(await loadRatesToBase(rows.map((e) => e.currency), baseCurrency.value)) }
  entries.value = rows
}

const fetchYearEntries = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const start = `${monthlyYear.value}-01-01`
  const end = `${monthlyYear.value}-12-31`
  const { data, error } = await supabase
    .from('budget_entries')
    .select('id, type, category_id, amount, currency, payment_method_id, memo, entry_date, budget_categories(name), budget_payment_methods(name)')
    .eq('user_id', user.id)
    .gte('entry_date', start)
    .lte('entry_date', end)
  if (error) {
    showMessage(t('budget.calendar.loadFailed'), 'error')
    return
  }
  const rows = (data ?? []) as unknown as EntryRow[]
  rates.value = { ...rates.value, ...(await loadRatesToBase(rows.map((e) => e.currency), baseCurrency.value)) }
  yearEntries.value = rows
}

onMounted(async () => {
  await fetchMonthEntries()
  await fetchYearEntries()
})

watch([year, month], fetchMonthEntries)
watch(monthlyYear, fetchYearEntries)

const prevMonth = () => {
  if (month.value === 1) { month.value = 12; year.value -= 1 } else { month.value -= 1 }
  selectedDate.value = isCurrentMonth() ? pad2ForToday() : null
}
const nextMonth = () => {
  if (month.value === 12) { month.value = 1; year.value += 1 } else { month.value += 1 }
  selectedDate.value = isCurrentMonth() ? pad2ForToday() : null
}

// ── 요약 (수입/지출/합계) ──────────────────────────
const summarySource = computed(() => (subTab.value === 'monthly' ? yearEntries.value : entries.value))
const summaryIncome = computed(() =>
  summarySource.value.filter((e) => e.type === 'INCOME').reduce((s, e) => s + toBase(e), 0),
)
const summaryExpense = computed(() =>
  summarySource.value.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + toBase(e), 0),
)
const summaryTotal = computed(() => summaryIncome.value - summaryExpense.value)

// ── 캘린더 그리드 ──────────────────────────
interface CalendarCell {
  day: number
  inMonth: boolean
  dateStr: string
  income: number
  expense: number
}

const calendarWeeks = computed(() => {
  const startOffset = new Date(year.value, month.value - 1, 1).getDay()
  const totalDays = new Date(year.value, month.value, 0).getDate()
  const prevMonthDays = new Date(year.value, month.value - 1, 0).getDate()

  const cells: CalendarCell[] = []

  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: prevMonthDays - startOffset + 1 + i, inMonth: false, dateStr: '', income: 0, expense: 0 })
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year.value}-${pad2(month.value)}-${pad2(d)}`
    const dayEntries = entries.value.filter((e) => e.entry_date === dateStr)
    cells.push({
      day: d,
      inMonth: true,
      dateStr,
      income: dayEntries.filter((e) => e.type === 'INCOME').reduce((s, e) => s + toBase(e), 0),
      expense: dayEntries.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + toBase(e), 0),
    })
  }

  const remainder = cells.length % 7
  if (remainder !== 0) {
    for (let d = 1; d <= 7 - remainder; d++) {
      cells.push({ day: d, inMonth: false, dateStr: '', income: 0, expense: 0 })
    }
  }

  const weeks: CalendarCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
})

const pad2ForToday = () => `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
const isCurrentMonth = () => year.value === today.getFullYear() && month.value === today.getMonth() + 1
const selectedDate = ref<string | null>(isCurrentMonth() ? pad2ForToday() : null)

const dateMenuOpen = ref(false)
const monthIndex = computed<number>({
  get: () => month.value - 1,
  set: (v) => { month.value = v + 1 },
})
const syncSelectedDateForMonth = () => {
  selectedDate.value = isCurrentMonth() ? pad2ForToday() : null
}

const selectDate = (cell: CalendarCell) => {
  if (!cell.inMonth) return
  selectedDate.value = cell.dateStr
}

const selectedDateEntries = computed(() =>
  selectedDate.value ? entries.value.filter((e) => e.entry_date === selectedDate.value) : [],
)
const selectedDateIncome = computed(() =>
  selectedDateEntries.value.filter((e) => e.type === 'INCOME').reduce((s, e) => s + toBase(e), 0),
)
const selectedDateExpense = computed(() =>
  selectedDateEntries.value.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + toBase(e), 0),
)

// ── 일일 내역 ──────────────────────────
const dailyGroups = computed(() => {
  const map = new Map<string, EntryRow[]>()
  for (const e of entries.value) {
    if (!map.has(e.entry_date)) map.set(e.entry_date, [])
    map.get(e.entry_date)!.push(e)
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      income: list.filter((e) => e.type === 'INCOME').reduce((s, e) => s + toBase(e), 0),
      expense: list.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + toBase(e), 0),
      entries: list,
    }))
})

const weekdays = computed(() => (tm('date.weekdays') as unknown[]).map((w) => rt(w as string)))
const weekdayLabel = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`)
  return t('date.weekdayLabel', { weekday: weekdays.value[d.getDay()] })
}
const monthName = (m: number) => rt((tm('date.months') as unknown[])[m - 1] as string)

// ── 월별 요약 ──────────────────────────
const monthlyRows = computed(() => {
  const rows = []
  for (let m = 1; m <= 12; m++) {
    const list = yearEntries.value.filter((e) => Number(e.entry_date.slice(5, 7)) === m)
    rows.push({
      month: m,
      income: list.filter((e) => e.type === 'INCOME').reduce((s, e) => s + toBase(e), 0),
      expense: list.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + toBase(e), 0),
    })
  }
  return rows.reverse()
})

// ── 추가/수정 다이얼로그 ──────────────────────────
const dialog = ref(false)
const editingEntry = ref<EntryRow | null>(null)

const openAddDialog = () => {
  editingEntry.value = null
  dialog.value = true
}

const openEditDialog = (e: EntryRow) => {
  swipedId.value = null
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

const onSaved = async () => {
  await fetchMonthEntries()
  await fetchYearEntries()
}

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
    showMessage(t('budget.calendar.deleteFailed'), 'error')
    return
  }
  deleteDialog.value = false
  entryToDelete.value = null
  showMessage(t('budget.calendar.deleted'), 'success')
  await fetchMonthEntries()
  await fetchYearEntries()
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
  const swipedEl = document.querySelector(`.entry-card-wrap[data-id="${swipedId.value}"]`)
  if (swipedEl?.contains(e.target as Node)) return
  closeSwipe()
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6 pb-16" @click="onContainerClick">
    <div class="d-flex align-center justify-space-between mb-2">
      <div class="d-flex align-center ga-2">
        <img src="/icons/icon-calendar.png" class="header-icon" :alt="$t('hub.budget')" />
        <div class="font-weight-bold text-h6">{{ $t('hub.budget') }}</div>
      </div>
      <div class="d-flex align-center ga-1">
        <v-btn icon variant="text" size="small" to="/budget/search">
          <v-icon size="20">mdi-magnify</v-icon>
        </v-btn>
        <button class="icon-btn" @click="router.push('/hub')">
          <img src="/icons/icon-hub.png" :alt="$t('common.hub')" class="icon-btn-img" />
          <span class="icon-btn-label">{{ $t('common.hub') }}</span>
        </button>
      </div>
    </div>

    <!-- 월/연도 이동 -->
    <div class="d-flex align-center justify-space-between mb-3">
      <v-btn
        icon="mdi-chevron-left"
        variant="text"
        size="small"
        @click="subTab === 'monthly' ? monthlyYear -= 1 : prevMonth()"
      />
      <div v-if="subTab === 'monthly'" class="font-weight-bold">{{ $t('date.year', { year: monthlyYear }) }}</div>
      <v-menu v-else v-model="dateMenuOpen" :close-on-content-click="false" location="bottom center">
        <template #activator="{ props: menuProps }">
          <button v-bind="menuProps" class="font-weight-bold nav-year-month-btn">{{ formatYearMonth(year, month) }}</button>
        </template>
        <BudgetMonthYearCard
          v-model:year="year"
          v-model:month="monthIndex"
          @close="dateMenuOpen = false; syncSelectedDateForMonth()"
        />
      </v-menu>
      <v-btn
        icon="mdi-chevron-right"
        variant="text"
        size="small"
        @click="subTab === 'monthly' ? monthlyYear += 1 : nextMonth()"
      />
    </div>

    <v-btn-toggle v-model="subTab" mandatory rounded="lg" density="comfortable" class="mb-4 w-100">
      <v-btn value="calendar" variant="tonal" class="flex-grow-1">{{ $t('budget.nav.calendar') }}</v-btn>
      <v-btn value="daily" variant="tonal" class="flex-grow-1">{{ $t('budget.calendar.daily') }}</v-btn>
      <v-btn value="monthly" variant="tonal" class="flex-grow-1">{{ $t('budget.calendar.monthly') }}</v-btn>
    </v-btn-toggle>

    <!-- 요약 -->
    <div class="glass-card pa-2 mb-3 d-flex justify-space-around text-center">
      <div>
        <div class="summary-label">{{ $t('budget.common.income') }}</div>
        <div class="summary-value income-color">{{ fmtBare(summaryIncome) }}</div>
      </div>
      <div>
        <div class="summary-label">{{ $t('budget.common.expense') }}</div>
        <div class="summary-value expense-color">{{ fmtBare(summaryExpense) }}</div>
      </div>
      <div>
        <div class="summary-label">{{ $t('budget.common.total') }}</div>
        <div class="summary-value">{{ fmtBare(summaryTotal) }}</div>
      </div>
    </div>

    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <template v-else>
      <!-- 캘린더 -->
      <div v-if="subTab === 'calendar'" class="glass-card pa-3">
        <div class="calendar-weekday-row">
          <span v-for="(w, wi) in weekdays" :key="wi" class="calendar-weekday">{{ w }}</span>
        </div>
        <div v-for="(week, wi) in calendarWeeks" :key="wi" class="calendar-week-row">
          <button
            v-for="(cell, ci) in week"
            :key="ci"
            class="calendar-cell"
            :class="{ 'calendar-cell-dim': !cell.inMonth, 'calendar-cell-selected': cell.dateStr === selectedDate }"
            @click="selectDate(cell)"
          >
            <span class="calendar-day">{{ cell.day }}</span>
            <span v-if="cell.income > 0" class="calendar-amount income-color">{{ fmtBare(cell.income) }}</span>
            <span v-if="cell.expense > 0" class="calendar-amount expense-color">{{ fmtBare(cell.expense) }}</span>
          </button>
        </div>
      </div>

      <!-- 선택한 날짜 내역 -->
      <div v-if="subTab === 'calendar' && selectedDate" class="mt-3">
        <div class="d-flex align-center justify-space-between mb-2 px-1">
          <div class="font-weight-bold">
            {{ $t('date.dayOnly', { day: Number(selectedDate.slice(8, 10)) }) }}
            <span class="text-medium-emphasis" style="font-size: 0.75rem">{{ weekdayLabel(selectedDate) }}</span>
          </div>
          <div style="font-size: 0.8125rem">
            <span v-if="selectedDateIncome > 0" class="income-color mr-2">{{ fmtBase(selectedDateIncome) }}</span>
            <span v-if="selectedDateExpense > 0" class="expense-color">{{ fmtBase(selectedDateExpense) }}</span>
          </div>
        </div>

        <div v-if="selectedDateEntries.length === 0" class="glass-card pa-4 text-center text-medium-emphasis">
          {{ $t('budget.common.noEntries') }}
        </div>
        <div v-else class="glass-card pa-2">
          <div
            v-for="e in selectedDateEntries"
            :key="e.id"
            class="entry-card-wrap"
            :data-id="e.id"
          >
            <div class="swipe-actions">
              <button class="action-btn action-edit" @click.stop="openEditDialog(e)">
                <v-icon size="18">mdi-pencil-outline</v-icon>
                <span>{{ $t('common.edit') }}</span>
              </button>
              <button class="action-btn action-delete" @click.stop="openDeleteDialog(e)">
                <v-icon size="18">mdi-delete-outline</v-icon>
                <span>{{ $t('common.delete') }}</span>
              </button>
            </div>
            <div
              class="daily-entry-row swipe-card"
              :style="swipedId === e.id ? `transform: translateX(-${ACTION_WIDTH}px)` : ''"
              @touchstart.passive="onSwipeTouchStart"
              @touchmove.passive="onSwipeTouchMove"
              @touchend.passive="(ev) => onSwipeTouchEnd(ev, e.id)"
              @mousedown="onSwipeMouseDown"
              @mouseup="(ev) => onSwipeMouseUp(ev, e.id)"
            >
              <div class="daily-entry-category-tag">{{ e.budget_categories?.name }}</div>
              <div class="daily-entry-info">
                <div class="daily-entry-category">{{ e.memo || e.budget_payment_methods?.name || '' }}</div>
                <div v-if="e.memo" class="daily-entry-sub">{{ e.budget_payment_methods?.name }}</div>
              </div>
              <span :class="e.type === 'INCOME' ? 'income-color' : 'expense-color'">{{ fmtAmount(e.amount, e.currency) }}</span>
            </div>
          </div>
        </div>
        <p v-if="selectedDateEntries.length > 0" class="swipe-hint">{{ $t('budget.calendar.swipeHint') }}</p>
      </div>

      <!-- 일일 -->
      <div v-else-if="subTab === 'daily'">
        <div v-if="dailyGroups.length === 0" class="text-center text-medium-emphasis py-8">
          {{ $t('budget.calendar.noEntriesMonth') }}
        </div>
        <div v-for="group in dailyGroups" :key="group.date" class="glass-card pa-2 mb-2">
          <div class="d-flex align-center justify-space-between mb-1">
            <div class="font-weight-bold">
              {{ $t('date.dayOnly', { day: Number(group.date.slice(8, 10)) }) }}
              <span class="text-medium-emphasis" style="font-size: 0.75rem">{{ weekdayLabel(group.date) }}</span>
            </div>
            <div style="font-size: 0.8125rem">
              <span v-if="group.income > 0" class="income-color mr-2">{{ fmtBase(group.income) }}</span>
              <span v-if="group.expense > 0" class="expense-color">{{ fmtBase(group.expense) }}</span>
            </div>
          </div>
          <div
            v-for="e in group.entries"
            :key="e.id"
            class="entry-card-wrap"
            :data-id="e.id"
          >
            <!-- 스와이프 액션 -->
            <div class="swipe-actions">
              <button class="action-btn action-edit" @click.stop="openEditDialog(e)">
                <v-icon size="18">mdi-pencil-outline</v-icon>
                <span>{{ $t('common.edit') }}</span>
              </button>
              <button class="action-btn action-delete" @click.stop="openDeleteDialog(e)">
                <v-icon size="18">mdi-delete-outline</v-icon>
                <span>{{ $t('common.delete') }}</span>
              </button>
            </div>

            <div
              class="daily-entry-row swipe-card"
              :style="swipedId === e.id ? `transform: translateX(-${ACTION_WIDTH}px)` : ''"
              @touchstart.passive="onSwipeTouchStart"
              @touchmove.passive="onSwipeTouchMove"
              @touchend.passive="(ev) => onSwipeTouchEnd(ev, e.id)"
              @mousedown="onSwipeMouseDown"
              @mouseup="(ev) => onSwipeMouseUp(ev, e.id)"
            >
              <div class="daily-entry-category-tag">{{ e.budget_categories?.name }}</div>
              <div class="daily-entry-info">
                <div class="daily-entry-category">{{ e.memo || e.budget_payment_methods?.name || '' }}</div>
                <div v-if="e.memo" class="daily-entry-sub">{{ e.budget_payment_methods?.name }}</div>
              </div>
              <span :class="e.type === 'INCOME' ? 'income-color' : 'expense-color'">{{ fmtAmount(e.amount, e.currency) }}</span>
            </div>
          </div>
        </div>
        <p class="swipe-hint">{{ $t('budget.calendar.swipeHint') }}</p>
      </div>

      <!-- 월별 -->
      <div v-else-if="subTab === 'monthly'" class="glass-card pa-3">
        <div v-for="row in monthlyRows" :key="row.month" class="monthly-row">
          <span class="font-weight-medium">{{ monthName(row.month) }}</span>
          <span class="income-color">{{ fmtBase(row.income) }}</span>
          <span class="expense-color">{{ fmtBase(row.expense) }}</span>
          <span class="font-weight-medium">{{ fmtBase(row.income - row.expense) }}</span>
        </div>
      </div>
    </template>

    <v-btn
      icon="mdi-plus"
      color="primary"
      size="large"
      class="fab-add"
      @click="openAddDialog"
    />

    <BudgetEntryAddDialog
      v-model="dialog"
      :initial-data="dialogInitialData"
      :default-date="selectedDate ?? undefined"
      @saved="onSaved"
    />

    <v-dialog v-model="deleteDialog" max-width="320">
      <v-card rounded="xl" class="glass-dialog">
        <v-card-title class="text-center pt-6">{{ $t('budget.calendar.deleteTitle') }}</v-card-title>
        <v-card-text class="text-center text-medium-emphasis">{{ $t('budget.calendar.deleteConfirm') }}</v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-btn block variant="text" @click="deleteDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn block color="error" @click="deleteEntry">{{ $t('common.delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.header-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.icon-btn {
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
  border: none;
  padding: 2px 14px 2px 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(109, 40, 217, 0.45);
  transition: opacity 0.15s ease, transform 0.1s ease;
}
.icon-btn:active { opacity: 0.85; transform: scale(0.97); }
.icon-btn-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
}
.icon-btn-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.nav-year-month-btn {
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  padding: 4px 8px;
}

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 20px;
}

.summary-label {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 2px;
}
.summary-value {
  font-weight: 700;
  font-size: 0.9375rem;
}

.income-color { color: rgb(var(--v-theme-primary)); }
.expense-color { color: rgb(var(--v-theme-error)); }

.calendar-weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}
.calendar-weekday {
  text-align: center;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-weight: 600;
}

.calendar-week-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.calendar-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  padding: 6px 2px;
  border: none;
  background: none;
  cursor: pointer;
  min-height: 52px;
  border-radius: 10px;
}
.calendar-cell:active { background: rgba(var(--v-theme-on-surface), 0.05); }
.calendar-cell-dim { opacity: 0.3; cursor: default; }
.calendar-cell-dim:active { background: none; }
.calendar-cell-selected { background: rgba(var(--v-theme-primary), 0.12); }

.calendar-day {
  font-size: 0.75rem;
  font-weight: 600;
}
.calendar-amount {
  font-size: 0.5625rem;
  font-weight: 600;
  line-height: 1.2;
}

.entry-card-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.entry-card-wrap:first-child {
  border-top: none;
}
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

.daily-entry-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  cursor: pointer;
}
.daily-entry-category-tag {
  flex: 0 0 65px;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
  text-align: left;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.daily-entry-info {
  flex: 1;
  min-width: 0;
}
.daily-entry-category {
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
}
.daily-entry-sub {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
  line-height: 1.2;
}

.monthly-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 4px;
  padding: 10px 4px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.05);
  font-size: 0.8125rem;
  text-align: right;
}
.monthly-row:first-child { border-top: none; }
.monthly-row > :first-child { text-align: left; }

.fab-add {
  position: fixed;
  right: 20px;
  bottom: calc(96px + env(safe-area-inset-bottom));
  z-index: 50;
  transform: scale(0.8);
  transform-origin: bottom right;
}
</style>
