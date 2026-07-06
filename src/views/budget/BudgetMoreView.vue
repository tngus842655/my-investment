<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useUserDataStore } from '@/stores/userData'

const router = useRouter()
const userDataStore = useUserDataStore()
const confirmDialog = ref(false)

const logout = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    showMessage('로그아웃 중 오류가 발생했습니다.', 'error')
    return
  }
  userDataStore.reset()
  router.replace('/')
}

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

const openResetDialog = (target: ResetTarget) => {
  resetTarget.value = target
  resetPassword.value = ''
  resetPasswordError.value = ''
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
  <v-container class="pa-4 pa-sm-6">
    <div class="d-flex align-center ga-2 mb-6">
      <img src="/icons/icon-more.png" class="header-icon" alt="더보기" />
      <div>
        <div class="font-weight-bold">더보기</div>
        <div class="text-medium-emphasis">가계부 설정 및 계정 관리</div>
      </div>
    </div>

    <div class="section-label mb-2">다른 서비스</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/hub')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-view-grid-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">서비스 홈</div>
          <div class="text-medium-emphasis">자산관리·가계부 전환</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <div class="section-label mb-2">가계부</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/search')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-magnify</v-icon></div>
        <div>
          <div class="font-weight-medium">내역 검색</div>
          <div class="text-medium-emphasis">메모·카테고리로 내역 찾기</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/manage')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-cog-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">관리</div>
          <div class="text-medium-emphasis">카테고리·결제수단·즐겨찾기 관리</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/import')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-file-excel-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">엑셀 가져오기</div>
          <div class="text-medium-emphasis">엑셀 파일로 과거 내역 일괄 등록</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <div class="section-label mb-2">데이터 관리</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="openResetDialog('entries')">
        <div class="menu-icon menu-icon-error"><v-icon size="18" color="error">mdi-delete-clock-outline</v-icon></div>
        <div>
          <div class="font-weight-medium text-error">거래내역 초기화</div>
          <div class="text-medium-emphasis">등록된 모든 거래내역 삭제</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="openResetDialog('favorites')">
        <div class="menu-icon menu-icon-error"><v-icon size="18" color="error">mdi-star-off-outline</v-icon></div>
        <div>
          <div class="font-weight-medium text-error">즐겨찾기 초기화</div>
          <div class="text-medium-emphasis">등록된 모든 즐겨찾기 삭제</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="openResetDialog('all')">
        <div class="menu-icon menu-icon-error"><v-icon size="18" color="error">mdi-database-remove-outline</v-icon></div>
        <div>
          <div class="font-weight-medium text-error">전체 초기화</div>
          <div class="text-medium-emphasis">카테고리·결제수단 포함 모든 데이터 삭제</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <div class="section-label mb-2">계정</div>
    <div class="d-flex flex-column ga-2">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="confirmDialog = true">
        <div class="menu-icon menu-icon-error"><v-icon size="18" color="error">mdi-logout</v-icon></div>
        <div class="font-weight-medium text-error">로그아웃</div>
      </div>
    </div>

    <v-dialog v-model="confirmDialog" max-width="360">
      <v-card rounded="xl" class="glass-dialog">
        <v-card-title class="text-center pt-6">로그아웃</v-card-title>
        <v-card-text class="text-center text-medium-emphasis">정말 로그아웃 하시겠습니까?</v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-btn variant="text" block @click="confirmDialog = false">취소</v-btn>
          <v-btn color="error" block @click="logout">로그아웃</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="resetTarget !== null" max-width="360" @update:model-value="(v) => !v && closeResetDialog()">
      <v-card rounded="xl" class="glass-dialog pa-4">
        <div class="font-weight-bold mb-2 text-error">{{ resetTitle }}</div>
        <div class="text-medium-emphasis mb-4" style="font-size: 0.8125rem">
          {{ resetDescription }} 이 작업은 되돌릴 수 없습니다. 계속하려면 비밀번호를 입력해주세요.
        </div>
        <v-text-field
          v-model="resetPassword"
          type="password"
          label="비밀번호"
          density="compact"
          variant="outlined"
          rounded="lg"
          :error-messages="resetPasswordError"
          autofocus
          @keyup.enter="executeReset"
        />
        <div class="d-flex ga-2 mt-2">
          <v-btn variant="text" class="flex-1" :disabled="resetLoading" @click="closeResetDialog">취소</v-btn>
          <v-btn color="error" variant="tonal" class="flex-1" :loading="resetLoading" @click="executeReset">초기화</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
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

.menu-icon-error {
  background: rgba(var(--v-theme-error), 0.1);
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

.glass-dialog {
  background: var(--fp-surface) !important;
  border: 1px solid var(--fp-outline) !important;
}

.flex-1 {
  flex: 1;
}
</style>
