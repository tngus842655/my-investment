<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
const dataManageOpen = ref(false)

// ── 데이터 초기화 ──────────────────────────
type ResetTarget = 'entries' | 'favorites' | 'all'
const resetTarget = ref<ResetTarget | null>(null)
const resetPassword = ref('')
const resetPasswordError = ref('')
const resetLoading = ref(false)

const resetTitle = computed(() => {
  if (resetTarget.value === 'entries') return '거래내역 초기화'
  if (resetTarget.value === 'favorites') return '즐겨찾기 초기화'
  if (resetTarget.value === 'all') return '전체 초기화'
  return ''
})
const resetDescription = computed(() => {
  if (resetTarget.value === 'entries') return '등록된 모든 거래내역이 삭제됩니다.'
  if (resetTarget.value === 'favorites') return '등록된 모든 즐겨찾기가 삭제됩니다.'
  if (resetTarget.value === 'all') return '카테고리·결제수단·즐겨찾기·거래내역 등 가계부의 모든 데이터가 삭제됩니다.'
  return ''
})

// 크롬이 "비밀번호 폼에 사용자 이름 필드가 없다"고 경고해서, 접근성용 숨김 필드에 채워줄 이메일
const userEmail = ref('')

const openResetDialog = async (target: ResetTarget) => {
  resetTarget.value = target
  resetPassword.value = ''
  resetPasswordError.value = ''
  const { data: { user } } = await supabase.auth.getUser()
  userEmail.value = user?.email ?? ''
}
const closeResetDialog = () => {
  resetTarget.value = null
}

const executeReset = async () => {
  if (!resetPassword.value) {
    resetPasswordError.value = '비밀번호를 입력해주세요.'
    return
  }
  resetLoading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: resetPassword.value,
    })
    if (authError) {
      resetPasswordError.value = '비밀번호가 올바르지 않습니다.'
      return
    }

    const target = resetTarget.value
    if (target === 'entries' || target === 'all') {
      const { error } = await supabase.from('budget_entries').delete().eq('user_id', user.id)
      if (error) throw error
    }
    if (target === 'favorites' || target === 'all') {
      const { error } = await supabase.from('budget_favorites').delete().eq('user_id', user.id)
      if (error) throw error
    }
    if (target === 'all') {
      const { error: catError } = await supabase.from('budget_categories').delete().eq('user_id', user.id)
      if (catError) throw catError
      const { error: pmError } = await supabase.from('budget_payment_methods').delete().eq('user_id', user.id)
      if (pmError) throw pmError
    }

    showMessage(`${resetTitle.value}가 완료되었습니다.`, 'success')
    closeResetDialog()
  } catch {
    showMessage('초기화 중 오류가 발생했습니다.', 'error')
  } finally {
    resetLoading.value = false
  }
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6 budget-more-page">
    <div class="d-flex align-center justify-space-between mb-2">
      <div class="d-flex align-center ga-2">
        <img src="/icons/icon-more.png" class="header-icon" alt="더보기" />
        <div class="font-weight-bold">더보기</div>
      </div>
      <v-btn icon variant="text" size="small" to="/hub">
        <img src="/icons/icon-hub.png" class="header-icon" alt="허브" />
      </v-btn>
    </div>

    <div class="section-label mb-2">가계부</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/budget/search')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-magnify</v-icon></div>
        <div>
          <div class="font-weight-medium">내역 검색</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/budget/manage')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-cog-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">관리</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/budget/import')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-file-excel-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">엑셀 가져오기</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <div class="glass-card py-2 px-4 mb-5 mt-auto">
      <div class="section-label-lg d-flex align-center justify-space-between cursor-pointer" @click="dataManageOpen = !dataManageOpen">
        <span>데이터 관리</span>
        <v-icon size="18" class="collapse-icon" :class="{ 'collapse-icon-open': dataManageOpen }">mdi-chevron-down</v-icon>
      </div>
      <div v-if="dataManageOpen" class="mt-2">
        <v-btn variant="tonal" color="error" rounded="lg" block prepend-icon="mdi-delete-clock-outline" class="mb-2" @click="openResetDialog('entries')">
          거래내역 초기화
        </v-btn>
        <v-btn variant="tonal" color="error" rounded="lg" block prepend-icon="mdi-star-off-outline" class="mb-2" @click="openResetDialog('favorites')">
          즐겨찾기 초기화
        </v-btn>
        <v-btn variant="tonal" color="error" rounded="lg" block prepend-icon="mdi-database-remove-outline" @click="openResetDialog('all')">
          전체 초기화
        </v-btn>
      </div>
    </div>

    <v-dialog :model-value="resetTarget !== null" max-width="360" @update:model-value="(v) => !v && closeResetDialog()">
      <v-card rounded="xl" class="glass-dialog pa-4">
        <div class="font-weight-bold mb-2 text-error">{{ resetTitle }}</div>
        <div class="text-medium-emphasis mb-4" style="font-size: 0.8125rem">
          {{ resetDescription }} 이 작업은 되돌릴 수 없습니다. 계속하려면 비밀번호를 입력해주세요.
        </div>
        <form @submit.prevent="executeReset">
          <input
            type="text"
            :value="userEmail"
            autocomplete="username"
            readonly
            class="visually-hidden"
            tabindex="-1"
            aria-hidden="true"
          />
          <v-text-field
            v-model="resetPassword"
            type="password"
            autocomplete="current-password"
            label="비밀번호"
            density="compact"
            variant="outlined"
            rounded="lg"
            :error-messages="resetPasswordError"
            autofocus
          />
          <div class="d-flex ga-2 mt-2">
            <v-btn type="button" variant="text" class="flex-1" :disabled="resetLoading" @click="closeResetDialog">취소</v-btn>
            <v-btn type="submit" color="error" variant="tonal" class="flex-1" :loading="resetLoading">초기화</v-btn>
          </div>
        </form>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
/* 크롬 비밀번호 폼 접근성 경고 방지용 — 화면에는 안 보이지만 DOM/접근성 트리에는 남겨둠 */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.budget-more-page {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 32px - 10px);
}

.header-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.section-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
  padding: 0 4px;
}

.section-label-lg {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-on-surface));
  padding: 6px 0;
}

.glass-card {
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
  border-radius: 20px;
}

.menu-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-card {
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.menu-card:active {
  opacity: 0.7;
}

.chevron-icon {
  color: rgba(var(--v-theme-on-surface), 0.3);
}

.cursor-pointer {
  cursor: pointer;
}

.collapse-icon {
  color: rgba(var(--v-theme-on-surface), 0.4);
  transition: transform 0.2s ease;
}

.collapse-icon-open {
  transform: rotate(180deg);
}

.glass-dialog {
  background: var(--fp-surface) !important;
  border: 1px solid var(--fp-outline) !important;
}

.flex-1 {
  flex: 1;
}
</style>
