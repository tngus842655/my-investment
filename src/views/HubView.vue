<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDesignTokens } from '@/composables/useDesignTokens'
import { supabase } from '@/services/supabase'
import { isAdminEmail, isBudgetPreviewAllowed } from '@/config/admin'

const router = useRouter()
const { themeId } = useDesignTokens()

const canAccessBudget = ref(false)
const isAdmin = ref(false)
const unreadFeedbackCount = ref(0)

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

const serviceOpen = ref(false)
const settingsOpen = ref(false)

const showBack = ref(false)
onMounted(async () => {
  showBack.value = window.history.state?.back != null && window.history.state.back !== '/'
  const { data: { user } } = await supabase.auth.getUser()
  canAccessBudget.value = isBudgetPreviewAllowed(user?.email)
  if (user) await fetchUnreadFeedbackCount(user)
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="hub-header mb-6">
      <button v-if="showBack" class="back-btn hub-header-back" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <img v-if="logoWide" :src="logoWide" class="header-logo-wide" alt="FIREPATH" />
      <div v-else class="font-weight-bold text-h6">Fire Path</div>
    </div>

    <div class="d-flex flex-column ga-2">
      <div class="hub-card glass-card pa-3 d-flex align-center ga-3" @click="router.push('/dashboard')">
        <div class="hub-icon"><v-icon size="24" color="primary">mdi-finance</v-icon></div>
        <div>
          <div class="font-weight-medium">자산관리</div>
          <div class="text-medium-emphasis">투자 포트폴리오·FIRE 목표 관리</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div
        class="hub-card glass-card pa-3 d-flex align-center ga-3"
        :class="{ 'hub-card-disabled': !canAccessBudget }"
        @click="canAccessBudget && router.push('/budget')"
      >
        <div class="hub-icon"><v-icon size="24" color="primary">mdi-notebook-outline</v-icon></div>
        <div>
          <div class="d-flex align-center ga-2">
            <div class="font-weight-medium">가계부</div>
            <div v-if="!canAccessBudget" class="coming-soon-badge">준비중</div>
          </div>
          <div class="text-medium-emphasis">수입·지출 기록 관리</div>
        </div>
        <v-spacer />
        <v-icon v-if="canAccessBudget" size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 서비스 -->
    <div class="glass-card pa-4 mt-3">
      <div class="section-label d-flex align-center justify-space-between cursor-pointer" @click="serviceOpen = !serviceOpen">
        <span>서비스</span>
        <v-icon size="18" class="collapse-icon" :class="{ 'collapse-icon-open': serviceOpen }">mdi-chevron-down</v-icon>
      </div>
      <div v-if="serviceOpen" class="mt-3">
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
    <div class="glass-card pa-4 mt-3">
      <div class="section-label d-flex align-center justify-space-between cursor-pointer" @click="settingsOpen = !settingsOpen">
        <span>설정</span>
        <v-icon size="18" class="collapse-icon" :class="{ 'collapse-icon-open': settingsOpen }">mdi-chevron-down</v-icon>
      </div>
      <div v-if="settingsOpen" class="mt-3">
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-lock-reset" class="mb-2" @click="router.push('/change-password')">
          비밀번호 변경
        </v-btn>
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-cellphone-cog" @click="router.push('/display-settings')">
          화면 설정
        </v-btn>
      </div>
    </div>

    <!-- 관리자 -->
    <div v-if="isAdmin" class="glass-card pa-4 mt-3">
      <div class="section-label mb-3">관리자</div>
      <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-shield-crown-outline" @click="router.push('/admin')">
        관리자 페이지
        <v-badge v-if="unreadFeedbackCount > 0" :content="unreadFeedbackCount" color="error" inline class="ml-2" />
      </v-btn>
    </div>
  </v-container>
</template>

<style scoped>
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
</style>
