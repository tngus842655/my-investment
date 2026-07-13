<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import BudgetMonthYearCard from './BudgetMonthYearCard.vue'
import BudgetPanelTopbar from './BudgetPanelTopbar.vue'
import { formatYearMonth } from '@/utils/dateFormat'
import { useFitToPanel } from '@/composables/useFitToPanel'

const emit = defineEmits<{
  close: []
}>()

const modelValue = defineModel<string>({ required: true })

const monthYearOpen = ref(false)
const initialDate = new Date(`${modelValue.value}T00:00:00`)
const calendarMonth = ref(initialDate.getMonth())
const calendarYear = ref(initialDate.getFullYear())

const rootRef = ref<HTMLElement>()
const scaleWrapRef = ref<HTMLElement>()
const { scale, rootHeight, fit } = useFitToPanel(rootRef, scaleWrapRef)

watch([calendarMonth, calendarYear], async () => {
  await nextTick()
  fit()
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
      <BudgetPanelTopbar :title="$t('budget.common.date')" @close="emit('close')">
        <button class="topbar-action" @click="setToday">{{ $t('budget.common.today') }}</button>
      </BudgetPanelTopbar>
      <div class="date-nav-row">
        <button class="nav-arrow" @click="shiftMonth(-1)">
          <v-icon size="20">mdi-chevron-left</v-icon>
        </button>
        <button class="nav-label" @click="monthYearOpen = true">{{ formatYearMonth(calendarYear, calendarMonth + 1) }}</button>
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
.topbar-action {
  padding: 2px 8px;
  border: none;
  background: none;
  color: inherit;
  font-weight: 700;
  font-size: 0.9375rem;
  cursor: pointer;
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
