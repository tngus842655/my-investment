<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import type { BudgetPaymentMethod } from '@/types/budget'
import { DEFAULT_BUDGET_PAYMENT_METHODS } from '@/utils/budgetDefaultPaymentMethods'

const loading = ref(true)
const paymentMethods = ref<BudgetPaymentMethod[]>([])

const sortedPaymentMethods = computed(() =>
  [...paymentMethods.value].sort((a, b) => a.sort_order - b.sort_order),
)

const fetchPaymentMethods = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('budget_payment_methods')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  if (error) {
    showMessage('결제수단을 불러오지 못했습니다.', 'error')
    return
  }

  paymentMethods.value = data
}

const seeding = ref(false)
const seedDefaultPaymentMethods = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  seeding.value = true
  const rows = DEFAULT_BUDGET_PAYMENT_METHODS.map((name, i) => ({ user_id: user.id, name, sort_order: i }))
  const { error } = await supabase.from('budget_payment_methods').insert(rows)
  if (error) {
    showMessage('기본 결제수단 생성에 실패했습니다.', 'error')
    seeding.value = false
    return
  }
  await fetchPaymentMethods()
  seeding.value = false
}

onMounted(async () => {
  loading.value = true
  await fetchPaymentMethods()
  loading.value = false
})

// ── 추가/수정 다이얼로그 ──────────────────────────
const dialog = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const saving = ref(false)

const isEditMode = computed(() => !!editingId.value)

const openAddDialog = () => {
  editingId.value = null
  formName.value = ''
  dialog.value = true
}

const openEditDialog = (pm: BudgetPaymentMethod) => {
  editingId.value = pm.id
  formName.value = pm.name
  dialog.value = true
}

const closeDialog = () => {
  dialog.value = false
}

const savePaymentMethod = async () => {
  const name = formName.value.trim()
  if (!name) {
    showMessage('결제수단 이름을 입력해주세요.', 'warning')
    return
  }

  saving.value = true
  try {
    if (isEditMode.value) {
      const { error } = await supabase
        .from('budget_payment_methods')
        .update({ name })
        .eq('id', editingId.value)
      if (error) throw error
      showMessage('결제수단이 수정되었습니다.', 'success')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from('budget_payment_methods').insert({
        user_id: user.id,
        name,
        sort_order: paymentMethods.value.length,
      })
      if (error) throw error
      showMessage('결제수단이 추가되었습니다.', 'success')
    }
    dialog.value = false
    await fetchPaymentMethods()
  } catch {
    showMessage('저장 중 오류가 발생했습니다.', 'error')
  } finally {
    saving.value = false
  }
}

const deletePaymentMethod = async (pm: BudgetPaymentMethod) => {
  const { error } = await supabase.from('budget_payment_methods').delete().eq('id', pm.id)
  if (error) {
    showMessage('삭제 중 오류가 발생했습니다.', 'error')
    return
  }
  showMessage('결제수단이 삭제되었습니다. 이 결제수단을 쓰던 내역은 결제수단 없음으로 남습니다.', 'success')
  await fetchPaymentMethods()
}
</script>

<template>
  <div class="manage-tab">
    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <div v-else class="glass-card pa-4 list-wrap">
      <div class="list-scroll">
        <div v-for="pm in sortedPaymentMethods" :key="pm.id" class="row-item">
          <span class="row-name">{{ pm.name }}</span>
          <v-btn icon="mdi-pencil-outline" size="small" variant="text" class="action-btn" @click="openEditDialog(pm)" />
          <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" class="action-btn" @click="deletePaymentMethod(pm)" />
        </div>
        <div v-if="sortedPaymentMethods.length === 0" class="text-center py-6">
          <div class="text-medium-emphasis mb-3" style="font-size: 0.875rem">
            결제수단이 없습니다.
          </div>
          <v-btn size="small" variant="tonal" color="primary" :loading="seeding" @click="seedDefaultPaymentMethods">
            기본 결제수단 추가
          </v-btn>
        </div>
      </div>
    </div>

    <v-btn block color="primary" variant="tonal" rounded="lg" class="mt-4 add-btn" prepend-icon="mdi-plus" @click="openAddDialog">
      결제수단 추가
    </v-btn>

    <v-dialog v-model="dialog" max-width="360">
      <v-card rounded="xl" class="pa-4">
        <div class="font-weight-bold mb-4">{{ isEditMode ? '결제수단 수정' : '결제수단 추가' }}</div>

        <v-text-field
          v-model="formName"
          label="결제수단 이름"
          placeholder="예: 계좌이체"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          class="mb-4"
          autofocus
          @keyup.enter="savePaymentMethod"
        />

        <div class="d-flex ga-2">
          <v-btn variant="text" class="flex-1" @click="closeDialog">취소</v-btn>
          <v-btn color="primary" variant="tonal" class="flex-1" :loading="saving" @click="savePaymentMethod">저장</v-btn>
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

.row-name {
  font-size: 0.875rem;
  flex: 1;
  color: rgb(var(--v-theme-on-surface));
}

.action-btn {
  flex-shrink: 0;
}

.flex-1 {
  flex: 1;
}
</style>
