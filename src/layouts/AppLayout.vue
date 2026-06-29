<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const contentRef = ref<HTMLElement | null>(null)

watch(() => route.path, async () => {
  await nextTick()
  contentRef.value?.scrollTo({ top: 0 })
  // window도 같이 초기화 (사파리 대응)
  window.scrollTo({ top: 0 })
})

const tabs = [
  { label: '홈', desc: '대시보드', icon: null, activeIcon: null, route: '/dashboard', img: '/icons/icon-home.png' },
  { label: '자산', desc: '보유 자산 한눈에', icon: null, activeIcon: null, route: '/portfolio', img: '/icons/icon-asset.png' },
  { label: '기록', desc: '매매 내역 관리', icon: null, activeIcon: null, route: '/transactions', img: '/icons/icon-record.png' },
  { label: '예측', desc: '목표 달성 시점', icon: null, activeIcon: null, route: '/analysis', img: '/icons/icon-predict.png' },
  { label: '더보기', desc: '설정 및 계정', icon: 'mdi-dots-horizontal', activeIcon: 'mdi-dots-horizontal', route: '/more', img: '/icons/icon-more.png' },
]

const isActive = (tabRoute: string) => route.path === tabRoute
</script>

<template>
  <div class="app-layout">
    <main ref="contentRef" class="app-content">
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
          <img v-if="tab.img" :src="tab.img" class="tab-png-icon" :class="{ 'tab-png-active': isActive(tab.route) }" :alt="tab.label" />
          <v-icon v-else size="26">{{ isActive(tab.route) ? tab.activeIcon : tab.icon }}</v-icon>
        </div>
        <span class="bottom-nav-label">{{ tab.label }}</span>
        <span class="bottom-nav-desc">{{ tab.desc }}</span>
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
  padding-bottom: calc(84px + env(safe-area-inset-bottom));
  overflow-y: auto;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(76px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  align-items: stretch;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  z-index: 100;
  backdrop-filter: blur(12px);
  transition:
    background     300ms ease,
    border-color   300ms ease,
    box-shadow     300ms ease;
}

/* 🌙 Dark */
.v-theme--dark .bottom-nav {
  background: rgba(13, 21, 32, 0.96);
  border-top-color: rgba(var(--v-theme-on-surface), 0.07);
}

/* 🚀 Space */
.v-theme--space .bottom-nav {
  background: rgba(8, 15, 30, 0.96);
  border-top-color: rgba(0, 212, 184, 0.15);
  box-shadow: 0 -1px 12px rgba(0, 212, 184, 0.05);
}

/* 🌿 Nature */
.v-theme--nature .bottom-nav {
  border-top-color: rgba(45, 158, 107, 0.15);
}

/* 👑 Gold */
.v-theme--gold .bottom-nav {
  background: rgba(17, 16, 9, 0.97);
  border-top-color: rgba(201, 153, 58, 0.1);
  box-shadow: none;
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
  padding: 10px 4px 6px;
}

.bottom-nav-item.active {
  color: rgb(var(--v-theme-primary));
}

.tab-icon-wrap {
  width: 44px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  transition: background 0.15s ease;
  margin-bottom: 2px;
}

.tab-icon-active {
  background: rgba(var(--v-theme-primary), 0.12);
}

.tab-png-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  opacity: 0.35;
  transition: opacity 0.15s ease;
}

.tab-png-active {
  opacity: 1;
}

.bottom-nav-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
}

.bottom-nav-desc {
  font-size: 9px;
  font-weight: 400;
  opacity: 0.6;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60px;
}
</style>
