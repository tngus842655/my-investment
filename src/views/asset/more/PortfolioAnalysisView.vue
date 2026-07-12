<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PortfolioAssetClassPanel from './PortfolioAssetClassPanel.vue'
import PortfolioBubblePanel from './PortfolioBubblePanel.vue'
import PortfolioComparePanel from './PortfolioComparePanel.vue'

const router = useRouter()
const { t } = useI18n()
// 0: 자산분포(도넛), 1: 종목구성(버블, 기본 화면), 2: 종목비교(막대)
const page = ref(1)
const pageNames = computed(() => [
  t('portfolioAnalysis.pageAssetClass'),
  t('portfolioAnalysis.pageBubble'),
  t('portfolioAnalysis.pageCompare'),
])
</script>

<template>
  <div class="analysis-page">
    <div class="analysis-header">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" style="color: rgb(var(--v-theme-on-surface))" @click="router.back()" />
      <div class="header-title">{{ $t('portfolioAnalysis.title') }}</div>
    </div>

    <v-window v-model="page" class="analysis-window" touch>
      <v-window-item :value="0">
        <PortfolioAssetClassPanel />
      </v-window-item>
      <v-window-item :value="1">
        <PortfolioBubblePanel />
      </v-window-item>
      <v-window-item :value="2">
        <PortfolioComparePanel />
      </v-window-item>
    </v-window>

    <div class="indicator-bar">
      <button
        v-for="(name, i) in pageNames"
        :key="i"
        class="page-tab"
        :class="{ 'page-tab-active': page === i }"
        @click="page = i"
      >
        <span class="page-name">{{ name }}</span>
        <span class="page-underline" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.analysis-page {
  position: relative;
  display: flex;
  flex-direction: column;
  /* 부모(.app-content)는 스크롤 컨테이너라 height:100%가 안 먹음 —
     뷰포트에서 헤더·하단 탭바 영역을 뺀 높이로 직접 계산해 화면을 꽉 채움 */
  height: calc(100dvh - 52px - 72px - env(safe-area-inset-bottom));
}

/* 홈 화면 추가(PWA) 모드는 하단 탭바가 더 큼 (AssetLayout과 동일 값) */
@media (display-mode: standalone) {
  .analysis-page {
    height: calc(100dvh - 52px - 82px - env(safe-area-inset-bottom));
  }
}

.analysis-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  height: 52px;
  flex-shrink: 0;
}
.header-title {
  font-weight: 700;
}

.analysis-window {
  flex: 1;
  min-height: 0;
}
.analysis-window :deep(.v-window__container),
.analysis-window :deep(.v-window-item) {
  height: 100%;
}

.indicator-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 6px 8px calc(8px + env(safe-area-inset-bottom));
  flex-shrink: 0;
}
.page-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex: 1;
  max-width: 120px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
}
.page-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.4);
  transition: color 0.2s ease;
  white-space: nowrap;
}
.page-underline {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.18);
  transition: all 0.25s ease;
}
.page-tab-active .page-name {
  color: rgb(var(--v-theme-primary));
}
.page-tab-active .page-underline {
  width: 20px;
  height: 3px;
  border-radius: 2px;
  background: rgb(var(--v-theme-primary));
}
</style>
