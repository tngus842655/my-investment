<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { formatCurrency } from '@/utils/numberFormat'
import type { BudgetType } from '@/types/budget'
import BudgetEntryAddDialog from './BudgetEntryAddDialog.vue'

interface EntryRow {
  id: string
  type: BudgetType
  category_id: string
  amount: number
  payment_method_id: string | null
  memo: string | null
  entry_date: string
  budget_categories: { name: string; icon: string } | null
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
    .select('id, type, category_id, amount, payment_method_id, memo, entry_date, budget_categories(name, icon), budget_payment_methods(name)')
    .eq('user_id', user.id)
    .order('entry_date', { ascending: false })
    .limit(500)
  loading.value = false
  if (error) {
    showMessage('내역을 불러오지 못했습니다.', 'error')
    return
  }
  entries.value = (data ?? []) as unknown as EntryRow[]
}

onMounted(fetchEntries)

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
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
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
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
    />

    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <div v-else-if="!query.trim()" class="text-center text-medium-emphasis py-8">
      검색어를 입력해주세요.
    </div>

    <div v-else-if="results.length === 0" class="text-center text-medium-emphasis py-8">
      검색 결과가 없습니다.
    </div>

    <div v-else class="glass-card pa-3">
      <div
        v-for="e in results"
        :key="e.id"
        class="result-row"
        @click="openEditDialog(e)"
      >
        <span class="result-icon">{{ e.budget_categories?.icon ?? '❓' }}</span>
        <div class="result-info">
          <div class="result-title">{{ e.memo || e.budget_categories?.name || '' }}</div>
          <div class="result-sub">
            {{ e.entry_date }} · {{ e.budget_categories?.name }}
            <span v-if="e.budget_payment_methods?.name"> · {{ e.budget_payment_methods.name }}</span>
          </div>
        </div>
        <span :class="e.type === 'INCOME' ? 'income-color' : 'expense-color'">{{ formatCurrency(e.amount) }}원</span>
      </div>
    </div>

    <BudgetEntryAddDialog v-model="dialog" :initial-data="dialogInitialData" @saved="onSaved" />
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

.result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.05);
  cursor: pointer;
}
.result-row:first-child { border-top: none; }
.result-icon {
  font-size: 1.25rem;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
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
