<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { supabase } from '@/services/supabase'
import { useI18n } from 'vue-i18n'
import { showMessage } from '@/composables/useSnackbar'
import type { BudgetCategory, BudgetType } from '@/types/budget'
import { getDefaultBudgetCategories } from '@/utils/budgetDefaultCategories'


const { t } = useI18n()
const loading = ref(true)
const categories = ref<BudgetCategory[]>([])
const selectedType = ref<BudgetType>('EXPENSE')

// 드래그 정렬 중엔 categories와 별개로 다뤄야 해서 화면 표시용 리스트를 분리
const displayList = ref<BudgetCategory[]>([])
const syncDisplayList = () => {
  displayList.value = categories.value
    .filter((c) => c.type === selectedType.value)
    .sort((a, b) => a.sort_order - b.sort_order)
}
watch([categories, selectedType], syncDisplayList)

const persistOrder = async () => {
  const rows = displayList.value.map((c, i) => ({ ...c, sort_order: i }))
  const { error } = await supabase.from('budget_categories').upsert(rows)
  if (error) {
    showMessage(t('budget.common.orderSaveFailed'), 'error')
    await fetchCategories()
    return
  }
  rows.forEach((r) => {
    const target = categories.value.find((c) => c.id === r.id)
    if (target) target.sort_order = r.sort_order
  })
}

const fetchCategories = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  if (error) {
    showMessage(t('budget.categories.loadFailed'), 'error')
    return
  }

  categories.value = data
}

const seeding = ref(false)
const seedDefaultCategories = async (type: BudgetType) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  seeding.value = true
  const rows = getDefaultBudgetCategories()
    .filter((c) => c.type === type)
    .map((c, i) => ({
      user_id: user.id,
      type: c.type,
      name: c.name,
      sort_order: i,
    }))
  const { error } = await supabase.from('budget_categories').insert(rows)
  if (error) {
    showMessage(t('budget.categories.seedFailed'), 'error')
    seeding.value = false
    return
  }
  await fetchCategories()
  seeding.value = false
}

onMounted(async () => {
  loading.value = true
  await fetchCategories()
  loading.value = false
})

// ── 추가/수정 다이얼로그 ──────────────────────────
const dialog = ref(false)
const editingId = ref<string | null>(null)
const formType = ref<BudgetType>('EXPENSE')
const formName = ref('')
const saving = ref(false)

const isEditMode = computed(() => !!editingId.value)

const openAddDialog = () => {
  editingId.value = null
  formType.value = selectedType.value
  formName.value = ''
  dialog.value = true
}

const openEditDialog = (c: BudgetCategory) => {
  editingId.value = c.id
  formType.value = c.type
  formName.value = c.name
  dialog.value = true
}

const closeDialog = () => {
  dialog.value = false
}

const saveCategory = async () => {
  const name = formName.value.trim()
  if (!name) {
    showMessage(t('budget.categories.nameRequired'), 'warning')
    return
  }

  saving.value = true
  try {
    if (isEditMode.value) {
      const { error } = await supabase
        .from('budget_categories')
        .update({ name })
        .eq('id', editingId.value)
      if (error) throw error
      showMessage(t('budget.categories.updated'), 'success')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const sortOrder = categories.value.filter((c) => c.type === formType.value).length
      const { error } = await supabase.from('budget_categories').insert({
        user_id: user.id,
        type: formType.value,
        name,
        sort_order: sortOrder,
      })
      if (error) throw error
      showMessage(t('budget.categories.added'), 'success')
    }
    dialog.value = false
    await fetchCategories()
  } catch {
    showMessage(t('budget.common.saveFailed'), 'error')
  } finally {
    saving.value = false
  }
}

// ── 삭제 확인 ──────────────────────────
const deleteDialog = ref(false)
const categoryToDelete = ref<BudgetCategory | null>(null)
const favoriteUsageCount = ref(0)
const deleting = ref(false)

const openDeleteDialog = async (c: BudgetCategory) => {
  categoryToDelete.value = c
  const { count } = await supabase
    .from('budget_favorites')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', c.id)
  favoriteUsageCount.value = count ?? 0
  deleteDialog.value = true
}
const closeDeleteDialog = () => {
  deleteDialog.value = false
  categoryToDelete.value = null
}

