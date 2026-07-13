<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserDataStore } from '@/stores/userData'

const router = useRouter()
const route = useRoute()

// 가계부는 FIRE 목표와 무관하지만 기준통화(investment_goals.base_currency)는 공유하므로
// 진입 시 동기화해 둔다 — 금액 표시·집계 환산이 이 값을 따름 (BUDGET_GLOBALIZATION.md)
onMounted(() => {
  useUserDataStore().ensureGoals()
})

const tabs = [
  { label: '캘린더', route: '/budget', icon: null, activeIcon: null, img: '/icons/icon-calendar.png' },
  { label: '통계', route: '/budget/stats', icon: null, activeIcon: null, img: '/icons/icon-stats.png' },
  { label: '더보기', route: '/budget/more', icon: null, activeIcon: null, img: '/icons/icon-more.png' },
]

const isActive = (tabRoute: string) => route.path === tabRoute
</script>

<template>
  <div class="budget-layout">
    <main class="budget-content">
      <RouterView />
    </main>

    <nav class="bottom-nav">
      <button
        v-for="tab in tabs"
        :key="tab.route"
        class="bottom-nav-item"
        :class="{ active: isActive(tab.route) }"
        @click="router.push(tab.route)"
      >
        <img v-if="tab.img" :src="tab.img" class="tab-png-icon" :class="{ 'tab-png-active': isActive(tab.route) }" :alt="tab.label" />
        <v-icon v-else size="31">{{ isActive(tab.route) ? tab.activeIcon : tab.icon }}</v-icon>
        <span class="bottom-nav-label">{{ tab.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.budget-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.budget-content {
  flex: 1;
  min-height: 0;
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
  overflow-y: auto;
}

/* 홈 화면 추가(PWA) 모드에서만 하단 메뉴바 여유 추가 — 사파리 탭 모드는 그대로 유지 */
@media (display-mode: standalone) {
  .budget-content {
    padding-bottom: calc(82px + env(safe-area-inset-bottom));
  }
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(67px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  align-items: stretch;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  z-index: 100;
  backdrop-filter: blur(12px);
}

@media (display-mode: standalone) {
  .bottom-nav {
    height: calc(77px + env(safe-area-inset-bottom));
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
  }
}

.bottom-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.35);
  transition: color 0.15s ease;
  padding: 7px 5px;
}

.bottom-nav-item.active {
  color: rgb(var(--v-theme-primary));
}

.tab-png-icon {
  width: 31px;
  height: 31px;
  object-fit: contain;
  opacity: 0.35;
  transition: opacity 0.15s ease;
}

.tab-png-active {
  opacity: 1;
}

.bottom-nav-label {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
}
</style>
