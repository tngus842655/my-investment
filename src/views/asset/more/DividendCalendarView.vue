<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { getTickerDisplayName } from '@/utils/tickerNames'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'

const router = useRouter()
const loading = ref(true)

interface Portfolio {
  ticker: string
  asset_type: string
  currency: string
  quantity: number
}

interface DividendEvent {
  date: string
  amount: number
  type: 'ex' | 'next'
}

interface TickerDividend {
  ticker: string
  dividends: DividendEvent[]
  currency: string
}

interface CalendarEvent {
  date: string
  ticker: string
  amountPerShare: number
  totalAmountKrw: number
  currency: string
  quantity: number
  isNext: boolean
}

const portfolios = ref<Portfolio[]>([])
const calendarEvents = ref<CalendarEvent[]>([])
const exchangeRate = ref(1300)
const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(new Date().getMonth() + 1)
const activeCacheKey = ref('')

const loadData = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [portRes, rate] = await Promise.all([
      supabase.from('portfolios')
        .select('ticker, asset_type, currency, quantity')
        .eq('user_id', user.id),
      getCachedExchangeRate(),
    ])
    if (portRes.error) throw portRes.error

    exchangeRate.value = rate
    portfolios.value = portRes.data ?? []

    // 현금 제외, 배당 가능 종목만. 계좌가 달라도 같은 종목이면 수량을 합산해 하나로 집계
    const targetsByTicker = new Map<string, Portfolio>()
    for (const p of portfolios.value) {
      if (p.asset_type === '현금' || p.asset_type === '암호화폐') continue
      const existing = targetsByTicker.get(p.ticker)
      if (existing) existing.quantity += p.quantity
      else targetsByTicker.set(p.ticker, { ...p })
    }
    const targets = [...targetsByTicker.values()]
    if (!targets.length) { loading.value = false; return }

    activeCacheKey.value = `dividend_cache_${targets.map((p) => p.ticker).sort().join(',')}`
    const cacheKey = activeCacheKey.value
    const CACHE_TTL = 24 * 60 * 60 * 1000  // 24시간

    let rawData: { data: TickerDividend[] } | null = null
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const { ts, payload } = JSON.parse(cached)
      if (Date.now() - ts < CACHE_TTL) {
        rawData = payload
      } else {
        localStorage.removeItem(cacheKey)
      }
    }

    if (!rawData) {
      const { data, error } = await supabase.functions.invoke('etf-dividend', {
        body: { tickers: targets.map((p) => ({ ticker: p.ticker, currency: p.currency })) },
      })
      if (error) throw error
      rawData = data
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), payload: data }))
    }

    const tickerMap = new Map<string, Portfolio>(targets.map((p) => [p.ticker, p]))
    const events: CalendarEvent[] = []

    for (const td of (rawData!.data as TickerDividend[])) {
      const port = tickerMap.get(td.ticker)
      if (!port) continue
      // 과거 배당 이력만 추가 (next는 우리가 직접 예측으로 대체)
      for (const div of td.dividends.filter((d) => d.type === 'ex')) {
        const totalUsd = div.amount * port.quantity
        const totalKrw = port.currency === 'USD' ? totalUsd * rate : totalUsd
        // Yahoo Finance가 UTC 기준이라 주말로 잡힐 수 있음 → 영업일로 보정
        const adjustedDate = toNearestBusinessDay(new Date(div.date)).toISOString().slice(0, 10)
        events.push({
          date: adjustedDate,
          ticker: td.ticker,
          amountPerShare: div.amount,
          totalAmountKrw: Math.round(totalKrw),
          currency: port.currency,
          quantity: port.quantity,
          isNext: false,
        })
      }

      // 과거 이력 기반 1년치 미래 예측 (날짜 보정 포함)
      const pastDivs = td.dividends
        .filter((d) => d.type === 'ex')
        .map((d) => ({ ...d, date: toNearestBusinessDay(new Date(d.date)).toISOString().slice(0, 10) }))
      const predicted = predictFutureDividends(td.ticker, pastDivs, port.quantity, port.currency, rate)
      events.push(...predicted)
    }

    // 최종 방어: 주말 날짜가 어떤 경로로든 섞이지 않도록 한번 더 보정
    const sanitized = events.map((e) => {
      const d = new Date(`${e.date}T00:00:00`)  // 로컬 시간 기준 파싱
      const day = d.getDay()
      if (day === 0) d.setDate(d.getDate() + 1)
      else if (day === 6) d.setDate(d.getDate() + 2)
      const fixed = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { ...e, date: fixed }
    })

    calendarEvents.value = sanitized.sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    showMessage('배당 데이터를 불러오는 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

// 선택된 년/월 이벤트
const currentMonthEvents = computed(() => {
  const prefix = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`
  return calendarEvents.value.filter((e) => e.date.startsWith(prefix))
})

// 연간 배당 합계
const annualTotalKrw = computed(() => {
  const year = String(selectedYear.value)
  return calendarEvents.value
    .filter((e) => e.date.startsWith(year))
    .reduce((s, e) => s + e.totalAmountKrw, 0)
})

// 이번달 배당 합계
const monthTotalKrw = computed(() =>
  currentMonthEvents.value.reduce((s, e) => s + e.totalAmountKrw, 0)
)

// 달력 렌더링용
const calendarDays = computed(() => {
  const year = selectedYear.value
  const month = selectedMonth.value
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const days: { day: number | null; events: CalendarEvent[] }[] = []

  for (let i = 0; i < firstDay; i++) days.push({ day: null, events: [] })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({
      day: d,
      events: calendarEvents.value.filter((e) => e.date === dateStr),
    })
  }
  return days
})

const prevMonth = () => {
  if (selectedMonth.value === 1) { selectedMonth.value = 12; selectedYear.value-- }
  else selectedMonth.value--
}
const nextMonth = () => {
  if (selectedMonth.value === 12) { selectedMonth.value = 1; selectedYear.value++ }
  else selectedMonth.value++
}

// 클릭한 날 상세
const selectedDate = ref<string | null>(null)
const showSheet = ref(false)
const selectedDateEvents = computed(() => {
  if (!selectedDate.value) return []
  return calendarEvents.value.filter((e) => e.date === selectedDate.value)
})

const onDayClick = (day: number | null, events: CalendarEvent[]) => {
  if (!day || !events.length) return
  const dateStr = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  selectedDate.value = dateStr
  showSheet.value = true
}

function toNearestBusinessDay(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  if (day === 0) d.setDate(d.getDate() + 1)  // 일 → 월
  else if (day === 6) d.setDate(d.getDate() + 2)  // 토 → 월
  return d
}

// 해당 월의 N번째 특정 요일 날짜 반환
function getNthWeekdayDate(year: number, month: number, n: number, weekday: number): Date {
  const first = new Date(year, month - 1, 1)
  const firstWd = first.getDay()
  let day = 1 + ((weekday - firstWd + 7) % 7) + (n - 1) * 7
  const maxDay = new Date(year, month, 0).getDate()
  if (day > maxDay) day -= 7  // 5번째가 없으면 4번째로
  return new Date(year, month - 1, day)
}

// 날짜가 해당 월의 몇 번째 무슨 요일인지
function getNthWeekday(date: Date): { n: number; weekday: number } {
  return {
    n: Math.ceil(date.getDate() / 7),
    weekday: date.getDay(),
  }
}

function predictFutureDividends(
  ticker: string,
  pastDivs: DividendEvent[],
  quantity: number,
  currency: string,
  rate: number,
): CalendarEvent[] {
  if (pastDivs.length < 2) return []

  const sorted: DividendEvent[] = [...pastDivs].sort((a, b) => a.date.localeCompare(b.date))

  // 배당 주기 감지
  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]!.date).getTime() - new Date(sorted[i - 1]!.date).getTime()) / 86400000
    intervals.push(diff)
  }
  const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length

  let freqMonths: number
  if (avgInterval <= 45) freqMonths = 1
  else if (avgInterval <= 120) freqMonths = 3
  else if (avgInterval <= 270) freqMonths = 6
  else freqMonths = 12

  // 최근 평균 금액
  const recentCount = freqMonths === 1 ? 6 : 4
  const recent = sorted.slice(-recentCount)
  const avgAmount = recent.reduce((s, d) => s + d.amount, 0) / recent.length

  // ── 패턴 감지: "N번째 무슨요일" vs "몇 일" 중 더 일관성 있는 방식 선택 ──
  const nthWeekdays = sorted.map((d) => getNthWeekday(new Date(d.date)))

  // 최빈 (n, weekday) 조합 찾기
  const freq: Record<string, number> = {}
  for (const { n, weekday } of nthWeekdays) {
    const key = `${n}-${weekday}`
    freq[key] = (freq[key] ?? 0) + 1
  }
  const topKey = Object.entries(freq).sort((a, b) => b[1]! - a[1]!)[0]!
  const [topN, topWeekday] = topKey[0].split('-').map(Number) as [number, number]
  const nthWeekdayConsistency = topKey[1]! / sorted.length  // 일치율

  // 평균 날짜 일관성 (표준편차가 낮을수록 날짜 기반이 유리)
  const avgDay = sorted.reduce((s, d) => s + new Date(d.date).getDate(), 0) / sorted.length
  const dayStdDev = Math.sqrt(
    sorted.reduce((s, d) => s + (new Date(d.date).getDate() - avgDay) ** 2, 0) / sorted.length
  )
  // N번째 요일 패턴 일치율이 60% 이상이고, 날짜 표준편차가 5일 초과면 요일 기반 우선
  const useNthWeekday = nthWeekdayConsistency >= 0.6 && dayStdDev > 5

  // 분기·반기·연배당: 지급 월 패턴
  const payMonths = freqMonths > 1
    ? [...new Set(sorted.map((d) => new Date(d.date).getMonth() + 1))].sort((a, b) => a - b)
    : null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const oneYearLater = new Date(today)
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)

  const predictions: CalendarEvent[] = []
  const seen = new Set<string>()

  const addPrediction = (year: number, month: number) => {
    let candidate: Date
    if (useNthWeekday) {
      // N번째 무슨요일 패턴
      candidate = toNearestBusinessDay(getNthWeekdayDate(year, month, topN, topWeekday))
    } else {
      // 평균 날짜 패턴
      const maxDay = new Date(year, month, 0).getDate()
      candidate = toNearestBusinessDay(new Date(year, month - 1, Math.min(Math.round(avgDay), maxDay)))
    }
    if (candidate < today || candidate > oneYearLater) return
    const dateStr = candidate.toISOString().slice(0, 10)
    if (seen.has(dateStr)) return
    seen.add(dateStr)
    const totalKrw = currency === 'USD' ? avgAmount * quantity * rate : avgAmount * quantity
    predictions.push({ date: dateStr, ticker, amountPerShare: avgAmount, totalAmountKrw: Math.round(totalKrw), currency, quantity, isNext: true })
  }

  if (freqMonths === 1) {
    const cursor = new Date(today)
    cursor.setDate(1)
    while (cursor <= oneYearLater) {
      addPrediction(cursor.getFullYear(), cursor.getMonth() + 1)
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else {
    for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
      const targetYear = today.getFullYear() + yearOffset
      for (const m of (payMonths ?? [])) {
        addPrediction(targetYear, m)
      }
    }
  }

  return predictions.sort((a, b) => a.date.localeCompare(b.date))
}

function formatAmountPerShare(ev: CalendarEvent) {
  if (ev.amountPerShare <= 0) return '?'
  return ev.currency === 'KRW'
    ? Math.round(ev.amountPerShare).toLocaleString()
    : ev.amountPerShare.toFixed(4)
}

// 배당 없는 종목 목록
const noDividendTickers = computed(() => {
  const withDividend = new Set(calendarEvents.value.map((e) => e.ticker))
  const tickers = portfolios.value
    .filter((p) => p.asset_type !== '현금' && p.asset_type !== '암호화폐' && !withDividend.has(p.ticker))
    .map((p) => p.ticker)
  return [...new Set(tickers)]
})

function formatKrw(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만원`
  return v.toLocaleString() + '원'
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']

const refreshData = async () => {
  if (activeCacheKey.value) localStorage.removeItem(activeCacheKey.value)
  calendarEvents.value = []
  loading.value = true
  await loadData()
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex align-center ga-2 mb-6">
      <v-btn icon size="small" variant="text" @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div>
        <div class="font-weight-bold">배당 캘린더</div>
        <div class="text-medium-emphasis">보유 종목 배당락일 및 예상 배당금</div>
      </div>
      <v-spacer />
      <v-btn icon size="small" variant="text" :loading="loading" @click="refreshData">
        <v-icon size="20">mdi-refresh</v-icon>
      </v-btn>
    </div>

    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else>
      <div v-if="!portfolios.filter(p => p.asset_type !== '현금' && p.asset_type !== '암호화폐').length"
        class="text-center py-12 text-medium-emphasis">
        <v-icon size="48" class="mb-3">mdi-calendar-blank</v-icon>
        <div>보유 종목이 없어요.</div>
        <div class="mt-1">포트폴리오에 종목을 추가하면 배당 일정을 확인할 수 있어요.</div>
      </div>

      <template v-else>
        <!-- 요약 카드 -->
        <div class="d-flex ga-3 mb-4">
          <v-card rounded="xl" class="summary-card flex-1 pa-4 text-center">
            <div class="text-medium-emphasis mb-1">연간 예상 배당</div>
            <div class="font-weight-bold text-primary">
              {{ annualTotalKrw > 0 ? formatKrw(annualTotalKrw) : '-' }}
            </div>
          </v-card>
          <v-card rounded="xl" class="summary-card flex-1 pa-4 text-center">
            <div class="text-medium-emphasis mb-1">이번 달 배당</div>
            <div class="font-weight-bold" :class="monthTotalKrw > 0 ? 'text-success' : ''">
              {{ monthTotalKrw > 0 ? formatKrw(monthTotalKrw) : '-' }}
            </div>
          </v-card>
          <v-card rounded="xl" class="summary-card flex-1 pa-4 text-center">
            <div class="text-medium-emphasis mb-1">이번 달 지급</div>
            <div class="font-weight-bold">
              {{ currentMonthEvents.length > 0 ? currentMonthEvents.length + '건' : '-' }}
            </div>
          </v-card>
        </div>

        <!-- 월 이동 -->
        <div class="d-flex align-center justify-space-between mb-3">
          <v-btn icon size="small" variant="text" @click="prevMonth">
            <v-icon>mdi-chevron-left</v-icon>
          </v-btn>
          <div class="font-weight-bold">
            {{ selectedYear }}.{{ String(selectedMonth).padStart(2, '0') }}
          </div>
          <v-btn icon size="small" variant="text" @click="nextMonth">
            <v-icon>mdi-chevron-right</v-icon>
          </v-btn>
        </div>

        <!-- 달력 -->
        <v-card rounded="xl" class="pa-3 mb-4">
          <!-- 요일 헤더 -->
          <div class="cal-grid mb-1">
            <div
              v-for="wd in weekdays" :key="wd"
              class="cal-weekday"
              :class="wd === '일' ? 'text-error' : wd === '토' ? 'text-primary' : ''"
            >{{ wd }}</div>
          </div>
          <!-- 날짜 -->
          <div class="cal-grid">
            <div
              v-for="(cell, i) in calendarDays"
              :key="i"
              class="cal-cell"
              :class="{ 'has-event': cell.events.length > 0, 'selected': cell.day !== null && selectedDate === `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`, 'sunday': cell.day !== null && (i % 7 === 0), 'saturday': cell.day !== null && (i % 7 === 6), }"
              @click="onDayClick(cell.day, cell.events)"
            >
              <span v-if="cell.day" class="cal-day-num">{{ cell.day }}</span>
              <div v-if="cell.events.length" class="cal-dots">
                <span
                  v-for="ev in cell.events.slice(0, 3)"
                  :key="ev.ticker"
                  class="cal-dot"
                  :class="ev.isNext ? 'cal-dot-next' : ''"
                />
              </div>
            </div>
          </div>
        </v-card>

        <!-- 이번 달 전체 일정 -->
        <v-card rounded="xl" class="pa-4 mb-4">
          <div class="font-weight-medium mb-3">
            {{ selectedYear }}.{{ String(selectedMonth).padStart(2, '0') }} 배당 일정
          </div>
          <div v-if="!currentMonthEvents.length" class="text-center text-medium-emphasis py-4">
            이번 달 배당 일정이 없어요.
          </div>
          <div
            v-for="(ev, i) in currentMonthEvents"
            :key="ev.ticker + ev.date"
            class="event-row"
            :class="{ 'border-top': i > 0 }"
          >
            <div class="event-date">{{ ev.date.slice(5).replace('-', '.') }}</div>
            <div class="event-ticker">
              <div class="d-flex align-center ga-1" style="min-width: 0">
                <span class="font-weight-medium event-ticker-name">{{ getTickerDisplayName(ev.ticker) }}</span>
                <v-chip v-if="ev.isNext" size="x-small" color="warning" variant="tonal" class="flex-shrink-0">예정</v-chip>
              </div>
            </div>
            <div class="text-right">
              <div class="font-weight-bold" :class="ev.isNext ? 'text-warning' : 'text-primary'">
                {{ ev.totalAmountKrw > 0 ? formatKrw(ev.totalAmountKrw) : '금액 미정' }}
              </div>
            </div>
          </div>
        </v-card>

        <!-- 배당 정보 없는 종목 안내 -->
        <div v-if="noDividendTickers.length" class="text-medium-emphasis text-center">
          배당 정보 없음: {{ noDividendTickers.join(', ') }}
        </div>

        <div class="notice-text text-medium-emphasis mt-2">
          <div>* 배당락일은 과거 기반 예상치로 실제와 다를 수 있습니다.</div>
        </div>
      </template>
    </template>
  </v-container>

  <!-- 날짜 클릭 바텀시트 -->
  <v-bottom-sheet v-model="showSheet" :scrim="true">
    <v-card rounded="t-xl" class="pa-5">
      <div class="d-flex align-center ga-2 mb-4">
        <div class="font-weight-bold">
          {{ selectedDate?.replace(/-/g, '.') }} 배당락
        </div>
        <v-chip v-if="selectedDateEvents.some(e => e.isNext)" size="x-small" color="warning" variant="tonal">예정</v-chip>
        <v-spacer />
        <v-btn icon size="x-small" variant="text" @click="showSheet = false">
          <v-icon size="18">mdi-close</v-icon>
        </v-btn>
      </div>
      <div
        v-for="(ev, i) in selectedDateEvents"
        :key="ev.ticker"
        class="event-row"
        :class="{ 'border-top': i > 0 }"
      >
        <div class="event-ticker">
          <div class="d-flex align-center ga-1">
            <span class="font-weight-medium">{{ getTickerDisplayName(ev.ticker) }}</span>
            <v-chip v-if="ev.isNext" size="x-small" color="warning" variant="tonal">예정</v-chip>
          </div>
          <div class="text-medium-emphasis">{{ ev.ticker }}</div>
        </div>
        <div class="text-right">
          <div class="font-weight-bold" :class="ev.isNext ? 'text-warning' : 'text-primary'">
            {{ ev.totalAmountKrw > 0 ? formatKrw(ev.totalAmountKrw) : '금액 미정' }}
          </div>
          <div class="text-medium-emphasis">
            {{ ev.currency === 'USD' ? '$' : '₩' }}{{ formatAmountPerShare(ev) }} × {{ ev.quantity }}주
          </div>
        </div>
      </div>
      <div style="height: env(safe-area-inset-bottom, 8px)" />
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
.summary-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.cal-weekday {
  text-align: center;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 4px 0;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.cal-cell {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: default;
  position: relative;
  padding: 2px;
}
.cal-cell.has-event {
  cursor: pointer;
}
.cal-cell.has-event:active {
  opacity: 0.7;
}
.cal-cell.selected {
  background: rgba(var(--v-theme-primary), 0.15);
}
.cal-day-num {
  font-size: 0.75rem;
  line-height: 1;
}
.cal-cell.sunday .cal-day-num { color: rgb(var(--v-theme-error)); }
.cal-cell.saturday .cal-day-num { color: rgb(var(--v-theme-primary)); }
.cal-dots {
  display: flex;
  gap: 2px;
  margin-top: 2px;
}
.cal-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}
.cal-dot-next {
  background: rgb(var(--v-theme-warning));
}
.event-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
}
.border-top {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.event-date {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  width: 36px;
  flex-shrink: 0;
}
.event-ticker {
  flex: 1;
  min-width: 0;
}
.event-ticker-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.notice-text {
  text-align: left;
  padding: 0 2px;
}
</style>
