<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import BudgetPanelTopbar from './BudgetPanelTopbar.vue'
import { useFitToPanel } from '@/composables/useFitToPanel'

const props = defineProps<{
  items: { title: string; value: string }[]
}>()

const emit = defineEmits<{
  select: [string]
  close: []
  manage: []
}>()

const rootRef = ref<HTMLElement>()
const scaleWrapRef = ref<HTMLElement>()
const { scale, rootHeight, fit } = useFitToPanel(rootRef, scaleWrapRef)

// 지출/수입 전환 등으로 목록 개수가 바뀌면 다시 실측해서 맞춤
watch(() => props.items.length, async () => {
  await nextTick()
  fit()
})
</script>

<template>
  <div ref="rootRef" class="category-picker" :style="{ height: rootHeight ? `${rootHeight}px` : undefined }">
    <div
      ref="scaleWrapRef"
      class="scale-wrap"
      :style="{ transform: scale < 1 ? `scale(${scale})` : undefined, width: scale < 1 ? `${100 / scale}%` : '100%' }"
    >
      <BudgetPanelTopbar title="카테고리" @close="emit('close')" />

      <div v-if="items.length === 0" class="category-picker-empty">
        <div class="text-medium-emphasis mb-2" style="font-size: 0.8125rem">
          카테고리가 없습니다. 먼저 추가해주세요.
        </div>
        <v-btn size="small" variant="tonal" color="primary" @click="emit('manage')">
          카테고리 추가하러 가기
        </v-btn>
      </div>

      <div v-else class="category-grid">
        <button
          v-for="item in items"
          :key="item.value"
          class="category-key"
          @click="emit('select', item.value)"
        >{{ item.title }}</button>
        <button class="category-key category-key--add" @click="emit('manage')">
          <v-icon size="14">mdi-plus</v-icon> 추가
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-picker {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
}
.scale-wrap {
  transform-origin: top center;
  flex-shrink: 0;
}

.category-picker-empty {
  padding: 24px 16px;
  text-align: center;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.category-key {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 4px;
  border: none;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  background: none;
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  text-align: center;
}
.category-key:nth-child(3n) {
  border-right: none;
}
.category-key:active {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.category-key--add {
  color: rgb(var(--v-theme-primary));
  gap: 2px;
}
</style>
