<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDesignTokens } from '@/composables/useDesignTokens'

const router = useRouter()
const { themeId } = useDesignTokens()

const LOGO_WIDE: Partial<Record<string, string>> = {
  light:  '/icons/wide/logo-wide-light.png',
  dark:   '/icons/wide/logo-wide-dark.png',
  gold:   '/icons/wide/logo-wide-gold.png',
  nature: '/icons/wide/logo-wide-nature.png',
  space:  '/icons/wide/logo-wide-space.png',
}
const logoWide = computed(() => LOGO_WIDE[themeId.value] ?? null)

const showBack = ref(false)
onMounted(() => {
  showBack.value = window.history.state?.back != null && window.history.state.back !== '/'
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="hub-header mb-6">
      <button v-if="showBack" class="back-btn hub-header-back" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <img v-if="logoWide" :src="logoWide" class="header-logo-wide" alt="FIREPATH" />
      <div v-else class="font-weight-bold text-h6">Fire Path</div>
    </div>

    <div class="text-center text-medium-emphasis mb-3">이용할 서비스를 선택하세요</div>

    <div class="d-flex flex-column ga-3">
      <div class="hub-card glass-card pa-5 d-flex align-center ga-3" @click="router.push('/dashboard')">
        <div class="hub-icon"><v-icon size="24" color="primary">mdi-finance</v-icon></div>
        <div>
          <div class="font-weight-medium">자산관리</div>
          <div class="text-medium-emphasis">투자 포트폴리오·FIRE 목표 관리</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="hub-card glass-card pa-5 d-flex align-center ga-3" @click="router.push('/budget')">
        <div class="hub-icon"><v-icon size="24" color="primary">mdi-notebook-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">가계부</div>
          <div class="text-medium-emphasis">수입·지출 기록 관리</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.hub-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
}
.hub-header-back {
  position: absolute;
  left: 0;
}

.back-btn {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.back-btn:active { opacity: 0.6; }

.header-logo-wide {
  height: 40px;
  width: auto;
  object-fit: contain;
}

.glass-card {
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
  border-radius: 20px;
}

.hub-card {
  cursor: pointer;
}

.hub-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chevron-icon {
  color: rgba(var(--v-theme-on-surface), 0.3);
}
</style>
