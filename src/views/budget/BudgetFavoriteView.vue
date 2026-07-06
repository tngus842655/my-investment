<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { formatCurrency } from '@/utils/numberFormat'
import type { BudgetCategory, BudgetPaymentMethod, BudgetType } from '@/types/budget'

interface FavoriteRow {
  id: string
  category_id: string
  type: BudgetType
  amount: number
  payment_method_id: string | null
  memo: string | null
  sort_order: number
}

const loading = ref(true)
const favorites = ref<FavoriteRow[]>([])
const categories = ref<BudgetCategory[]>([])
const paymentMethods = ref<BudgetPaymentMethod[]>([])

const categoryName = (id: string) => {
  const c = categories.value.find((c) => c.id === id)
  return c ? c.name : '(삭제된 카테고리)'
}
const paymentMethodName = (id: string | null) => paymentMethods.value.find((p) => p.id === id)?.name ?? null

const fetchAll = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const [favRes, catRes, pmRes] = await Promise.all([
    supabase.from('budget_favorites').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('budget_categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('budget_payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])

  if (favRes.error) {
    showMessage('즐겨찾기를 불러오지 못했습니다.', 'error')
    return
  }

  favorites.value = favRes.data ?? []
  categories.value = catRes.data ?? []
  paymentMethods.value = pmRes.data ?? []
}

onMounted(async () => {
  loading.value = true
  await fetchAll()
  loading.value = false
})

// ── 추가/수정 다이얼로그 ──────────────────────────
const dialog = ref(false)
const editingId = ref<string | null>(null)
const formType = ref<BudgetType>('EXPENSE')
const formCategoryId = ref<string | null>(null)
const formAmount = ref('')
const formPaymentMethodId = ref<string | null>(null)
const formMemo = ref('')
const saving = ref(false)

const isEditMode = computed(() => !!editingId.value)

const categoryOptions = computed(() =>
  categories.value
    .filter((c) => c.type === formType.value)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ title: c.name, value: c.id })),
)
const paymentMethodOptions = computed(() =>
  paymentMethods.value.map((p) => ({ title: p.name, value: p.id })),
)

