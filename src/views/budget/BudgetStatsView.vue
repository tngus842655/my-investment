<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { formatCurrency } from '@/utils/numberFormat'
import { useDesignTokens } from '@/composables/useDesignTokens'
import type { BudgetType } from '@/types/budget'

const { chart } = useDesignTokens()

interface EntryRow {
  type: BudgetType
  category_id: string
  amount: number
  budget_categories: { name: string; icon: string } | null
}

const today = new Date()
const year = ref(today.getFullYear())
const month = ref(today.getMonth() + 1)
const statType = ref<BudgetType>('EXPENSE')
const hoveredKey = ref<string | null>(null)

const loading = ref(true)
const entries = ref<EntryRow[]>([])

const pad2 = (n: number) => String(n).padStart(2, '0')

const fetchEntries = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  loading.value = true
  const start = `${year.value}-${pad2(month.value)}-01`
  const end = `${year.value}-${pad2(month.value)}-${pad2(new Date(year.value, month.value, 0).getDate())}`
  const { data, error } = await supabase
    .from('budget_entries')
    .select('type, category_id, amount, budget_categories(name, icon)')
    .eq('user_id', user.id)
    .gte('entry_date', start)
    .lte('entry_date', end)
  loading.value = false
  if (error) {
    showMessage('통계를 불러오지 못했습니다.', 'error')
    return
  }
  entries.value = (data ?? []) as unknown as EntryRow[]
}

onMounted(fetchEntries)
watch([year, month], fetchEntries)

const prevMonth = () => {
  if (month.value === 1) { month.value = 12; year.value -= 1 } else { month.value -= 1 }
}
const nextMonth = () => {
  if (month.value === 12) { month.value = 1; year.value += 1 } else { month.value += 1 }
}

const incomeTotal = computed(() =>
  entries.value.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0),
)
const expenseTotal = computed(() =>
  entries.value.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0),
)

// ── SVG 도넛 계산 (PortfolioAnalysisView와 동일한 방식) ──────────────────────
const CX = 120
const CY = 120
const OR = 92
const IR = 56
const GAP_DEG = 1.2

function toXY(r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }
}

function buildPath(start: number, end: number): string {
  if (end - start >= 359.5) {
    return `M ${CX} ${CY - OR} A ${OR} ${OR} 0 1 1 ${CX - 0.01} ${CY - OR} Z M ${CX} ${CY - IR} A ${IR} ${IR} 0 1 1 ${CX - 0.01} ${CY - IR} Z`
  }
  const o1 = toXY(OR, start)
  const o2 = toXY(OR, end)
  const i1 = toXY(IR, end)
  const i2 = toXY(IR, start)
  const large = end - start > 180 ? 1 : 0
  return `M ${o1.x} ${o1.y} A ${OR} ${OR} 0 ${large} 1 ${o2.x} ${o2.y} L ${i1.x} ${i1.y} A ${IR} ${IR} 0 ${large} 0 ${i2.x} ${i2.y} Z`
}

interface Seg {
  key: string
  label: string
  icon: string
  value: number
  pct: number
  color: string
  path: string
}

const segments = computed<Seg[]>(() => {
  const map = new Map<string, { label: string; icon: string; value: number }>()
  for (const e of entries.value) {
    if (e.type !== statType.value) continue
    const key = e.category_id
    const existing = map.get(key)
    if (existing) existing.value += e.amount
    else map.set(key, { label: e.budget_categories?.name ?? '기타', icon: e.budget_categories?.icon ?? '❓', value: e.amount })
  }

  const total = [...map.values()].reduce((s, v) => s + v.value, 0)
  if (total === 0) return []

  const sorted = [...map.entries()].sort((a, b) => b[1].value - a[1].value)
  const palette = chart.value.palette

  let angle = 0
  return sorted.map(([key, val], i) => {
    const pct = (val.value / total) * 100
    const sweep = (pct / 100) * 360
    const gap = sorted.length > 1 ? GAP_DEG : 0
    const seg: Seg = {
      key,
      label: val.label,
      icon: val.icon,
      value: val.value,
      pct,
      color: palette[i % palette.length]!,
      path: buildPath(angle + gap / 2, angle + sweep - gap / 2),
    }
    angle += sweep
    return seg
  })
})

const statTotal = computed(() => segments.value.reduce((s, seg) => s + seg.value, 0))
const hovered = computed(() => segments.value.find((s) => s.key === hoveredKey.value) ?? null)
</script>

