<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
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

// 좌우로 넘길 수 있다는 걸 처음 방문 때 1회만 안내 (탭 전환 시 즉시 사라짐)
const SWIPE_HINT_KEY = 'firepath-portfolio-analysis-swipe-hint'
const showSwipeHint = ref(false)
let hintTimer: ReturnType<typeof setTimeout> | null = null
const dismissHint = () => {
  if (!showSwipeHint.value) return
  showSwipeHint.value = false
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null }
}
onMounted(() => {
  if (localStorage.getItem(SWIPE_HINT_KEY)) return
  localStorage.setItem(SWIPE_HINT_KEY, '1')
  showSwipeHint.value = true
  hintTimer = setTimeout(dismissHint, 3500)
})
watch(page, dismissHint)
</script>

<template>
  <div class="analysis-page">
    <div class="analysis-header">
      <v-btn class="back-btn" icon="mdi-arrow-left" variant="text" size="small" style="color: rgb(var(--v-theme-on-surface))" @click="router.back()" />
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

    <Transition name="hint-fade">
      <div v-if="showSwipeHint" class="swipe-hint" @click="dismissHint">
        <v-icon size="16">mdi-gesture-swipe-horizontal</v-icon>
        <span>{{ $t('portfolioAnalysis.swipeHint') }}</span>
      </div>
    </Transition>

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
  /* 부모(.app-content)는 스크롤 컨테이너(padding-bottom: 72px+safe로 탭바 자리 확보)라
     height:100%가 안 먹음 — 뷰포트에서 탭바 영역만 뺀 높이로 채움. 헤더(52px)는
     이 페이지 안쪽 자식이라 별도로 빼지 않는다 */
  height: calc(100dvh - 72px - env(safe-area-inset-bottom));
}

/* 홈 화면 추가(PWA) 모드는 하단 탭바가 더 큼 (AssetLayout과 동일 값) */
@media (display-mode: standalone) {
  .analysis-page {
    height: calc(100dvh - 82px - env(safe-area-inset-bottom));
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

.swipe-hint {
  position: absolute;
  bottom: 52px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 99px;
  background: rgba(var(--v-theme-primary), 0.92);
  color: rgb(var(--v-theme-on-primary));
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  z-index: 2;
  pointer-events: auto;
  cursor: pointer;
}
.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.indicator-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 8px;
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