const addComma = (v: string) => {
  const num = v.replace(/[^0-9]/g, '')
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
const removeComma = (v: string) => Number(v.replace(/,/g, '')) || 0
const handleAmount = (v: string) => { formAmount.value = addComma(v) }

const canSave = computed(() => !!formCategoryId.value && removeComma(formAmount.value) > 0)

const openAddDialog = () => {
  editingId.value = null
  formType.value = 'EXPENSE'
  formCategoryId.value = null
  formAmount.value = ''
  formPaymentMethodId.value = null
  formMemo.value = ''
  dialog.value = true
}

const openEditDialog = (f: FavoriteRow) => {
  editingId.value = f.id
  formType.value = f.type
  formCategoryId.value = f.category_id
  formAmount.value = addComma(String(f.amount))
  formPaymentMethodId.value = f.payment_method_id
  formMemo.value = f.memo ?? ''
  dialog.value = true
}

const closeDialog = () => {
  dialog.value = false
}

const saveFavorite = async () => {
  if (!canSave.value || !formCategoryId.value) return
  saving.value = true
  try {
    const payload = {
      category_id: formCategoryId.value,
      type: formType.value,
      amount: removeComma(formAmount.value),
      payment_method_id: formPaymentMethodId.value,
      memo: formMemo.value.trim() || null,
    }

    if (isEditMode.value) {
      const { error } = await supabase.from('budget_favorites').update(payload).eq('id', editingId.value)
      if (error) throw error
      showMessage('즐겨찾기가 수정되었습니다.', 'success')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from('budget_favorites').insert({
        user_id: user.id,
        sort_order: favorites.value.length,
        ...payload,
      })
      if (error) throw error
      showMessage('즐겨찾기가 추가되었습니다.', 'success')
    }
    dialog.value = false
    await fetchAll()
  } catch {
    showMessage('저장 중 오류가 발생했습니다.', 'error')
  } finally {
    saving.value = false
  }
}

const deleteFavorite = async (f: FavoriteRow) => {
  const { error } = await supabase.from('budget_favorites').delete().eq('id', f.id)
  if (error) {
    showMessage('삭제 중 오류가 발생했습니다.', 'error')
    return
  }
  showMessage('즐겨찾기가 삭제되었습니다.', 'success')
  await fetchAll()
}

// 수입/지출 전환 시 카테고리 목록이 바뀌므로, 새 목록에 없는 선택은 초기화
const onFormTypeChange = (type: BudgetType) => {
  formType.value = type
  if (!categoryOptions.value.some((c) => c.value === formCategoryId.value)) {
    formCategoryId.value = null
  }
}
</script>

<template>
  <div class="manage-tab">
    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <div v-else class="glass-card pa-4 list-wrap">
      <div class="list-scroll">
        <div v-for="f in favorites" :key="f.id" class="row-item">
          <div class="favorite-info">
            <div class="row-name">{{ categoryName(f.category_id) }}<span v-if="f.memo"> · {{ f.memo }}</span></div>
            <div class="favorite-sub">
              <span :class="f.type === 'INCOME' ? 'income-color' : 'expense-color'">{{ formatCurrency(f.amount) }}원</span>
              <span v-if="paymentMethodName(f.payment_method_id)"> · {{ paymentMethodName(f.payment_method_id) }}</span>
            </div>
          </div>
          <v-btn icon="mdi-pencil-outline" size="small" variant="text" class="action-btn" @click="openEditDialog(f)" />
          <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" class="action-btn" @click="deleteFavorite(f)" />
        </div>
        <div v-if="favorites.length === 0" class="text-center text-medium-emphasis py-4">
          즐겨찾기가 없습니다.
        </div>
      </div>
    </div>

    <v-btn block color="primary" variant="tonal" rounded="lg" class="mt-4 add-btn" prepend-icon="mdi-plus" @click="openAddDialog">
      즐겨찾기 추가
    </v-btn>

    <v-dialog v-model="dialog" max-width="400">
      <v-card rounded="xl" class="pa-4">
        <div class="font-weight-bold mb-4">{{ isEditMode ? '즐겨찾기 수정' : '즐겨찾기 추가' }}</div>

        <v-btn-toggle
          :model-value="formType"
          mandatory
          rounded="lg"
          density="comfortable"
          class="mb-4"
          @update:model-value="onFormTypeChange"
        >
          <v-btn value="EXPENSE" variant="tonal">지출</v-btn>
          <v-btn value="INCOME" variant="tonal">수입</v-btn>
        </v-btn-toggle>

        <v-select
          v-model="formCategoryId"
          :items="categoryOptions"
          label="카테고리"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          class="mb-3"
          no-data-text="카테고리가 없습니다"
        />

        <v-text-field
          :model-value="formAmount"
          label="금액"
          inputmode="numeric"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          class="mb-3"
          @update:model-value="handleAmount"
        />

        <v-select
          v-model="formPaymentMethodId"
          :items="paymentMethodOptions"
          label="결제수단 (선택)"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          clearable
          class="mb-3"
          no-data-text="결제수단이 없습니다"
        />

        <v-text-field
          v-model="formMemo"
          label="메모 (선택)"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          class="mb-4"
          @keyup.enter="saveFavorite"
        />

        <div class="d-flex ga-2">
          <v-btn variant="text" class="flex-1" @click="closeDialog">취소</v-btn>
          <v-btn color="primary" variant="tonal" class="flex-1" :disabled="!canSave" :loading="saving" @click="saveFavorite">저장</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.manage-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 20px;
}

.list-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.add-btn {
  flex-shrink: 0;
}

.row-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.row-item:last-child { border-bottom: none; }

.favorite-info {
  flex: 1;
  min-width: 0;
}

.row-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.favorite-sub {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.income-color { color: rgb(var(--v-theme-primary)); }
.expense-color { color: rgb(var(--v-theme-error)); }

.action-btn {
  flex-shrink: 0;
}

.flex-1 {
  flex: 1;
}
</style>
