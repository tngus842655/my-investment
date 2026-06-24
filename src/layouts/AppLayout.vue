<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const tabs = [
  { label: '홈', icon: 'mdi-home-outline', activeIcon: 'mdi-home', route: '/dashboard' },
  { label: '자산', icon: 'mdi-chart-line', activeIcon: 'mdi-chart-line', route: '/portfolio' },
  { label: '기록', icon: 'mdi-swap-horizontal', activeIcon: 'mdi-swap-horizontal', route: '/transactions' },
  { label: '예측', icon: 'mdi-chart-timeline-variant', activeIcon: 'mdi-chart-timeline-variant', route: '/analysis' },
  { label: '더보기', icon: 'mdi-dots-horizontal', activeIcon: 'mdi-dots-horizontal', route: '/more' },
]

const isActive = (tabRoute: string) => route.path === tabRoute
</script>

<template>
  <div class="app-layout">
    <main class="app-content">
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
        <div class="tab-icon-wrap" :class="{ 'tab-icon-active': isActive(tab.route) }">
          <v-icon size="20">{{ isActive(tab.route) ? tab.activeIcon : tab.icon }}</v-icon>
        </div>
        <span class="bottom-nav-label">{{ tab.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.app-content {
  flex: 1;
  padding-bottom: calc(68px + env(safe-area-inset-bottom));
  overflow-y: auto;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(60px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  align-items: stretch;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  z-index: 100;
  backdrop-filter: blur(12px);
}

.v-theme--dark .bottom-nav {
  background: rgba(15, 28, 53, 0.95);
  border-top-color: rgba(0, 212, 184, 0.1);
}

.bottom-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.35);
  transition: color 0.15s ease;
  padding: 8px 0 4px;
}

.bottom-nav-item.active {
  color: rgb(var(--v-theme-primary));
}

.tab-icon-wrap {
  width: 36px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  transition: background 0.15s ease;
}

.tab-icon-active {
  background: rgba(0, 212, 184, 0.12);
}

.v-theme--light .tab-icon-active {
  background: rgba(12, 168, 153, 0.12);
}

.bottom-nav-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.01em;
}
</style>
