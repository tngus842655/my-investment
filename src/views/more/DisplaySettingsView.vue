<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useFontScale } from '@/composables/useFontScale'

const router = useRouter()
const { fontScale, min, max, setFontScale } = useFontScale()

const percentLabel = (v: number) => `${Math.round(v * 100)}%`
</script>

<template>
  <v-container class="pa-4" style="max-width: 480px">
    <div class="d-flex align-center ga-2 mb-6">
      <v-btn icon variant="text" size="small" @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="text-h6 font-weight-bold">화면 설정</div>
    </div>

    <v-card class="glass-card pa-4">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="text-body-2 font-weight-medium">글자 크기</div>
        <div class="text-body-2 font-weight-bold text-primary">{{ percentLabel(fontScale) }}</div>
      </div>
      <v-slider
        :model-value="fontScale"
        :min="min"
        :max="max"
        :step="0.05"
        color="primary"
        @update:model-value="setFontScale"
      />
      <div class="d-flex justify-space-between text-caption text-medium-emphasis">
        <span>작게 ({{ percentLabel(min) }})</span>
        <span>크게 ({{ percentLabel(max) }})</span>
      </div>
    </v-card>
  </v-container>
</template>
