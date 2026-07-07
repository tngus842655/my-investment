<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDesignTokens } from '@/composables/useDesignTokens'
import { useAppTheme } from '@/composables/useAppTheme'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useUserDataStore } from '@/stores/userData'
import { isAdminEmail, isBudgetPreviewAllowed } from '@/config/admin'
import { serviceMenuOpen, settingsMenuOpen } from '@/composables/useHubMenuState'

const router = useRouter()
const { themeId } = useDesignTokens()
const { currentThemeId, themes, setTheme } = useAppTheme()
const userDataStore = useUserDataStore()
const themeSheet = ref(false)

const selectTheme = (id: string) => {
  setTheme(id as Parameters<typeof setTheme>[0])
  themeSheet.value = false
}

const canAccessBudget = ref(false)
const isAdmin = ref(false)
const unreadFeedbackCount = ref(0)

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

// 회원탈퇴 상태
const deleteStep = ref(0)
const deletePassword = ref('')
const deletePasswordError = ref('')
const deleteLoading = ref(false)
// 크롬이 "비밀번호 폼에 사용자 이름 필드가 없다"고 경고해서, 접근성용 숨김 필드에 채워줄 이메일
const userEmail = ref('')

const openDeleteDialog = () => {
  deletePassword.value = ''
  deletePasswordError.value = ''
  deleteStep.value = 1
}

const closeDeleteDialog = () => {
  deleteStep.value = 0
  deletePassword.value = ''
  deletePasswordError.value = ''
}

const deleteAccount = async () => {
  if (!deletePassword.value) {
    deletePasswordError.value = '비밀번호를 입력해주세요.'
    return
  }
  deleteLoading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: deletePassword.value,
    })
    if (authError) {
      deletePasswordError.value = '비밀번호가 올바르지 않습니다.'
      return
    }

    const { error } = await supabase.rpc('delete_user_account')
    if (error) throw error
    await supabase.auth.signOut()
    userDataStore.reset()
    showMessage('계정이 삭제되었습니다.', 'success')
    router.replace('/')
  } catch {
    showMessage('계정 삭제 중 오류가 발생했습니다.', 'error')
  } finally {
    deleteLoading.value = false
  }
}

const fetchUnreadFeedbackCount = async (user: { email?: string | null }) => {
  isAdmin.value = isAdminEmail(user.email)
  if (isAdmin.value) {
    const { count } = await supabase
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'RECEIVED')
    unreadFeedbackCount.value = count ?? 0
  } else {
    const { count } = await supabase
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('email', user.email ?? '')
      .eq('is_read_by_user', false)
    unreadFeedbackCount.value = count ?? 0
  }
}

const LOGO_WIDE: Partial<Record<string, string>> = {
  light: '/icons/wide/logo-wide-light.png',
  dark: '/icons/wide/logo-wide-dark.png',
  gold: '/icons/wide/logo-wide-gold.png',
  nature: '/icons/wide/logo-wide-nature.png',
  space: '/icons/wide/logo-wide-space.png',
}
const logoWide = computed(() => LOGO_WIDE[themeId.value] ?? null)

