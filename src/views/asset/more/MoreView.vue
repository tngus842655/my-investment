<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useAppTheme } from '@/composables/useAppTheme'
import { useUserDataStore } from '@/stores/userData'

const router = useRouter()
const { currentThemeId, themes, setTheme } = useAppTheme()
const userDataStore = useUserDataStore()
const confirmDialog = ref(false)
const themeSheet = ref(false)

// 회원탈퇴 상태
const deleteStep = ref(0)
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

const logout = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    showMessage('로그아웃 중 오류가 발생했습니다.', 'error')
    return
  }
  userDataStore.reset()
  router.replace('/')
}

const selectTheme = (id: string) => {
  setTheme(id as Parameters<typeof setTheme>[0])
  themeSheet.value = false
}

const currentThemeLabel = computed(() => {
  const t = themes.find(t => t.id === currentThemeId.value)
  return t ? `${t.emoji} ${t.label}` : ''
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="d-flex align-center ga-2 mb-6">
      <img src="/icons/icon-more.png" class="header-icon" alt="더보기" />
      <div>
        <div class="font-weight-bold">더보기</div>
        <div class="text-medium-emphasis">설정 및 계정 관리</div>
      </div>
    </div>

    <!-- 다른 서비스 -->
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

    <!-- FIRE 관리 섹션 -->
    <div class="section-label mb-2">FIRE 관리</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/goalSettings')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-target</v-icon></div>
        <div>
          <div class="font-weight-medium">FIRE 목표 설정</div>
          <div class="text-medium-emphasis">목표 자산·월 투자금·수익률 수정</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/fire-simulator')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-timeline-variant</v-icon></div>
        <div>
          <div class="font-weight-medium">FIRE 시뮬레이터</div>
          <div class="text-medium-emphasis">투자금·수익률 변경 시 달성일 비교</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/fire-history')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-flag-checkered</v-icon></div>
        <div>
          <div class="font-weight-medium">FIRE 진행 기록</div>
          <div class="text-medium-emphasis">목표 달성률 변화 히스토리</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/badges')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-trophy-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">목표 달성 배지</div>
          <div class="text-medium-emphasis">FIRE 달성률 구간별 업적</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 자산 분석 섹션 -->
    <div class="section-label mb-2">자산 분석</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/portfolio-analysis')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-donut</v-icon></div>
        <div>
          <div class="font-weight-medium">포트폴리오 분석</div>
          <div class="text-medium-emphasis">종목별 비중 도넛 차트</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/asset-growth')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-bar</v-icon></div>
        <div>
          <div class="font-weight-medium">자산 성장 리포트</div>
          <div class="text-medium-emphasis">월별 자산 증가 추이</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 투자 도구 섹션 -->
    <div class="section-label mb-2">투자 도구</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/etf-analysis')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-box-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">ETF 분석&amp;비교</div>
          <div class="text-medium-emphasis">CAGR · MDD · 변동성 · 배당률 · 운용보수</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/etf-backtest')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-history</v-icon></div>
        <div>
          <div class="font-weight-medium">ETF 백테스트</div>
          <div class="text-medium-emphasis">과거 DCA 투자 수익률 시뮬레이션</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/dividend-calendar')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-calendar-month-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">배당 캘린더</div>
          <div class="text-medium-emphasis">배당락일 · 지급일 일정 확인</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 설정 섹션 -->
    <div class="section-label mb-2">설정</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="themeSheet = true">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-palette-outline</v-icon>
        </div>
        <div>
          <div class="font-weight-medium">테마 선택</div>
          <div class="text-medium-emphasis">현재: {{ currentThemeLabel }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 계정 섹션 -->
    <div class="section-label mb-2">계정</div>
    <div class="d-flex flex-column ga-2">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="confirmDialog = true">
        <div class="menu-icon menu-icon-error">
          <v-icon size="18" color="error">mdi-logout</v-icon>
        </div>
        <div>
          <div class="font-weight-medium text-error">로그아웃</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="text-center mt-2">
        <span class="delete-account-btn" @click="openDeleteDialog">회원탈퇴</span>
      </div>
    </div>
  </v-container>

  <!-- ───────────────────────────────────────────────────
       테마 선택 바텀 시트
  ──────────────────────────────────────────────────── -->
  <v-bottom-sheet v-model="themeSheet" max-width="480">
    <v-card class="theme-sheet glass-dialog" rounded="t-xl">
      <!-- 핸들 -->
      <div class="sheet-handle" />

      <div class="px-5 pb-2 pt-1">
        <div class="sheet-title">테마 선택</div>
        <div class="sheet-desc">앱 전체에 적용되는 색상 테마를 선택하세요</div>
      </div>

      <!-- 테마 카드 그리드 -->
      <div class="theme-grid px-5 pb-6">
        <button
          v-for="t in themes"
          :key="t.id"
          class="theme-card"
          :class="{ 'theme-card--active': currentThemeId === t.id }"
          :style="{ '--tc-primary': t.colors.primary, '--tc-bg': t.colors.background, '--tc-surface': t.colors.surface, '--tc-text': t.colors.onSurface }"
          @click="selectTheme(t.id)"
        >
          <!-- 미니 앱 프리뷰 -->
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

          <!-- 테마 정보 -->
          <div class="theme-card-body">
            <span class="theme-emoji">{{ t.emoji }}</span>
            <span class="theme-name">{{ t.label }}</span>
          </div>

          <!-- 선택 체크 -->
          <div v-if="currentThemeId === t.id" class="theme-check">
            <v-icon size="14" color="white">mdi-check</v-icon>
          </div>
        </button>
      </div>
    </v-card>
  </v-bottom-sheet>

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
        <div class="text-medium-emphasis text-center mb-4">
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
        <v-btn color="error" block :disabled="!deleteEmailValid || deleteLoading" :loading="deleteLoading" @click="deleteAccount">탈퇴</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

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
</template>

<style scoped>
.header-icon {
  width: 32px;
  height: 32px;
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

.menu-disabled {
  cursor: default;
  opacity: 0.6;
}

.menu-disabled:active {
  opacity: 0.6;
}

.chevron-icon {
  color: rgba(var(--v-theme-on-surface), 0.3);
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
