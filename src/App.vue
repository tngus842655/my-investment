<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useTheme } from 'vuetify'
import GlobalSnackbar from '@/components/common/GlobalSnackbar.vue'
import { useAppTheme } from '@/composables/useAppTheme'
import { useFontScale } from '@/composables/useFontScale'

const theme = useTheme()
const { initTheme } = useAppTheme()
const { initFontScale } = useFontScale()

onMounted(() => {
  initTheme()
  initFontScale()
})
</script>

<template>
  <div class="app-bg" :class="theme.global.name.value">
    <RouterView />
    <GlobalSnackbar />
  </div>
</template>

<style>
/* ── 배경 기본 ─────────────────────────────────────────────── */
.app-bg {
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  /* transition은 theme.css에서 선언 */
}

/* ── ☀️ Light — 깔끔한 화이트-블루 ─────────────────────────── */
.app-bg.light {
  background: linear-gradient(160deg, #F4F8FC 0%, #ECF3FB 100%);
}

/* ── 🌙 Dark — 절제된 딥 네이비 ────────────────────────────── */
.app-bg.dark {
  background: linear-gradient(160deg, #0D1520 0%, #091018 100%);
}

/* ── 🌿 Nature — 연한 그린 그라데이션 ──────────────────────── */
.app-bg.nature {
  background: linear-gradient(160deg, #EFF7F2 0%, #E5F2EA 60%, #EAF5EE 100%);
}

/* ── 🚀 Space — 은은한 Nebula (성운) 느낌 ─────────────────── */
.app-bg.space {
  background:
    radial-gradient(ellipse at 15% 20%, rgba(0, 212, 184, 0.05) 0%, transparent 45%),
    radial-gradient(ellipse at 85% 75%, rgba(124, 111, 205, 0.07) 0%, transparent 45%),
    radial-gradient(ellipse at 50% 50%, rgba(0, 80, 140, 0.04) 0%, transparent 65%),
    #080F1E;
}

/* ── 👑 Gold — 극도로 절제된 다크, 상단 아주 은은한 warm glow */
.app-bg.gold {
  background:
    radial-gradient(ellipse at 50% -10%, rgba(201, 153, 58, 0.05) 0%, transparent 50%),
    linear-gradient(170deg, #131109 0%, #0E0C07 100%);
}
</style>