const showBack = ref(false)
onMounted(async () => {
  showBack.value = window.history.state?.back != null && window.history.state.back !== '/'
  const { data: { user } } = await supabase.auth.getUser()
  canAccessBudget.value = isBudgetPreviewAllowed(user?.email)
  userEmail.value = user?.email ?? ''
  if (user) await fetchUnreadFeedbackCount(user)
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6 hub-page">
    <div class="hub-header mb-6">
      <button v-if="showBack" class="back-btn hub-header-back" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <img v-if="logoWide" :src="logoWide" class="header-logo-wide" alt="FIREPATH" />
      <div v-else class="font-weight-bold text-h6">Fire Path</div>
    </div>

    <div class="d-flex flex-column ga-2">
      <div class="hub-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/dashboard')">
        <div class="hub-icon"><v-icon size="24" color="primary">mdi-finance</v-icon></div>
        <div class="font-weight-medium">자산관리</div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div
        class="hub-card glass-card pa-2 d-flex align-center ga-3"
        :class="{ 'hub-card-disabled': !canAccessBudget }"
        @click="canAccessBudget && router.push('/budget')"
      >
        <div class="hub-icon"><v-icon size="24" color="primary">mdi-notebook-outline</v-icon></div>
        <div class="d-flex align-center ga-2">
          <div class="font-weight-medium">가계부</div>
          <div v-if="!canAccessBudget" class="coming-soon-badge">준비중</div>
        </div>
        <v-spacer />
        <v-icon v-if="canAccessBudget" size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 서비스/설정/관리자: 화면 하단에 고정 배치 -->
    <div class="bottom-menu mt-auto">
      <!-- 서비스 -->
      <div class="glass-card py-2 px-4 mt-3">
        <div class="section-label-lg d-flex align-center justify-space-between cursor-pointer" @click="serviceMenuOpen = !serviceMenuOpen">
          <span>서비스</span>
          <v-icon size="18" class="collapse-icon" :class="{ 'collapse-icon-open': serviceMenuOpen }">mdi-chevron-down</v-icon>
        </div>
        <div v-if="serviceMenuOpen" class="mt-2">
          <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-bullhorn-outline" class="mb-2" @click="router.push('/notices')">
            공지사항
          </v-btn>
          <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-message-text-outline" class="mb-2" @click="router.push('/feedback')">
            의견 관리
            <v-badge v-if="!isAdmin && unreadFeedbackCount > 0" dot color="error" inline class="ml-2" />
          </v-btn>
          <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-notebook-edit-outline" @click="router.push('/release-notes')">
            개발자 노트
          </v-btn>
        </div>
      </div>

      <!-- 설정 -->
      <div class="glass-card py-2 px-4 mt-3">
        <div class="section-label-lg d-flex align-center justify-space-between cursor-pointer" @click="settingsMenuOpen = !settingsMenuOpen">
          <span>설정</span>
          <v-icon size="18" class="collapse-icon" :class="{ 'collapse-icon-open': settingsMenuOpen }">mdi-chevron-down</v-icon>
        </div>
        <div v-if="settingsMenuOpen" class="mt-2">
          <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-palette-outline" class="mb-2" @click="themeSheet = true">
            테마 선택
          </v-btn>
          <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-cellphone-cog" class="mb-2" @click="router.push('/display-settings')">
            화면 설정
          </v-btn>
          <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-lock-reset" @click="router.push('/change-password')">
            비밀번호 변경
          </v-btn>
        </div>
      </div>

      <!-- 로그아웃 -->
      <v-btn variant="tonal" color="error" rounded="lg" block prepend-icon="mdi-logout" class="mt-3" @click="confirmDialog = true">
        로그아웃
      </v-btn>

      <!-- 회원탈퇴 -->
      <div class="text-center mt-3">
        <span class="delete-account-btn" @click="openDeleteDialog">회원탈퇴</span>
      </div>

      <!-- 관리자 -->
      <div v-if="isAdmin" class="glass-card pa-4 mt-3">
        <div class="section-label mb-3">관리자</div>
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-shield-crown-outline" @click="router.push('/admin')">
          관리자 페이지
          <v-badge v-if="unreadFeedbackCount > 0" :content="unreadFeedbackCount" color="error" inline class="ml-2" />
        </v-btn>
      </div>
    </div>

    <!-- 로그아웃 확인 -->
    <v-dialog v-model="confirmDialog" max-width="320">
      <v-card rounded="xl" class="glass-dialog">
        <v-card-title class="text-center pt-6">로그아웃</v-card-title>
        <v-card-text class="text-center text-medium-emphasis">정말 로그아웃 하시겠습니까?</v-card-text>
        <v-divider />
        <v-card-actions>
          <v-btn variant="text" block @click="confirmDialog = false">취소</v-btn>
          <v-btn color="error" block @click="logout">로그아웃</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 회원탈퇴 1단계 -->
    <v-dialog :model-value="deleteStep === 1" max-width="320" @update:model-value="closeDeleteDialog">
      <v-card rounded="xl" class="glass-dialog">
        <v-card-title class="text-center pt-6 text-error">회원탈퇴</v-card-title>
        <v-card-text class="text-center">
          <v-icon color="error" size="40" class="mb-3">mdi-alert-circle-outline</v-icon>
          <div class="mb-2 font-weight-medium">정말 탈퇴하시겠습니까?</div>
          <div class="text-medium-emphasis">
            탈퇴 시 계정과 연결된 모든 데이터<br>
            (투자 목표, 포트폴리오, 거래 내역 등)가<br>
            <strong>영구적으로 삭제</strong>되며 복구할 수 없습니다.
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-btn variant="text" block @click="closeDeleteDialog">취소</v-btn>
          <v-btn color="error" block @click="deleteStep = 2">계속</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 회원탈퇴 2단계 -->
    <v-dialog :model-value="deleteStep === 2" max-width="320" @update:model-value="closeDeleteDialog">
      <v-card rounded="xl" class="glass-dialog">
        <v-card-title class="text-center pt-6 text-error">최종 확인</v-card-title>
        <v-card-text>
          <form @submit.prevent="deleteAccount">
            <input
              type="text"
              :value="userEmail"
              autocomplete="username"
              readonly
              class="visually-hidden"
              tabindex="-1"
              aria-hidden="true"
            />
            <div class="text-medium-emphasis text-center mb-4">
              본인 확인을 위해 비밀번호를 입력해주세요.
            </div>
            <v-text-field
              v-model="deletePassword"
              type="password"
              autocomplete="current-password"
              label="비밀번호"
              variant="outlined"
              density="compact"
              rounded="lg"
              :error-messages="deletePasswordError"
              autofocus
            />
            <button type="submit" class="d-none" />
          </form>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-btn type="button" variant="text" block :disabled="deleteLoading" @click="closeDeleteDialog">취소</v-btn>
          <v-btn type="button" color="error" block :loading="deleteLoading" @click="deleteAccount">탈퇴</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 테마 선택 바텀 시트 -->
    <v-bottom-sheet v-model="themeSheet" max-width="480">
      <v-card class="theme-sheet glass-dialog" rounded="t-xl">
        <div class="sheet-handle" />

        <div class="px-5 pb-2 pt-1">
          <div class="sheet-title">테마 선택</div>
          <div class="sheet-desc">앱 전체에 적용되는 색상 테마를 선택하세요</div>
        </div>

        <div class="theme-grid px-5 pb-6">
          <button
            v-for="t in themes"
            :key="t.id"
            class="theme-card"
            :class="{ 'theme-card--active': currentThemeId === t.id }"
            :style="{ '--tc-primary': t.colors.primary, '--tc-bg': t.colors.background, '--tc-surface': t.colors.surface, '--tc-text': t.colors.onSurface }"
            @click="selectTheme(t.id)"
          >
            <div class="theme-preview">
              <div class="preview-bg">
                <div class="preview-card">
                  <div class="preview-dot preview-dot--primary" />
                  <div class="preview-lines">
                    <div class="preview-line preview-line--lg" />
                    <div class="preview-line preview-line--sm" />
                  </div>
                </div>
                <div class="preview-bar" />
              </div>
            </div>

            <div class="theme-card-body">
              <span class="theme-emoji">{{ t.emoji }}</span>
              <span class="theme-name">{{ t.label }}</span>
            </div>

            <div v-if="currentThemeId === t.id" class="theme-check">
              <v-icon size="14" color="white">mdi-check</v-icon>
            </div>
          </button>
        </div>
      </v-card>
    </v-bottom-sheet>
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

.hub-page {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 32px);
}

.bottom-menu {
  padding-bottom: env(safe-area-inset-bottom);
}

.hub-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
}
.hub-header-back {
  position: absolute;
  left: 0;
}

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
.back-btn:active {
  opacity: 0.6;
}

