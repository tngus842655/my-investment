<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import type { BudgetCategory, BudgetPaymentMethod, BudgetType } from '@/types/budget'
import { DEFAULT_BUDGET_PAYMENT_METHODS } from '@/utils/budgetDefaultPaymentMethods'

const dialog = defineModel<boolean>()

const props = defineProps<{
  initialData?: {
    id: string
    type: BudgetType
    category_id: string
    amount: number
    payment_method_id: string | null
    memo: string | null
    entry_date: string
  } | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const isEditMode = computed(() => !!props.initialData)

const entryType = ref<BudgetType>('EXPENSE')
const categories = ref<BudgetCategory[]>([])
const categoryId = ref<string | null>(null)
const amount = ref('')
const paymentMethods = ref<BudgetPaymentMethod[]>([])
const paymentMethodId = ref<string | null>(null)
const addingPaymentMethod = ref(false)
const newPaymentMethodName = ref('')
const memo = ref('')
const entryDate = ref(new Date().toISOString().slice(0, 10))
const saveAsFavorite = ref(false)
const saving = ref(false)

interface QuickItem {
  category_id: string
  type: BudgetType
  amount: number
  payment_method_id: string | null
  memo: string | null
}
const favorites = ref<QuickItem[]>([])
const recentItems = ref<QuickItem[]>([])

const categoryOptions = computed(() =>
  categories.value
    .filter((c) => c.type === entryType.value)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ title: `${c.icon} ${c.name}`, value: c.id })),
)

const addComma = (v: string) => {
  const num = v.replace(/[^0-9]/g, '')
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
const removeComma = (v: string) => Number(v.replace(/,/g, '')) || 0
const handleAmount = (v: string) => {
  amount.value = addComma(v)
}
const formatAmount = (v: number) => `${addComma(String(v))}원`

const canSave = computed(() => !!categoryId.value && removeComma(amount.value) > 0)

const categoryName = (id: string) => {
  const c = categories.value.find((c) => c.id === id)
  return c ? `${c.icon} ${c.name}` : ''
}

const fetchCategories = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')
  categories.value = data ?? []
}

const fetchPaymentMethods = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data } = await supabase
    .from('budget_payment_methods')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  if ((data ?? []).length === 0) {
    const rows = DEFAULT_BUDGET_PAYMENT_METHODS.map((name, i) => ({ user_id: user.id, name, sort_order: i }))
    const { error: seedError } = await supabase.from('budget_payment_methods').insert(rows)
    if (seedError) return
    const { data: seeded } = await supabase
      .from('budget_payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order')
    paymentMethods.value = seeded ?? []
    return
  }

  paymentMethods.value = data ?? []
}

const addPaymentMethod = async () => {
  const name = newPaymentMethodName.value.trim()
  if (!name) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data, error } = await supabase
    .from('budget_payment_methods')
    .insert({ user_id: user.id, name, sort_order: paymentMethods.value.length })
    .select()
    .single()
  if (error) {
    showMessage('결제수단 추가에 실패했습니다.', 'error')
    return
  }
  paymentMethods.value.push(data)
  paymentMethodId.value = data.id
  addingPaymentMethod.value = false
  newPaymentMethodName.value = ''
}

