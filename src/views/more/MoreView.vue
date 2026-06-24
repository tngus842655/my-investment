<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useAppTheme } from '@/composables/useAppTheme'

const router = useRouter()
const { isDark, toggleTheme } = useAppTheme()
const confirmDialog = ref(false)

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

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3 menu-disabled">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-chart-timeline-variant</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">FIRE 시뮬레이터</div>
          <div class="text-caption text-medium-emphasis">투자금·수익률 변경 시 달성일 비교</div>
        </div>
        <v-spacer />
        <v-chip size="x-small" color="primary" variant="tonal">준비중</v-chip>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3 menu-disabled">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-flag-checkered</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">FIRE 진행 기록</div>
          <div class="text-caption text-medium-emphasis">목표 달성률 변화 히스토리</div>
        </div>
        <v-spacer />
        <v-chip size="x-small" color="primary" variant="tonal">준비중</v-chip>
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

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3 menu-disabled">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-chart-bar</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">자산 성장 리포트</div>
          <div class="text-caption text-medium-emphasis">월별 자산 증가 추이</div>
        </div>
        <v-spacer />
        <v-chip size="x-small" color="primary" variant="tonal">준비중</v-chip>
      </div>
    </div>

    <!-- 설정 섹션 -->
    <div class="section-label mb-2">설정</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3 menu-disabled">
        <div class="menu-icon">
          <v-icon size="18" color="primary">mdi-cloud-outline</v-icon>
        </div>
        <div>
          <div class="text-body-2 font-weight-medium">백업 및 복원</div>
          <div class="text-caption text-medium-emphasis">데이터 백업 및 복원</div>
        </div>
        <v-spacer />
        <v-chip size="x-small" color="primary" variant="tonal">준비중</v-chip>
      </div>

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
    </div>
  </v-container>

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
  mix-blend-mode: multiply;
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
</style>
