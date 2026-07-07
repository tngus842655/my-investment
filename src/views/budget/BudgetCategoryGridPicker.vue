<script setup lang="ts">
defineProps<{
  items: { title: string; value: string }[]
}>()

const emit = defineEmits<{
  select: [string]
  close: []
  manage: []
}>()
</script>

<template>
  <div class="category-picker">
    <div class="category-picker-topbar">
      <span class="topbar-title">카테고리</span>
      <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')" />
    </div>

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
</template>

<style scoped>
.category-picker {
  display: flex;
  flex-direction: column;
}

.category-picker-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 6px 6px 14px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  flex-shrink: 0;
}
.topbar-title {
  font-weight: 700;
  font-size: 1.0625rem;
}
.category-picker-topbar .v-btn {
  color: inherit;
}
.category-picker-topbar :deep(.v-icon) {
  font-size: 1.375rem;
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
