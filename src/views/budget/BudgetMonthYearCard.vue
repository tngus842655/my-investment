<script setup lang="ts">
const year = defineModel<number>('year', { required: true })
const month = defineModel<number>('month', { required: true }) // 0~11

const emit = defineEmits<{ close: [] }>()

const monthNames = Array.from({ length: 12 }, (_, i) => `${i + 1}월`)

const selectMonth = (i: number) => {
  month.value = i
  emit('close')
}

const setThisMonth = () => {
  const today = new Date()
  year.value = today.getFullYear()
  month.value = today.getMonth()
  emit('close')
}
</script>

<template>
  <v-card rounded="lg" class="month-year-card">
    <div class="date-picker-topbar">
      <span class="topbar-title">날짜</span>
      <div class="d-flex align-center ga-1">
        <button class="topbar-action" @click="setThisMonth">이번달</button>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')" />
      </div>
    </div>
    <div class="date-nav-row">
      <button class="nav-arrow" @click="year -= 1">
        <v-icon size="20">mdi-chevron-left</v-icon>
      </button>
      <span class="nav-label-static">{{ year }}년</span>
      <button class="nav-arrow" @click="year += 1">
        <v-icon size="20">mdi-chevron-right</v-icon>
      </button>
    </div>
    <div class="month-grid">
      <button
        v-for="(name, i) in monthNames"
        :key="i"
        class="month-cell"
        :class="{ 'month-cell-active': month === i }"
        @click="selectMonth(i)"
      >{{ name }}</button>
    </div>
  </v-card>
</template>

<style scoped>
.month-year-card {
  overflow: hidden;
}
.date-picker-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px 10px 16px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
.topbar-title {
  font-weight: 700;
  font-size: 1.4rem;
}
.topbar-action {
  padding: 4px 10px;
  border: none;
  background: none;
  color: inherit;
  font-weight: 700;
  font-size: 1.2rem;
  cursor: pointer;
}
.date-picker-topbar .v-btn {
  color: inherit;
}
.date-picker-topbar :deep(.v-icon) {
  font-size: 1.75rem;
}

.date-nav-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px 0 0;
}
.nav-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  color: rgba(var(--v-theme-on-surface), 0.6);
  cursor: pointer;
}
.nav-label-static {
  font-weight: 700;
  font-size: 0.9375rem;
  color: rgb(var(--v-theme-on-surface));
  min-width: 72px;
  text-align: center;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 12px 16px 20px;
}
.month-cell {
  padding: 12px 0;
  border: none;
  border-radius: 10px;
  background: none;
  font-weight: 600;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}
.month-cell-active {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}
</style>
