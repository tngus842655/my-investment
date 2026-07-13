<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { supabase } from '@/services/supabase'
import { useI18n } from 'vue-i18n'
import { showMessage } from '@/composables/useSnackbar'
import type { BudgetPaymentMethod } from '@/types/budget'
import { DEFAULT_BUDGET_PAYMENT_METHODS } from '@/utils/budgetDefaultPaymentMethods'


const { t } = useI18n()
const loading = ref(true)
const paymentMethods = ref<BudgetPaymentMethod[]>([])

// 드래그 정렬 중엔 paymentMethods와 별개로 다뤄야 해서 화면 표시용 리스트를 분리
const displayList = ref<BudgetPaymentMethod[]>([])
watch(paymentMethods, () => {
  displayList.value = [...paymentMethods.value].sort((a, b) => a.sort_order - b.sort_order)
})

const persistOrder = async () => {
  const rows = displayList.value.map((pm, i) => ({ ...pm, sort_order: i }))
  const { error } = await supabase.from('budget_payment_methods').upsert(rows)
  if (error) {
    showMessage(t('budget.common.orderSaveFailed'), 'error')
    await fetchPaymentMethods()
    return
  }
  rows.forEach((r) => {
    const target = paymentMethods.value.find((pm) => pm.id === r.id)
    if (target) target.sort_order = r.sort_order
  })
}

const fetchPaymentMethods = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('budget_payment_methods')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  if (error) {
    showMessage(t('budget.paymentMethods.loadFailed'), 'error')
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
    showMessage(t('budget.paymentMethods.seedFailed'), 'error')
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
    showMessage(t('budget.paymentMethods.nameRequired'), 'warning')
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
      showMessage(t('budget.paymentMethods.updated'), 'success')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from('budget_payment_methods').insert({
        user_id: user.id,
        name,
        sort_order: paymentMethods.value.length,
      })
      if (error) throw error
      showMessage(t('budget.paymentMethods.added'), 'success')
    }
    dialog.value = false
    await fetchPaymentMethods()
  } catch {
    showMessage(t('budget.common.saveFailed'), 'error')
  } finally {
    saving.value = false
  }
}

// ── 삭제 확인 ──────────────────────────
const deleteDialog = ref(false)
const paymentMethodToDelete = ref<BudgetPaymentMethod | null>(null)
const deleting = ref(false)

const openDeleteDialog = (pm: BudgetPaymentMethod) => {
  paymentMethodToDelete.value = pm
  deleteDialog.value = true
}
const closeDeleteDialog = () => {
  deleteDialog.value = false
  paymentMethodToDelete.value = null
}

const confirmDeletePaymentMethod = async () => {
  if (!paymentMethodToDelete.value) return
  deleting.value = true
  const { error } = await supabase.from('budget_payment_methods').delete().eq('id', paymentMethodToDelete.value.id)
  deleting.value = false
  if (error) {
    showMessage(t('budget.calendar.deleteFailed'), 'error')
    return
  }
  showMessage(t('budget.paymentMethods.deleted'), 'success')
  closeDeleteDialog()
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
        <VueDraggable v-model="displayList" tag="div" :animation="150" handle=".drag-handle" @end="persistOrder">
          <div v-for="pm in displayList" :key="pm.id" class="row-item">
            <v-icon class="drag-handle" size="18" color="rgba(var(--v-theme-on-surface), 0.35)">mdi-drag</v-icon>
            <span class="row-name">{{ pm.name }}</span>
            <v-btn icon="mdi-pencil-outline" size="small" variant="text" class="action-btn" @click="openEditDialog(pm)" />
            <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" class="action-btn" @click="openDeleteDialog(pm)" />
          </div>
        </VueDraggable>
        <div v-if="displayList.length === 0" class="text-center py-6">
          <div class="text-medium-emphasis mb-3" style="font-size: 0.875rem">
            {{ $t('budget.paymentMethods.empty') }}
          </div>
          <v-btn size="small" variant="tonal" color="primary" :loading="seeding" @click="seedDefaultPaymentMethods">
            {{ $t('budget.paymentMethods.seedButton') }}
          </v-btn>
        </div>
      </div>
    </div>

    <v-btn block color="primary" variant="tonal" rounded="lg" class="mt-4 add-btn" prepend-icon="mdi-plus" @click="openAddDialog">
      {{ $t('budget.paymentMethods.addButton') }}
    </v-btn>

    <v-dialog v-model="dialog" max-width="360">
      <v-card rounded="xl" class="pa-4">
        <div class="font-weight-bold mb-4">{{ isEditMode ? $t('budget.paymentMethods.editTitle') : $t('budget.paymentMethods.addButton') }}</div>

        <v-text-field
          v-model="formName"
          :label="$t('budget.paymentMethods.nameLabel')"
          :placeholder="$t('budget.paymentMethods.namePlaceholder')"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          class="mb-4"
          autofocus
          @keyup.enter="savePaymentMethod"
        />

        <div class="d-flex ga-2">
          <v-btn variant="text" class="flex-1" @click="closeDialog">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="tonal" class="flex-1" :loading="saving" @click="savePaymentMethod">{{ $t('common.save') }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteDialog" max-width="320">
      <v-card rounded="xl" class="pa-4">
        <div class="font-weight-bold mb-2">{{ $t('budget.paymentMethods.deleteTitle') }}</div>
        <div class="text-medium-emphasis mb-4" style="font-size: 0.8125rem">
          {{ $t('budget.paymentMethods.deleteConfirm', { name: paymentMethodToDelete?.name ?? '' }) }}<br />{{ $t('budget.paymentMethods.deleteNote') }}
        </div>
        <div class="d-flex ga-2">
          <v-btn variant="text" class="flex-1" :disabled="deleting" @click="closeDeleteDialog">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="tonal" class="flex-1" :loading="deleting" @click="confirmDeletePaymentMethod">{{ $t('common.delete') }}</v-btn>
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
  padding: 4px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.row-item:last-child { border-bottom: none; }

.drag-handle {
  flex-shrink: 0;
  cursor: grab;
  touch-action: none;
}

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
