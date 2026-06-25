<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useTheme } from 'vuetify'
import GlobalSnackbar from '@/components/common/GlobalSnackbar.vue'
import { useAppTheme } from '@/composables/useAppTheme'

const theme = useTheme()
const { initTheme } = useAppTheme()

onMounted(() => {
  initTheme()
})
</script>

<template>
  <div class="app-bg" :class="theme.global.name.value">
    <RouterView />
    <GlobalSnackbar />
  </div>
</template>

<style>
* {
  -webkit-tap-highlight-color: transparent;
}

.app-bg {
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

.app-bg.dark {
  background: #080f1e;
}

.app-bg.light {
  background: #eef4fb;
}

/* 전역 스크롤바 (다크) */
.app-bg.dark ::-webkit-scrollbar {
  width: 4px;
}
.app-bg.dark ::-webkit-scrollbar-track {
  background: transparent;
}
.app-bg.dark ::-webkit-scrollbar-thumb {
  background: rgba(0, 212, 184, 0.2);
  border-radius: 99px;
}

/* Vuetify 컴포넌트 전역 오버라이드 */
.v-skeleton-loader__bone {
  background: rgba(255, 255, 255, 0.06) !important;
}
.v-theme--dark .v-skeleton-loader__bone {
  background: rgba(255, 255, 255, 0.06) !important;
}
.v-theme--light .v-skeleton-loader__bone {
  background: rgba(0, 0, 0, 0.08) !important;
}
</style>
