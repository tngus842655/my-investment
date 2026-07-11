<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useFontScale } from '@/composables/useFontScale'
import { useLocale } from '@/composables/useLocale'
import { FONT_SCALE_DEFAULT } from '@/design'
import type { LocaleCode } from '@/config/marketConfig'

const router = useRouter()
const { fontScale, min, max, setFontScale } = useFontScale()
const { locale, setLocale } = useLocale()

const percentLabel = (v: number) => `${Math.round(v * 100)}%`
const resetFontScale = () => setFontScale(FONT_SCALE_DEFAULT)

// 1차 오픈 대상 언어만 노출 (일본어/중국어는 GLOBALIZATION.md 단계 D 확장 시 추가)
const languageOptions: { value: LocaleCode; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
]
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
        <div class="d-flex align-center ga-2">
          <button
            v-if="fontScale !== FONT_SCALE_DEFAULT"
            class="reset-btn"
            @click="resetFontScale"
          >
            <v-icon size="14">mdi-restore</v-icon>
            초기화
          </button>
          <div class="font-weight-bold text-primary">{{ percentLabel(fontScale) }}</div>
        </div>
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

    <div class="tip-card mt-3">
      <span class="tip-emoji">⚠️</span>
      <span class="tip-body">너무 크게 설정하면 일부 화면에서 텍스트가 겹치거나 잘려 보일 수 있어요.</span>
    </div>

    <v-card class="glass-card pa-4 mt-4">
      <div class="font-weight-medium mb-3">언어</div>
      <div class="d-flex ga-2">
        <v-btn
          v-for="opt in languageOptions"
          :key="opt.value"
          size="small"
          rounded="lg"
          elevation="0"
          :variant="locale === opt.value ? 'flat' : 'tonal'"
          :color="locale === opt.value ? 'primary' : undefined"
          @click="setLocale(opt.value)"
        >
          {{ opt.label }}
        </v-btn>
      </div>
    </v-card>
  </v-container>
</template>

<style scoped>
.reset-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  border: none;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  cursor: pointer;
}
.reset-btn:active {
  opacity: 0.6;
}

.tip-card {
  border-radius: 16px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(var(--v-theme-warning), 0.1) 0%, rgba(var(--v-theme-warning), 0.04) 100%);
  border: 1px solid rgba(var(--v-theme-warning), 0.2);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tip-emoji {
  font-size: 1rem;
}
.tip-body {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.75);
}
</style>
