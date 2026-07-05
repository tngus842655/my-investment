<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import type { BudgetCategory, BudgetType } from '@/types/budget'
import { DEFAULT_BUDGET_CATEGORIES, BUDGET_CATEGORY_ICON_CHOICES } from '@/utils/budgetDefaultCategories'

const router = useRouter()

const loading = ref(true)
const categories = ref<BudgetCategory[]>([])
const selectedType = ref<BudgetType>('EXPENSE')

const filteredCategories = computed(() =>
  categories.value
    .filter((c) => c.type === selectedType.value)
    .sort((a, b) => a.sort_order - b.sort_order),
)

const fetchCategories = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  if (error) {
    showMessage('카테고리를 불러오지 못했습니다.', 'error')
    return
  }

  // 최초 진입 시 기본 카테고리 시딩
  if ((data ?? []).length === 0) {
    const { data: { user: seedUser } } = await supabase.auth.getUser()
    if (!seedUser) return
    const rows = DEFAULT_BUDGET_CATEGORIES.map((c, i) => ({
      user_id: seedUser.id,
      type: c.type,
      name: c.name,
      icon: c.icon,
      sort_order: i,
    }))
    const { error: seedError } = await supabase.from('budget_categories').insert(rows)
    if (seedError) {
      showMessage('기본 카테고리 생성에 실패했습니다.', 'error')
      return
    }
    const { data: seeded } = await supabase
      .from('budget_categories')
      .select('*')
      .eq('user_id', seedUser.id)
      .order('sort_order')
    categories.value = seeded ?? []
    return
  }

  categories.value = data
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
const formIcon = ref(BUDGET_CATEGORY_ICON_CHOICES[0])
const saving = ref(false)

const isEditMode = computed(() => !!editingId.value)

const openAddDialog = () => {
  editingId.value = null
  formType.value = selectedType.value
  formName.value = ''
  formIcon.value = BUDGET_CATEGORY_ICON_CHOICES[0]!
  dialog.value = true
}

const openEditDialog = (c: BudgetCategory) => {
  editingId.value = c.id
  formType.value = c.type
  formName.value = c.name
  formIcon.value = c.icon
  dialog.value = true
}

const closeDialog = () => {
  dialog.value = false
}

const saveCategory = async () => {
  const name = formName.value.trim()
  if (!name) {
    showMessage('카테고리 이름을 입력해주세요.', 'warning')
    return
  }

  saving.value = true
  try {
    if (isEditMode.value) {
      const { error } = await supabase
        .from('budget_categories')
        .update({ name, icon: formIcon.value })
        .eq('id', editingId.value)
      if (error) throw error
      showMessage('카테고리가 수정되었습니다.', 'success')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const sortOrder = categories.value.filter((c) => c.type === formType.value).length
      const { error } = await supabase.from('budget_categories').insert({
        user_id: user.id,
        type: formType.value,
        name,
        icon: formIcon.value,
        sort_order: sortOrder,
      })
      if (error) throw error
      showMessage('카테고리가 추가되었습니다.', 'success')
    }
    dialog.value = false
    await fetchCategories()
  } catch {
    showMessage('저장 중 오류가 발생했습니다.', 'error')
  } finally {
    saving.value = false
  }
}

const deleteCategory = async (c: BudgetCategory) => {
  const { error } = await supabase.from('budget_categories').delete().eq('id', c.id)
  if (error) {
    if (error.code === '23503') {
      showMessage('이 카테고리를 사용하는 내역이 있어 삭제할 수 없습니다.', 'error')
    } else {
      showMessage('삭제 중 오류가 발생했습니다.', 'error')
    }
    return
  }
  showMessage('카테고리가 삭제되었습니다.', 'success')
  await fetchCategories()
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 640px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="font-weight-bold">카테고리 관리</div>
        <div class="text-medium-emphasis">수입·지출 카테고리 추가·수정·삭제</div>
      </div>
    </div>

    <v-btn-toggle v-model="selectedType" mandatory rounded="lg" density="comfortable" class="mb-4">
      <v-btn value="EXPENSE" variant="tonal">지출</v-btn>
      <v-btn value="INCOME" variant="tonal">수입</v-btn>
    </v-btn-toggle>

    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <div v-else class="glass-card pa-4">
      <div class="category-list">
        <div v-for="c in filteredCategories" :key="c.id" class="category-row">
          <span class="category-icon">{{ c.icon }}</span>
          <span class="category-name">{{ c.name }}</span>
          <v-btn icon="mdi-pencil-outline" size="small" variant="text" class="action-btn" @click="openEditDialog(c)" />
          <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" class="action-btn" @click="deleteCategory(c)" />
        </div>
        <div v-if="filteredCategories.length === 0" class="text-center text-medium-emphasis py-4">
          카테고리가 없습니다.
        </div>
      </div>
    </div>

    <v-btn block color="primary" variant="tonal" rounded="lg" class="mt-4" prepend-icon="mdi-plus" @click="openAddDialog">
      카테고리 추가
    </v-btn>

    <v-dialog v-model="dialog" max-width="400">
      <v-card rounded="xl" class="pa-4">
        <div class="font-weight-bold mb-4">{{ isEditMode ? '카테고리 수정' : '카테고리 추가' }}</div>

        <v-btn-toggle v-if="!isEditMode" v-model="formType" mandatory rounded="lg" density="comfortable" class="mb-4">
          <v-btn value="EXPENSE" variant="tonal">지출</v-btn>
          <v-btn value="INCOME" variant="tonal">수입</v-btn>
        </v-btn-toggle>

        <v-text-field
          v-model="formName"
          label="카테고리 이름"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          class="mb-4"
          autofocus
          @keyup.enter="saveCategory"
        />

        <div class="text-medium-emphasis mb-2" style="font-size: 0.8125rem">아이콘 선택</div>
        <div class="icon-grid mb-4">
          <button
            v-for="icon in BUDGET_CATEGORY_ICON_CHOICES"
            :key="icon"
            class="icon-choice"
            :class="{ selected: formIcon === icon }"
            @click="formIcon = icon"
          >
            {{ icon }}
          </button>
        </div>

        <div class="d-flex ga-2">
          <v-btn variant="text" class="flex-1" @click="closeDialog">취소</v-btn>
          <v-btn color="primary" variant="tonal" class="flex-1" :loading="saving" @click="saveCategory">저장</v-btn>
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

.category-list {
  max-height: 480px;
  overflow-y: auto;
}

.category-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.category-row:last-child { border-bottom: none; }

.category-icon {
  font-size: 1.25rem;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}

.category-name {
  font-size: 0.875rem;
  flex: 1;
  color: rgb(var(--v-theme-on-surface));
}

.action-btn {
  flex-shrink: 0;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.icon-choice {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.125rem;
  border-radius: 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: none;
  cursor: pointer;
}

.icon-choice.selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.flex-1 {
  flex: 1;
}
</style>