const fetchQuickItems = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: favData } = await supabase
    .from('budget_favorites')
    .select('category_id, type, amount, payment_method_id, memo')
    .eq('user_id', user.id)
    .order('sort_order')
  favorites.value = favData ?? []

  const { data: entryData } = await supabase
    .from('budget_entries')
    .select('category_id, type, amount, payment_method_id, memo')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  const seen = new Set<string>()
  const recents: QuickItem[] = []
  for (const e of entryData ?? []) {
    const key = `${e.category_id}-${e.amount}-${e.memo ?? ''}-${e.payment_method_id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    recents.push(e)
    if (recents.length >= 6) break
  }
  recentItems.value = recents
}

const applyQuickItem = (item: QuickItem) => {
  entryType.value = item.type
  categoryId.value = item.category_id
  amount.value = addComma(String(item.amount))
  paymentMethodId.value = item.payment_method_id
  memo.value = item.memo ?? ''
}

const reset = () => {
  dialog.value = false
}

watch(dialog, async (open) => {
  if (!open) return
  await fetchCategories()
  await fetchPaymentMethods()
  await fetchQuickItems()
  addingPaymentMethod.value = false
  newPaymentMethodName.value = ''

  if (props.initialData) {
    entryType.value = props.initialData.type
    categoryId.value = props.initialData.category_id
    amount.value = addComma(String(props.initialData.amount))
    paymentMethodId.value = props.initialData.payment_method_id
    memo.value = props.initialData.memo ?? ''
    entryDate.value = props.initialData.entry_date
  } else {
    entryType.value = 'EXPENSE'
    categoryId.value = null
    amount.value = ''
    paymentMethodId.value = null
    memo.value = ''
    entryDate.value = new Date().toISOString().slice(0, 10)
  }
  saveAsFavorite.value = false
})

// 수입/지출 전환 시 카테고리 목록이 바뀌므로, 새 목록에 없는 선택은 초기화
watch(entryType, () => {
  if (!categoryOptions.value.some((c) => c.value === categoryId.value)) {
    categoryId.value = null
  }
})

const save = async () => {
  if (!canSave.value || !categoryId.value) return
  saving.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      category_id: categoryId.value,
      type: entryType.value,
      amount: removeComma(amount.value),
      payment_method_id: paymentMethodId.value,
      memo: memo.value.trim() || null,
      entry_date: entryDate.value,
    }

    if (isEditMode.value && props.initialData) {
      const { error } = await supabase.from('budget_entries').update(payload).eq('id', props.initialData.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('budget_entries').insert(payload)
      if (error) throw error
    }

    if (saveAsFavorite.value) {
      const { error: favError } = await supabase.from('budget_favorites').insert({
        user_id: user.id,
        category_id: categoryId.value,
        type: entryType.value,
        amount: removeComma(amount.value),
        payment_method_id: paymentMethodId.value,
        memo: memo.value.trim() || null,
        sort_order: 0,
      })
      if (favError) throw favError
    }

    showMessage(isEditMode.value ? '내역이 수정되었습니다.' : '내역이 등록되었습니다.', 'success')
    emit('saved')
    reset()
  } catch {
    showMessage('저장 중 오류가 발생했습니다.', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="480">
    <v-card rounded="xl" class="glass-dialog" style="overflow: hidden; display: flex; flex-direction: column; max-height: 90dvh">
      <div class="dialog-header" :class="entryType === 'EXPENSE' ? 'header-sell' : 'header-buy'">
        <div class="font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">{{ isEditMode ? '내역 수정' : '내역 추가' }}</div>
        <div class="type-toggle mt-3">
          <button
            class="toggle-btn"
            :class="{ 'toggle-active-sell': entryType === 'EXPENSE' }"
            @click="entryType = 'EXPENSE'"
          >지출</button>
          <button
            class="toggle-btn"
            :class="{ 'toggle-active-buy': entryType === 'INCOME' }"
            @click="entryType = 'INCOME'"
          >수입</button>
        </div>
      </div>

      <v-card-text class="pt-2 pb-1" style="overflow-y: auto; flex: 1">
        <div v-if="!isEditMode && (favorites.length > 0 || recentItems.length > 0)" class="mb-3">
          <div v-if="favorites.length > 0" class="quick-row mb-2">
            <span class="quick-label">⭐ 즐겨찾기</span>
            <div class="quick-chip-wrap">
              <button
                v-for="(f, i) in favorites"
                :key="'fav-' + i"
                class="quick-chip"
                @click="applyQuickItem(f)"
              >{{ categoryName(f.category_id) }} {{ formatAmount(f.amount) }}</button>
            </div>
          </div>
          <div v-if="recentItems.length > 0" class="quick-row">
            <span class="quick-label">최근</span>
            <div class="quick-chip-wrap">
              <button
                v-for="(r, i) in recentItems"
                :key="'recent-' + i"
                class="quick-chip"
                @click="applyQuickItem(r)"
              >{{ categoryName(r.category_id) }} {{ formatAmount(r.amount) }}</button>
            </div>
          </div>
        </div>

        <v-select
          v-model="categoryId"
          :items="categoryOptions"
          label="카테고리"
          prepend-inner-icon="mdi-shape-outline"
          variant="outlined"
          density="compact"
          rounded="lg"
          no-data-text="카테고리가 없습니다. 카테고리 관리에서 먼저 추가해주세요"
          class="mb-1"
        />

        <v-text-field
          :model-value="amount"
          label="금액"
          inputmode="numeric"
          prepend-inner-icon="mdi-currency-krw"
          variant="outlined"
          density="compact"
          rounded="lg"
          class="mb-1"
          @update:model-value="handleAmount"
        />

        <div class="text-medium-emphasis mb-1" style="font-size: 0.75rem">결제수단</div>
        <div class="pm-chip-wrap mb-1">
          <button
            v-for="pm in paymentMethods"
            :key="pm.id"
            class="pm-chip"
            :class="{ 'pm-chip-selected': paymentMethodId === pm.id }"
            @click="paymentMethodId = paymentMethodId === pm.id ? null : pm.id"
          >{{ pm.name }}</button>
          <button class="pm-chip pm-chip-add" @click="addingPaymentMethod = !addingPaymentMethod">
            <v-icon size="14">mdi-plus</v-icon> 추가
          </button>
        </div>
        <v-expand-transition>
          <div v-if="addingPaymentMethod" class="d-flex ga-2 mb-1">
            <v-text-field
              v-model="newPaymentMethodName"
              label="새 결제수단"
              placeholder="예: 계좌이체"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details
              autofocus
              @keyup.enter="addPaymentMethod"
            />
            <v-btn icon="mdi-check" size="small" variant="tonal" color="primary" @click="addPaymentMethod" />
          </div>
        </v-expand-transition>

        <v-text-field
          v-model="memo"
          label="메모"
          prepend-inner-icon="mdi-note-outline"
          variant="outlined"
          density="compact"
          rounded="lg"
          class="mb-1"
        />

        <v-text-field
          v-model="entryDate"
          label="날짜"
          type="date"
          prepend-inner-icon="mdi-calendar-outline"
          variant="outlined"
          density="compact"
          rounded="lg"
          class="mb-1"
        />

        <v-checkbox
          v-model="saveAsFavorite"
          label="즐겨찾기로 저장"
          density="compact"
          hide-details
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-4 py-2">
        <v-btn variant="text" :disabled="saving" @click="reset">취소</v-btn>
        <v-spacer />
        <v-btn
          :color="entryType === 'EXPENSE' ? 'error' : 'primary'"
          :disabled="!canSave"
          :loading="saving"
          variant="flat"
          rounded="lg"
          @click="save"
        >{{ isEditMode ? '수정 저장' : '저장' }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-header {
  padding: 24px 24px 20px;
  transition: background 0.25s ease;
}
.header-buy {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.12) 0%, rgba(var(--v-theme-primary), 0.04) 100%);
  border-bottom: 1px solid rgba(var(--v-theme-primary), 0.15);
}
.header-sell {
  background: linear-gradient(135deg, rgba(var(--v-theme-error), 0.1) 0%, rgba(var(--v-theme-error), 0.03) 100%);
  border-bottom: 1px solid rgba(var(--v-theme-error), 0.15);
}

.type-toggle {
  display: flex;
  gap: 8px;
}
.toggle-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
  border-radius: 12px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.1);
  background: transparent;
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.45);
  cursor: pointer;
  transition: all 0.18s ease;
}
.toggle-active-buy {
  background: rgba(var(--v-theme-primary), 0.12);
  border-color: var(--fp-primary);
  color: var(--fp-primary);
}
.toggle-active-sell {
  background: rgba(var(--v-theme-error), 0.1);
  border-color: var(--fp-error);
  color: var(--fp-error);
}

.quick-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.quick-label {
  font-size: 0.6875rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.quick-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.quick-chip {
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  background: none;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: all 0.15s;
}
.quick-chip:active {
  opacity: 0.7;
}

.pm-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pm-chip {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  background: none;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: all 0.15s;
}
.pm-chip-selected {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}
.pm-chip-add {
  display: flex;
  align-items: center;
  gap: 2px;
  border-style: dashed;
}
</style>