const confirmDeleteCategory = async () => {
  if (!categoryToDelete.value) return
  deleting.value = true
  const { error } = await supabase.from('budget_categories').delete().eq('id', categoryToDelete.value.id)
  deleting.value = false
  if (error) {
    if (error.code === '23503') {
      showMessage(t('budget.categories.inUse'), 'error')
    } else {
      showMessage(t('budget.calendar.deleteFailed'), 'error')
    }
    return
  }
  showMessage(t('budget.categories.deleted'), 'success')
  closeDeleteDialog()
  await fetchCategories()
}
</script>

<template>
  <div class="manage-tab">
    <v-btn-toggle v-model="selectedType" mandatory rounded="lg" density="comfortable" class="mb-4 w-100">
      <v-btn value="EXPENSE" variant="tonal" class="flex-grow-1">{{ $t('budget.common.expense') }}</v-btn>
      <v-btn value="INCOME" variant="tonal" class="flex-grow-1">{{ $t('budget.common.income') }}</v-btn>
    </v-btn-toggle>

    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <div v-else class="glass-card pa-4 list-wrap">
      <div class="list-scroll">
        <VueDraggable v-model="displayList" tag="div" :animation="150" handle=".drag-handle" @end="persistOrder">
          <div v-for="c in displayList" :key="c.id" class="row-item">
            <v-icon class="drag-handle" size="18" color="rgba(var(--v-theme-on-surface), 0.35)">mdi-drag</v-icon>
            <span class="row-name">{{ c.name }}</span>
            <v-btn icon="mdi-pencil-outline" size="small" variant="text" class="action-btn" @click="openEditDialog(c)" />
            <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" class="action-btn" @click="openDeleteDialog(c)" />
          </div>
        </VueDraggable>
        <div v-if="displayList.length === 0" class="text-center py-6">
          <div class="text-medium-emphasis mb-3" style="font-size: 0.875rem">
            {{ $t('budget.categories.empty') }}
          </div>
          <v-btn size="small" variant="tonal" color="primary" :loading="seeding" @click="seedDefaultCategories(selectedType)">
            {{ $t('budget.categories.seedButton') }}
          </v-btn>
        </div>
      </div>
    </div>

    <v-btn block color="primary" variant="tonal" rounded="lg" class="mt-4 add-btn" prepend-icon="mdi-plus" @click="openAddDialog">
      {{ $t('budget.categories.addButton') }}
    </v-btn>

    <v-dialog v-model="dialog" max-width="400">
      <v-card rounded="xl" class="pa-4">
        <div class="font-weight-bold mb-4">{{ isEditMode ? $t('budget.categories.editTitle') : $t('budget.categories.addButton') }}</div>

        <v-btn-toggle v-if="!isEditMode" v-model="formType" mandatory rounded="lg" density="comfortable" class="mb-4">
          <v-btn value="EXPENSE" variant="tonal">{{ $t('budget.common.expense') }}</v-btn>
          <v-btn value="INCOME" variant="tonal">{{ $t('budget.common.income') }}</v-btn>
        </v-btn-toggle>

        <v-text-field
          v-model="formName"
          :label="$t('budget.categories.nameLabel')"
          :placeholder="$t('budget.categories.namePlaceholder')"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          class="mb-4"
          autofocus
          @keyup.enter="saveCategory"
        />

        <div class="d-flex ga-2">
          <v-btn variant="text" class="flex-1" @click="closeDialog">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="tonal" class="flex-1" :loading="saving" @click="saveCategory">{{ $t('common.save') }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteDialog" max-width="320">
      <v-card rounded="xl" class="pa-4">
        <div class="font-weight-bold mb-2">{{ $t('budget.categories.deleteTitle') }}</div>
        <div class="text-medium-emphasis mb-4" style="font-size: 0.8125rem">
          {{ $t('budget.categories.deleteConfirm', { name: categoryToDelete?.name ?? '' }) }}
          <template v-if="favoriteUsageCount > 0"><br />{{ $t('budget.categories.deleteWithFavorites', { count: favoriteUsageCount }) }}</template>
        </div>
        <div class="d-flex ga-2">
          <v-btn variant="text" class="flex-1" :disabled="deleting" @click="closeDeleteDialog">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="tonal" class="flex-1" :loading="deleting" @click="confirmDeleteCategory">{{ $t('common.delete') }}</v-btn>
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
