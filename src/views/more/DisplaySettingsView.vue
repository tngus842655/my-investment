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
      <div class="font-weight-bold">화면 설정</div>
    </div>

    <v-card class="glass-card pa-4">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="font-weight-medium">글자 크기</div>
        <div class="font-weight-bold text-primary">{{ percentLabel(fontScale) }}</div>
      </div>
      <v-slider
        :model-value="fontScale"
        :min="min"
        :max="max"
        :step="0.01"
        color="primary"
        @update:model-value="setFontScale"
      />
      <div class="d-flex justify-space-between text-medium-emphasis">
        <span>작게 ({{ percentLabel(min) }})</span>
        <span>크게 ({{ percentLabel(max) }})</span>
      </div>
    </v-card>

    <div class="mt-3 text-medium-emphasis">
      너무 크게 설정하면 일부 화면에서 텍스트가 겹치거나 잘려 보일 수 있어요.
    </div>
  </v-container>
</template>
