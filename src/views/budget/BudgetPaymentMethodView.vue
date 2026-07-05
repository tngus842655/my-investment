<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import type { BudgetPaymentMethod } from '@/types/budget'
import { DEFAULT_BUDGET_PAYMENT_METHODS } from '@/utils/budgetDefaultPaymentMethods'

const router = useRouter()

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

  if ((data ?? []).length === 0) {
    const rows = DEFAULT_BUDGET_PAYMENT_METHODS.map((name, i) => ({ user_id: user.id, name, sort_order: i }))
    const { error: seedError } = await supabase.from('budget_payment_methods').insert(rows)
    if (seedError) {
      showMessage('기본 결제수단 생성에 실패했습니다.', 'error')
      return
    }
    const { data: seeded } = await supabase
      .from('budget_payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order')
    paymentMethods.value = seeded ?? []
    return
  }

  paymentMethods.value = data
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
  <v-container class="pa-4 pa-sm-6" style="max-width: 640px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="font-weight-bold">결제수단 관리</div>
        <div class="text-medium-emphasis">결제수단 추가·수정·삭제</div>
      </div>
    </div>

    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <div v-else class="glass-card pa-4">
      <div class="pm-list">
        <div v-for="pm in sortedPaymentMethods" :key="pm.id" class="pm-row">
          <span class="pm-name">{{ pm.name }}</span>
          <v-btn icon="mdi-pencil-outline" size="small" variant="text" class="action-btn" @click="openEditDialog(pm)" />
          <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" class="action-btn" @click="deletePaymentMethod(pm)" />
        </div>
        <div v-if="sortedPaymentMethods.length === 0" class="text-center text-medium-emphasis py-4">
          결제수단이 없습니다.
        </div>
      </div>
    </div>

    <v-btn block color="primary" variant="tonal" rounded="lg" class="mt-4" prepend-icon="mdi-plus" @click="openAddDialog">
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

.pm-list {
  max-height: 480px;
  overflow-y: auto;
}

.pm-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.pm-row:last-child { border-bottom: none; }

.pm-name {
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
