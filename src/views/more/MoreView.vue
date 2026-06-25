<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useAppTheme } from '@/composables/useAppTheme'

const ADMIN_EMAIL = 'tngus842655@gmail.com'

const router = useRouter()
const { isDark, toggleTheme } = useAppTheme()
const confirmDialog = ref(false)
const isAdmin = ref(false)

supabase.auth.getUser().then(({ data: { user } }) => {
  isAdmin.value = user?.email === ADMIN_EMAIL
})

// 회원탈퇴 상태
const deleteStep = ref(0) // 0: 닫힘, 1: 경고, 2: 이메일 확인
const deleteEmailInput = ref('')
const deleteLoading = ref(false)
const currentUserEmail = ref('')

const deleteEmailValid = computed(() =>
  deleteEmailInput.value.trim() === currentUserEmail.value,
)

const openDeleteDialog = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  currentUserEmail.value = user?.email ?? ''
  deleteEmailInput.value = ''
  deleteStep.value = 1
}

const closeDeleteDialog = () => {
  deleteStep.value = 0
  deleteEmailInput.value = ''
}

const deleteAccount = async () => {
  if (!deleteEmailValid.value) return
  deleteLoading.value = true
  try {
    const { error } = await supabase.rpc('delete_user_account')
    if (error) throw error

    // 탈퇴 시점 기록
    await supabase
      .from('signup_log')
      .update({ deleted_at: new Date().toISOString() })
      .eq('email', currentUserEmail.value)
      .is('deleted_at', null)

    await supabase.auth.signOut()
    showMessage('계정이 삭제되었습니다.', 'success')
    router.replace('/')
  } catch {
    showMessage('계정 삭제 중 오류가 발생했습니다.', 'error')
  } finally {
    deleteLoading.value = false
  }
}

const logout = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    showMessage('로그아웃 중 오류가 발생했습니다.', 'error')
    return
  }
  router.replace('/')
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="d-flex align-center ga-2 mb-6">
      <img src="/icons/icon-more.png" class="header-icon" alt="더보기" />
      <div>
        <div class="text-h5 font-weight-bold">더보기</div>
        <div class="text-body-2 text-medium-emphasis">설정 및 계정 관리</div>
      </div>
    </div>

    <!-- FIRE 관리 섹션 -->
    <div class="section-label mb-2">FIRE 관리</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/goalSettings')">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-target</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">FIRE 목표 설정</div>
          <div class="text-caption text-medium-emphasis">목표 자산·월 투자금·수익률 수정</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/fire-simulator')">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-chart-timeline-variant</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">FIRE 시뮬레이터</div>
          <div class="text-caption text-medium-emphasis">투자금·수익률 변경 시 달성일 비교</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/fire-history')">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-flag-checkered</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">FIRE 진행 기록</div>
          <div class="text-caption text-medium-emphasis">목표 달성률 변화 히스토리</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/badges')">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-trophy-outline</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">목표 달성 배지</div>
          <div class="text-caption text-medium-emphasis">FIRE 달성률 구간별 업적</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 자산 분석 섹션 -->
    <div class="section-label mb-2">자산 분석</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/portfolio-analysis')">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-chart-donut</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">포트폴리오 분석</div>
          <div class="text-caption text-medium-emphasis">종목별 비중 도넛 차트</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/asset-growth')">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-chart-bar</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">자산 성장 리포트</div>
          <div class="text-caption text-medium-emphasis">월별 자산 증가 추이</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 투자 도구 섹션 -->
    <div class="section-label mb-2">투자 도구</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/etf-analysis')">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-chart-box-outline</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">ETF 분석&비교</div>
          <div class="text-caption text-medium-emphasis">CAGR · MDD · 변동성 · 배당률 · 운용보수</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3 menu-disabled">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-history</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">ETF 백테스트</div>
          <div class="text-caption text-medium-emphasis">과거 데이터 기반 수익률 시뮬레이션</div>
        </div>
        <v-spacer />
        <v-chip size="x-small" color="primary" variant="tonal">준비중</v-chip>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/dividend-calendar')">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-calendar-month-outline</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">배당 캘린더</div>
          <div class="text-caption text-medium-emphasis">배당락일 · 지급일 일정 확인</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 설정 섹션 -->
    <div class="section-label mb-2">설정</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="toggleTheme">
        <div class="menu-icon">
          <v-icon size="18" color="primary">{{ isDark() ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">테마 변경</div>
          <div class="text-caption text-medium-emphasis">{{ isDark() ? '라이트 모드로 전환' : '다크 모드로 전환' }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 관리자 섹션 -->
    <template v-if="isAdmin">
      <div class="section-label mb-2">관리자</div>
      <div class="d-flex flex-column ga-2 mb-5">
        <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/admin')">
          <div class="menu-icon">
            <v-icon size="18" color="primary">mdi-shield-crown-outline</v-icon>
          </div>
          <div>
            <div class="text-body-2 font-weight-medium">관리자 페이지</div>
            <div class="text-caption text-medium-emphasis">회원 가입 이력 조회</div>
          </div>
          <v-spacer />
          <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
        </div>
      </div>
    </template>

    <!-- 계정 섹션 -->
    <div class="section-label mb-2">계정</div>
    <div class="d-flex flex-column ga-2">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="confirmDialog = true">
        <div class="menu-icon menu-icon-error">
          <v-icon size="18" color="error">mdi-logout</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium text-error">로그아웃</div>
        </div>
        <v-spacer />
        <v-icon size="16" style="color: rgba(var(--v-theme-on-surface), 0.35)">mdi-chevron-right</v-icon>
      </div>

      <div class="text-center mt-2">
        <span class="delete-account-btn" @click="openDeleteDialog">회원탈퇴</span>
      </div>
    </div>
  </v-container>

  <!-- 회원탈퇴 1단계: 경고 -->
  <v-dialog :model-value="deleteStep === 1" max-width="320" @update:model-value="closeDeleteDialog">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-6 text-error">회원탈퇴</v-card-title>
      <v-card-text class="text-center">
        <v-icon color="error" size="40" class="mb-3">mdi-alert-circle-outline</v-icon>
        <div class="text-body-2 mb-2 font-weight-medium">정말 탈퇴하시겠습니까?</div>
        <div class="text-caption text-medium-emphasis">
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

  <!-- 회원탈퇴 2단계: 이메일 재입력 -->
  <v-dialog :model-value="deleteStep === 2" max-width="320" @update:model-value="closeDeleteDialog">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-6 text-error">최종 확인</v-card-title>
      <v-card-text>
        <div class="text-caption text-medium-emphasis text-center mb-4">
          본인 확인을 위해 이메일 주소를 입력해주세요.
        </div>
        <v-text-field
          v-model="deleteEmailInput"
          placeholder="이메일 주소 입력"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          @keyup.enter="deleteAccount"
        />
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn variant="text" block @click="closeDeleteDialog">취소</v-btn>
        <v-btn
          color="error"
          block
          :disabled="!deleteEmailValid || deleteLoading"
          :loading="deleteLoading"
          @click="deleteAccount"
        >탈퇴</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

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
</template>

<style scoped>
.header-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
  padding: 0 4px;
}

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
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
.menu-disabled {
  cursor: default;
  opacity: 0.6;
}
.menu-disabled:active {
  opacity: 0.6;
}
.glass-dialog {
  background: rgb(var(--v-theme-surface)) !important;
}
.delete-account-btn {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.delete-account-btn:active {
  opacity: 0.6;
}
</style>
