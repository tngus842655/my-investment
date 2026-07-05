<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="mb-6">
      <div class="font-weight-bold text-h6">Fire Path</div>
      <div class="text-medium-emphasis">이용할 서비스를 선택하세요</div>
    </div>

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
