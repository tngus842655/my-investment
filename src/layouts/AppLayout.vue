<script setup lang="ts">
import { ref, watch, nextTick, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/services/supabase'
import { ADMIN_EMAIL } from '@/config/admin'
import { activeRefreshHandler } from '@/composables/usePullToRefresh'
import { feedbackBadgeKey } from '@/composables/useFeedbackBadge'

const router = useRouter()
const route = useRoute()
const contentRef = ref<HTMLElement | null>(null)
const isAdmin = ref(false)
const unreadFeedbackCount = ref(0)
provide(feedbackBadgeKey, { isAdmin, unreadFeedbackCount })

// ── 아래로 당겨서 새로고침 ──────────────────────────
const PULL_THRESHOLD = 64
const MAX_PULL = 100
const pullDistance = ref(0)
const isPulling = ref(false)
const isRefreshing = ref(false)
let touchStartY = 0

// .app-content 자체는 내부적으로 스크롤되지 않는 경우가 많아
// scrollTop 대신 실제 스크롤이 일어나는 window 기준으로 최상단 여부를 판단
const isAtTop = () =>
  (contentRef.value?.scrollTop ?? 0) <= 0 && window.scrollY <= 0

const onPullTouchStart = (e: TouchEvent) => {
  if (!activeRefreshHandler.value || isRefreshing.value) return
  if (!isAtTop()) return
  touchStartY = e.touches[0]?.clientY ?? 0
  isPulling.value = true
}

const onPullTouchMove = (e: TouchEvent) => {
  if (!isPulling.value) return
  if (!isAtTop()) {
    isPulling.value = false
    pullDistance.value = 0
    return
  }
  const dy = (e.touches[0]?.clientY ?? 0) - touchStartY
  pullDistance.value = dy > 0 ? Math.min(dy * 0.5, MAX_PULL) : 0
}

const onPullTouchEnd = async () => {
  if (!isPulling.value) return
  isPulling.value = false
  if (pullDistance.value >= PULL_THRESHOLD && activeRefreshHandler.value) {
    isRefreshing.value = true
    pullDistance.value = PULL_THRESHOLD
    // 새로고침이 실제로 트리거되는 시점에 짧은 진동 (iOS Safari는 Vibration API 미지원이라 무동작)
    navigator.vibrate?.(15)
    try {
      await activeRefreshHandler.value()
    } finally {
      isRefreshing.value = false
      pullDistance.value = 0
    }
  } else {
    pullDistance.value = 0
  }
}

const fetchUnreadCount = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return
  isAdmin.value = user.email === ADMIN_EMAIL
  if (isAdmin.value) {
    const { count } = await supabase
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'RECEIVED')
    unreadFeedbackCount.value = count ?? 0
  } else {
    const { count } = await supabase
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('email', user.email ?? '')
      .eq('is_read_by_user', false)
    unreadFeedbackCount.value = count ?? 0
  }
}

fetchUnreadCount()

watch(() => route.path, async () => {
  await nextTick()
  contentRef.value?.scrollTo({ top: 0 })
  window.scrollTo({ top: 0 })
  // 의견 관련 화면에서 돌아올 때 뱃지 갱신
  if (route.path === '/more' || route.path === '/admin/feedback') fetchUnreadCount()
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
    <main
      ref="contentRef"
      class="app-content"
      @touchstart.passive="onPullTouchStart"
      @touchmove.passive="onPullTouchMove"
      @touchend.passive="onPullTouchEnd"
    >
      <div
        class="pull-indicator"
        :style="{ height: pullDistance + 'px', opacity: pullDistance > 0 || isRefreshing ? 1 : 0 }"
      >
        <v-progress-circular v-if="isRefreshing" indeterminate size="20" width="2" color="primary" />
        <v-icon
          v-else
          size="20"
          color="primary"
          :style="{ transform: `rotate(${Math.min(pullDistance / PULL_THRESHOLD, 1) * 180}deg)` }"
        >mdi-arrow-down</v-icon>
      </div>
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
        <div class="tab-icon-wrap" :class="{ 'tab-icon-active': isActive(tab.route) }" style="position:relative">
          <img v-if="tab.img" :src="tab.img" class="tab-png-icon" :class="{ 'tab-png-active': isActive(tab.route) }" :alt="tab.label" />
          <v-icon v-else size="26">{{ isActive(tab.route) ? tab.activeIcon : tab.icon }}</v-icon>
          <span v-if="tab.route === '/more' && unreadFeedbackCount > 0" class="nav-unread-dot" />
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
  overscroll-behavior-y: contain;
}

.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: opacity 0.15s ease;
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

.nav-unread-dot {
  position: absolute;
  top: 3px;
  right: 5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-error));
  border: 1.5px solid rgb(var(--v-theme-surface));
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
