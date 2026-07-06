<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="d-flex align-center ga-2 mb-6">
      <img src="/icons/icon-more.png" class="header-icon" alt="더보기" />
      <div class="font-weight-bold">더보기</div>
    </div>

    <!-- 다른 서비스 -->
    <div class="section-label mb-2">다른 서비스</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/hub')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-view-grid-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">서비스 홈</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- FIRE 관리 섹션 -->
    <div class="section-label mb-2">FIRE 관리</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/goalSettings')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-target</v-icon></div>
        <div>
          <div class="font-weight-medium">FIRE 목표 설정</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/fire-simulator')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-timeline-variant</v-icon></div>
        <div>
          <div class="font-weight-medium">FIRE 시뮬레이터</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/fire-history')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-flag-checkered</v-icon></div>
        <div>
          <div class="font-weight-medium">FIRE 진행 기록</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/badges')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-trophy-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">목표 달성 배지</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 자산 분석 섹션 -->
    <div class="section-label mb-2">자산 분석</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/portfolio-analysis')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-donut</v-icon></div>
        <div>
          <div class="font-weight-medium">포트폴리오 분석</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/asset-growth')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-bar</v-icon></div>
        <div>
          <div class="font-weight-medium">자산 성장 리포트</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 투자 도구 섹션 -->
    <div class="section-label mb-2">투자 도구</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/etf-analysis')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-box-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">ETF 분석&amp;비교</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/etf-backtest')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-history</v-icon></div>
        <div>
          <div class="font-weight-medium">ETF 백테스트</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/dividend-calendar')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-calendar-month-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">배당 캘린더</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>
  </v-container>
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
</style>
