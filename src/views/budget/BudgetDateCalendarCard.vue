<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import BudgetMonthYearCard from './BudgetMonthYearCard.vue'

const emit = defineEmits<{
  close: []
}>()

const modelValue = defineModel<string>({ required: true })

const monthYearOpen = ref(false)
const initialDate = new Date(`${modelValue.value}T00:00:00`)
const calendarMonth = ref(initialDate.getMonth())
const calendarYear = ref(initialDate.getFullYear())

// 기기별로 하단 고정 패널에 할당된 실제 높이가 다르므로,
// 달력이 잘리거나 스크롤이 생기지 않도록 실측해서 그 높이에 맞게 축소
const rootRef = ref<HTMLElement>()
const scaleWrapRef = ref<HTMLElement>()
const scale = ref(1)
const rootHeight = ref<number>()

const fitToPanel = () => {
  const scaleWrap = scaleWrapRef.value
  const panel = rootRef.value?.parentElement
  if (!scaleWrap || !panel) return
  const naturalHeight = scaleWrap.scrollHeight
  const availableHeight = panel.clientHeight
  if (!naturalHeight || !availableHeight) return
  scale.value = naturalHeight > availableHeight ? availableHeight / naturalHeight : 1
  rootHeight.value = naturalHeight * scale.value
}

onMounted(async () => {
  await nextTick()
  fitToPanel()
  window.addEventListener('resize', fitToPanel)
})
onUnmounted(() => window.removeEventListener('resize', fitToPanel))
watch([calendarMonth, calendarYear], async () => {
  await nextTick()
  fitToPanel()
})

const toIsoDate = (v: Date) => {
  const y = v.getFullYear()
  const m = String(v.getMonth() + 1).padStart(2, '0')
  const d = String(v.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const pickerDate = computed<Date>({
  get: () => new Date(`${modelValue.value}T00:00:00`),
  set: (v) => {
    if (!v) return
    modelValue.value = toIsoDate(v)
    emit('close')
  },
})

const shiftMonth = (delta: number) => {
  let m = calendarMonth.value + delta
  let y = calendarYear.value
  if (m < 0) { m = 11; y -= 1 }
  else if (m > 11) { m = 0; y += 1 }
  calendarMonth.value = m
  calendarYear.value = y
}

const setToday = () => {
  const today = new Date()
  modelValue.value = toIsoDate(today)
  calendarMonth.value = today.getMonth()
  calendarYear.value = today.getFullYear()
  emit('close')
}
</script>

<template>
  <div ref="rootRef" class="date-picker-card" :style="{ height: rootHeight ? `${rootHeight}px` : undefined }">
    <div
      ref="scaleWrapRef"
      class="scale-wrap"
      :style="{ transform: scale < 1 ? `scale(${scale})` : undefined, width: scale < 1 ? `${100 / scale}%` : '100%' }"
    >
      <div class="date-picker-topbar">
        <span class="topbar-title">날짜</span>
        <div class="d-flex align-center ga-1">
          <button class="topbar-action" @click="setToday">오늘</button>
          <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')" />
        </div>
      </div>
      <div class="date-nav-row">
        <button class="nav-arrow" @click="shiftMonth(-1)">
          <v-icon size="20">mdi-chevron-left</v-icon>
        </button>
        <button class="nav-label" @click="monthYearOpen = true">{{ calendarYear }}년 {{ calendarMonth + 1 }}월</button>
        <button class="nav-arrow" @click="shiftMonth(1)">
          <v-icon size="20">mdi-chevron-right</v-icon>
        </button>
      </div>
      <v-date-picker
        v-model="pickerDate"
        v-model:month="calendarMonth"
        v-model:year="calendarYear"
        width="100%"
        density="compact"
        hide-header
        show-adjacent-months
      >
        <template #controls />
      </v-date-picker>
    </div>

    <div v-if="monthYearOpen" class="month-year-overlay">
      <BudgetMonthYearCard v-model:year="calendarYear" v-model:month="calendarMonth" @close="monthYearOpen = false" />
    </div>
  </div>
</template>

<style scoped>
.date-picker-card {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
}
.scale-wrap {
  transform-origin: top center;
  flex-shrink: 0;
}
.date-picker-card :deep(.v-picker),
.date-picker-card :deep(.v-picker__body),
.date-picker-card :deep(.v-date-picker-month) {
  width: 100% !important;
}

.month-year-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  z-index: 5;
}
.date-picker-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 6px 6px 14px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
.topbar-title {
  font-weight: 700;
  font-size: 1.0625rem;
  line-height: 1.375rem;
}
.topbar-action {
  padding: 2px 8px;
  border: none;
  background: none;
  color: inherit;
  font-weight: 700;
  font-size: 0.9375rem;
  cursor: pointer;
}
.date-picker-topbar .v-btn {
  color: inherit;
}
.date-picker-topbar :deep(.v-btn) {
  width: 28px !important;
  height: 28px !important;
}
.date-picker-topbar :deep(.v-icon) {
  font-size: 1.375rem;
}

.date-picker-card :deep(.v-date-picker-controls) {
  display: none;
}

.date-nav-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2px 0 0;
}
.nav-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: rgba(var(--v-theme-on-surface), 0.6);
  cursor: pointer;
}
.nav-label {
  border: none;
  background: none;
  font-weight: 700;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  padding: 2px 8px;
}

/* 6주(row)가 모두 보이도록 날짜 셀 자체를 압축 */
.date-picker-card :deep(.v-date-picker-month) {
  --v-date-picker-month-day-size: 30px;
}
.date-picker-card :deep(.v-date-picker-month__day),
.date-picker-card :deep(.v-date-picker-month__weekday) {
  height: 30px;
  font-size: 0.75rem;
}
.date-picker-card :deep(.v-date-picker-month__day .v-btn) {
  --v-btn-height: 26px;
  width: 26px;
  height: 26px;
  font-size: 0.75rem;
}
</style>