.header-logo-wide {
  height: 40px;
  width: auto;
  object-fit: contain;
}

.glass-card {
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
  border-radius: 20px;
}

.hub-card {
  cursor: pointer;
}

.hub-card-disabled {
  cursor: default;
  opacity: 0.5;
}

.coming-soon-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.5);
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 6px;
  padding: 2px 6px;
}

.hub-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chevron-icon {
  color: rgba(var(--v-theme-on-surface), 0.3);
}

.section-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.section-label-lg {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-on-surface));
  padding: 6px 0;
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

.delete-account-btn {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.delete-account-btn:active {
  opacity: 0.6;
}

/* ─── 테마 시트 ──────────────────────────────── */
.theme-sheet {
  border-top-left-radius: 24px !important;
  border-top-right-radius: 24px !important;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 99px;
  background: rgba(var(--v-theme-on-surface), 0.15);
  margin: 12px auto 16px;
}

.sheet-title {
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--fp-text);
  margin-bottom: 4px;
}

.sheet-desc {
  font-size: 0.8125rem;
  color: var(--fp-text-secondary);
  margin-bottom: 20px;
}

/* ─── 테마 카드 그리드 ─────────────────────── */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.theme-card {
  position: relative;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  border-radius: 16px;
  outline: none;
  transition: transform 0.15s ease;
}

.theme-card:active {
  transform: scale(0.96);
}

/* 선택된 카드 링 */
.theme-card--active .theme-preview {
  box-shadow: 0 0 0 2.5px var(--fp-primary);
}

/* 미니 프리뷰 박스 */
.theme-preview {
  border-radius: 14px;
  overflow: hidden;
  height: 80px;
  border: 1px solid var(--fp-outline);
  transition: box-shadow 0.2s ease;
}

.preview-bg {
  width: 100%;
  height: 100%;
  background-color: var(--tc-bg);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.preview-card {
  background: var(--tc-surface);
  border-radius: 6px;
  padding: 5px 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
}

.preview-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.preview-dot--primary {
  background: var(--tc-primary);
}

.preview-lines {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.preview-line {
  border-radius: 99px;
  background: var(--tc-text);
  opacity: 0.25;
}

.preview-line--lg {
  height: 4px;
  width: 70%;
}

.preview-line--sm {
  height: 3px;
  width: 45%;
}

.preview-bar {
  height: 5px;
  border-radius: 3px;
  background: var(--tc-primary);
  opacity: 0.5;
  width: 60%;
}

/* 카드 하단 텍스트 */
.theme-card-body {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 7px;
  padding: 0 2px;
}

.theme-emoji {
  font-size: 0.875rem;
  line-height: 1;
}

.theme-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--fp-text);
}

/* 선택 체크 뱃지 */
.theme-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--fp-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
