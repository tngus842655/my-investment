<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const tabs = [
  { label: '홈', icon: 'mdi-home', route: '/dashboard' },
  { label: '자산', icon: 'mdi-chart-line', route: '/portfolio' },
  { label: '기록', icon: 'mdi-swap-horizontal', route: '/transactions' },
  { label: '분석', icon: 'mdi-chart-pie', route: '/analysis' },
  { label: '더보기', icon: 'mdi-dots-horizontal', route: '/more' },
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
        <v-icon size="22">{{ tab.icon }}</v-icon>
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
}

.app-content {
  flex: 1;
  padding-bottom: 72px;
  overflow-y: auto;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  display: flex;
  align-items: stretch;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
}

.v-theme--dark .bottom-nav {
  border-top-color: rgba(93, 214, 207, 0.12);
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
  color: rgba(var(--v-theme-on-surface), 0.4);
  transition: color 0.15s ease;
  padding: 0;
}

.bottom-nav-item.active {
  color: rgb(var(--v-theme-primary));
}

.bottom-nav-item:active {
  opacity: 0.7;
}

.bottom-nav-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.01em;
}
</style>
