<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PortfolioAssetClassPanel from './PortfolioAssetClassPanel.vue'
import PortfolioBubblePanel from './PortfolioBubblePanel.vue'
import PortfolioComparePanel from './PortfolioComparePanel.vue'

const router = useRouter()
// 0: 자산군별, 1: 종목별(버블, 기본 화면), 2: 종목 비교
const page = ref(1)
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

    <div class="dots-bar">
      <button
        v-for="i in [0, 1, 2]"
        :key="i"
        class="dot"
        :class="{ 'dot-active': page === i }"
        :aria-label="`page-${i}`"
        @click="page = i"
      />
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

.dots-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
  flex-shrink: 0;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: none;
  background: rgba(var(--v-theme-on-surface), 0.2);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}
.dot-active {
  width: 18px;
  border-radius: 4px;
  background: rgb(var(--v-theme-primary));
}
</style>
