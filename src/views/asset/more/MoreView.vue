<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="d-flex justify-space-between align-center mb-3">
      <div class="d-flex align-center ga-2">
        <img src="/icons/icon-more.png" class="header-icon" :alt="$t('more.title')" />
        <div class="font-weight-bold">{{ $t('more.title') }}</div>
      </div>
      <button class="icon-btn" @click="router.push('/hub')">
        <img src="/icons/icon-hub.png" :alt="$t('common.hub')" class="icon-btn-img" />
        <span class="icon-btn-label">{{ $t('common.hub') }}</span>
      </button>
    </div>

    <!-- FIRE 관리 섹션 -->
    <div class="section-label mb-2">{{ $t('more.sectionFire') }}</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/goalSettings')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-target</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('more.goalSettings') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/fire-simulator')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-timeline-variant</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('more.simulator') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/fire-history')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-flag-checkered</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('more.history') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/badges')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-trophy-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('more.badges') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 자산 분석 섹션 -->
    <div class="section-label mb-2">{{ $t('more.sectionAnalysis') }}</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/portfolio-analysis')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-donut</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('more.portfolioAnalysis') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/asset-growth')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-bar</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('more.assetGrowth') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <!-- 투자 도구 섹션 -->
    <div class="section-label mb-2">{{ $t('more.sectionTools') }}</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/etf-analysis')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-chart-box-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('more.etfAnalysis') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/etf-backtest')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-history</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('more.etfBacktest') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/dividend-calendar')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-calendar-month-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('more.dividendCalendar') }}</div>
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

.icon-btn {
  background: rgba(var(--v-theme-primary), 0.1);
  border: none;
  padding: 4px 12px 4px 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  transition: opacity 0.15s ease;
}
.icon-btn:active { opacity: 0.6; }
.icon-btn-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}
.icon-btn-img {
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
