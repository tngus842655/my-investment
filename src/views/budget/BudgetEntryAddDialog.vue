<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import type { BudgetCategory, BudgetPaymentMethod, BudgetType } from '@/types/budget'
import { DEFAULT_BUDGET_PAYMENT_METHODS } from '@/utils/budgetDefaultPaymentMethods'
import BudgetFavoriteView from './BudgetFavoriteView.vue'
import BudgetDateCalendarCard from './BudgetDateCalendarCard.vue'

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
  defaultDate?: string
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
const saving = ref(false)
const favoritesMenu = ref(false)
const favoriteManageDialog = ref(false)
const dateMenu = ref(false)

interface QuickItem {
  category_id: string
  type: BudgetType
  amount: number
  payment_method_id: string | null
  memo: string | null
}
const favorites = ref<QuickItem[]>([])

const categoryOptions = computed(() =>
  categories.value
    .filter((c) => c.type === entryType.value)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ title: c.name, value: c.id })),
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

const MAX_AMOUNT = 10_000_000_000

const canSave = computed(() =>
  !!categoryId.value && removeComma(amount.value) > 0 && removeComma(amount.value) <= MAX_AMOUNT,
)

const amountRules = [
  (v: string) => removeComma(v) > 0 || '금액을 입력해주세요',
  (v: string) => removeComma(v) <= MAX_AMOUNT || '최대 100억원까지 입력 가능합니다',
]

const categoryName = (id: string) => {
  const c = categories.value.find((c) => c.id === id)
  return c ? c.name : ''
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

const fetchFavorites = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: favData } = await supabase
    .from('budget_favorites')
    .select('category_id, type, amount, payment_method_id, memo')
    .eq('user_id', user.id)
    .order('sort_order')
  favorites.value = favData ?? []
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
  await fetchFavorites()
  addingPaymentMethod.value = false
  newPaymentMethodName.value = ''
  favoritesMenu.value = false

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
    entryDate.value = props.defaultDate ?? new Date().toISOString().slice(0, 10)
  }
})

watch(favoriteManageDialog, async (open) => {
  if (open) return
  await fetchFavorites()
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
  <v-dialog v-model="dialog" max-width="480" transition="fade-transition">
    <v-card rounded="xl" class="glass-dialog" style="overflow: hidden; display: flex; flex-direction: column; max-height: 90dvh">
      <div class="dialog-header" :class="entryType === 'EXPENSE' ? 'header-sell' : 'header-buy'">
        <div class="d-flex align-center justify-space-between">
          <div class="font-weight-bold" style="color: rgb(var(--v-theme-on-surface))">{{ isEditMode ? '내역 수정' : '내역 추가' }}</div>
          <v-menu v-if="!isEditMode" v-model="favoritesMenu" :close-on-content-click="false">
            <template #activator="{ props: menuProps }">
              <v-btn v-bind="menuProps" icon="mdi-star-outline" variant="text" size="small" />
            </template>
            <v-card rounded="lg" class="favorites-menu-card">
              <div class="favorites-menu-title">즐겨찾기</div>
              <button
                v-for="(f, i) in favorites"
                :key="'fav-' + i"
                class="favorites-menu-item"
                @click="applyQuickItem(f); favoritesMenu = false"
              >
                <span>{{ categoryName(f.category_id) }}</span>
                <span class="text-medium-emphasis">{{ formatAmount(f.amount) }}</span>
              </button>
              <div v-if="favorites.length === 0" class="favorites-menu-empty">즐겨찾기가 없습니다.</div>
              <v-divider class="my-1" />
              <button
                class="favorites-menu-item favorites-menu-add"
                @click="favoritesMenu = false; favoriteManageDialog = true"
              >
                <v-icon size="16">mdi-plus</v-icon>
                <span>즐겨찾기 관리</span>
              </button>
            </v-card>
          </v-menu>
        </div>
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
        <v-menu v-model="dateMenu" :close-on-content-click="false">
          <template #activator="{ props: menuProps }">
            <v-text-field
              v-bind="menuProps"
              :model-value="entryDate"
              label="날짜"
              readonly
              autocomplete="off"
              prepend-inner-icon="mdi-calendar-outline"
              variant="outlined"
              density="compact"
              rounded="lg"
              class="mb-1"
              @focus="(e: FocusEvent) => (e.target as HTMLElement).blur()"
            />
          </template>
          <BudgetDateCalendarCard v-model="entryDate" :open="dateMenu" @close="dateMenu = false" />
        </v-menu>

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
          autocomplete="off"
        />

        <v-text-field
          :model-value="amount"
          label="금액"
          inputmode="numeric"
          autocomplete="off"
          prepend-inner-icon="mdi-currency-krw"
          variant="outlined"
          density="compact"
          rounded="lg"
          class="mb-1"
          :rules="amountRules"
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
              autocomplete="off"
              @keyup.enter="addPaymentMethod"
            />
            <v-btn icon="mdi-check" size="small" variant="tonal" color="primary" @click="addPaymentMethod" />
          </div>
        </v-expand-transition>

        <v-text-field
          v-model="memo"
          label="내용"
          prepend-inner-icon="mdi-note-outline"
          variant="outlined"
          density="compact"
          rounded="lg"
          class="mb-1 mt-4"
          maxlength="30"
          counter
          autocomplete="off"
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

    <v-dialog v-model="favoriteManageDialog" max-width="480">
      <v-card rounded="xl" class="pa-4">
        <div class="font-weight-bold mb-4">즐겨찾기 관리</div>
        <BudgetFavoriteView />
        <v-btn block variant="text" class="mt-4" @click="favoriteManageDialog = false">닫기</v-btn>
      </v-card>
    </v-dialog>
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

.favorites-menu-card {
  min-width: 220px;
  max-width: 280px;
  padding: 8px 0;
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
}
.favorites-menu-title {
  font-size: 0.6875rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.45);
  padding: 4px 14px 6px;
}
.favorites-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
}
.favorites-menu-item:active {
  background: rgba(var(--v-theme-on-surface), 0.05);
}
.favorites-menu-empty {
  padding: 4px 14px 8px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.favorites-menu-add {
  justify-content: flex-start;
  gap: 6px;
  color: rgb(var(--v-theme-primary));
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