<template>
  <v-container class="pa-4 pa-sm-6 pb-16">
    <div class="d-flex align-center ga-2 mb-4">
      <img src="/icons/icon-stats.png" class="header-icon" alt="통계" />
      <div class="font-weight-bold text-h6">통계</div>
    </div>

    <div class="d-flex align-center justify-space-between mb-3">
      <v-btn icon="mdi-chevron-left" variant="text" size="small" @click="prevMonth" />
      <div class="font-weight-bold">{{ year }}년 {{ month }}월</div>
      <v-btn icon="mdi-chevron-right" variant="text" size="small" @click="nextMonth" />
    </div>

    <v-btn-toggle v-model="statType" mandatory rounded="lg" density="comfortable" class="mb-4">
      <v-btn value="EXPENSE" variant="tonal">지출 {{ formatCurrency(expenseTotal) }}원</v-btn>
      <v-btn value="INCOME" variant="tonal">수입 {{ formatCurrency(incomeTotal) }}원</v-btn>
    </v-btn-toggle>

    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <div v-else-if="segments.length === 0" class="text-center text-medium-emphasis py-8">
      내역이 없습니다.
    </div>

    <template v-else>
      <div class="chart-card mb-4">
        <div class="chart-wrap">
          <svg viewBox="0 0 240 240" class="donut-svg">
            <circle :cx="CX" :cy="CY" :r="(OR + IR) / 2" fill="none" stroke="rgba(128,128,128,0.08)" :stroke-width="OR - IR" />
            <path
              v-for="seg in segments"
              :key="seg.key"
              :d="seg.path"
              :fill="seg.color"
              :opacity="hoveredKey && hoveredKey !== seg.key ? 0.35 : 1"
              class="seg-path"
              @mouseenter="hoveredKey = seg.key"
              @mouseleave="hoveredKey = null"
              @touchstart.passive="hoveredKey = seg.key"
              @touchend.passive="hoveredKey = null"
            />
            <text x="120" y="108" text-anchor="middle" class="center-label">
              {{ hovered ? hovered.label : (statType === 'EXPENSE' ? '총 지출' : '총 수입') }}
            </text>
            <text x="120" y="130" text-anchor="middle" class="center-value">
              {{ hovered ? hovered.pct.toFixed(1) + '%' : formatCurrency(statTotal) + '원' }}
            </text>
            <text v-if="hovered" x="120" y="150" text-anchor="middle" class="center-sub">
              {{ formatCurrency(hovered.value) }}원
            </text>
          </svg>
        </div>
      </div>

      <div class="legend-card">
        <div
          v-for="seg in segments"
          :key="seg.key"
          class="legend-row"
          :class="{ 'legend-dimmed': hoveredKey && hoveredKey !== seg.key, 'legend-active': hoveredKey === seg.key }"
          @mouseenter="hoveredKey = seg.key"
          @mouseleave="hoveredKey = null"
        >
          <span class="legend-icon">{{ seg.icon }}</span>
          <div class="legend-info">
            <div class="legend-name">{{ seg.label }}</div>
            <div class="legend-bar-wrap">
              <div class="legend-bar" :style="{ width: seg.pct + '%', background: seg.color }" />
            </div>
          </div>
          <div class="legend-right">
            <span class="legend-pct" :style="{ color: seg.color }">{{ seg.pct.toFixed(1) }}%</span>
            <span class="legend-val">{{ formatCurrency(seg.value) }}원</span>
          </div>
        </div>
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.header-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.chart-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 24px;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.chart-wrap {
  width: 100%;
  max-width: 260px;
}
.donut-svg {
  width: 100%;
  height: auto;
  display: block;
}

.seg-path {
  transition: opacity 0.2s ease;
  cursor: pointer;
}

.center-label {
  font-size: 0.6875rem;
  fill: rgba(var(--v-theme-on-surface), 0.5);
  font-family: inherit;
}
.center-value {
  font-size: 1.125rem;
  font-weight: 700;
  fill: rgb(var(--v-theme-on-surface));
  font-family: inherit;
}
.center-sub {
  font-size: 0.75rem;
  fill: rgba(var(--v-theme-on-surface), 0.55);
  font-family: inherit;
}

.legend-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 20px;
  overflow: hidden;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: opacity 0.2s ease;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.04);
}
.legend-row:last-child {
  border-bottom: none;
}
.legend-dimmed { opacity: 0.3; }
.legend-active { background: rgba(var(--v-theme-on-surface), 0.03); }

.legend-icon {
  font-size: 1.125rem;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}
.legend-info {
  flex: 1;
  min-width: 0;
}
.legend-name {
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.legend-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
.legend-pct {
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.2;
}
.legend-val {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.legend-bar-wrap {
  width: 100%;
  height: 4px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}
.legend-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
