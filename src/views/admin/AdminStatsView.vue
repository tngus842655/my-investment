<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { ADMIN_EMAIL } from '@/config/admin'
const router = useRouter()
const loading = ref(true)
const isAdmin = ref(false)

const KST = 'Asia/Seoul'

// ── 데이터 ────────────────────────────────────────
interface SignupRow  { email: string; signed_up_at: string }
interface AccessRow { email: string; accessed_at: string }

const signupRows = ref<SignupRow[]>([])
const accessRows = ref<AccessRow[]>([])

const periodOptions = ['7일', '30일', '90일'] as const
type Period = typeof periodOptions[number]
const selectedPeriod = ref<Period>('30일')

const periodDays = computed(() => ({ '7일': 7, '30일': 30, '90일': 90 }[selectedPeriod.value]))

// ── KST 날짜 문자열 (YYYY-MM-DD) ──────────────────
const toKstDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '-').replace('.', '')


// ── 기간 내 날짜 배열 생성 ──────────────────────────
const dateRange = computed(() => {
  const days = periodDays.value
  const result: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    result.push(d.toLocaleDateString('ko-KR', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\. /g, '-').replace('.', ''))
  }
  return result
})

// ── 가입 추이 ─────────────────────────────────────
const signupByDay = computed(() => {
  const map = new Map<string, number>()
  for (const r of signupRows.value) {
    const d = toKstDate(r.signed_up_at)
    map.set(d, (map.get(d) ?? 0) + 1)
  }
  return dateRange.value.map(d => ({ date: d, count: map.get(d) ?? 0 }))
})

// ── 일별 접속 추이 (날짜+이메일 unique → DAU) ────────
const accessByDay = computed(() => {
  const uniqueSet = new Set<string>()
  const map = new Map<string, number>()
  for (const r of accessRows.value) {
    const d = toKstDate(r.accessed_at)
    const key = `${d}:${r.email}`
    if (uniqueSet.has(key)) continue
    uniqueSet.add(key)
    map.set(d, (map.get(d) ?? 0) + 1)
  }
  return dateRange.value.map(d => ({ date: d, count: map.get(d) ?? 0 }))
})

// ── 접속 TOP 10 (유저별 접속 날짜 unique 수) ─────────
const accessRanking = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const r of accessRows.value) {
    const d = toKstDate(r.accessed_at)
    if (!map.has(r.email)) map.set(r.email, new Set())
    map.get(r.email)!.add(d)
  }
  return [...map.entries()]
    .map(([email, days]) => ({ email, count: days.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
})

// ── SVG 바 차트 공통 ──────────────────────────────
const VW = 320
const VH = 160
const PAD = { top: 16, right: 8, bottom: 32, left: 28 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom

const buildBarChart = (data: { date: string; count: number }[]) => {
  const maxVal = Math.max(...data.map(d => d.count), 1)
  const yMax = maxVal * 1.2
  const step = data.length
  const barW = Math.max(2, PW / step - 3)

  const toX = (i: number) => PAD.left + (i / step) * PW + PW / step / 2
  const toH = (v: number) => (v / yMax) * PH

  const yTicks = [0, Math.round(maxVal / 2), maxVal].filter((v, i, a) => a.indexOf(v) === i)

  // x축: 기간에 따라 라벨 간격 조정
  const labelStep = data.length <= 7 ? 1 : data.length <= 30 ? 5 : 15
  const xLabels = data
    .map((d, i) => ({ i, label: d.date.slice(5) }))
    .filter((_, i) => i % labelStep === 0 || i === data.length - 1)

  return { data, maxVal, yMax, barW, toX, toH, yTicks, xLabels }
}

const signupChart = computed(() => buildBarChart(signupByDay.value))
const accessChart = computed(() => buildBarChart(accessByDay.value))

// ── 날짜 클릭 팝업 ────────────────────────────────
const clickedDate = ref<string | null>(null)
const clickedType = ref<'signup' | 'access' | null>(null)

const clickedEmails = computed(() => {
  if (!clickedDate.value) return []
  if (clickedType.value === 'signup') {
    return signupRows.value
      .filter(r => toKstDate(r.signed_up_at) === clickedDate.value)
      .map(r => r.email)
  }
  const seen = new Set<string>()
  return accessRows.value
    .filter(r => {
      if (toKstDate(r.accessed_at) !== clickedDate.value) return false
      if (seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })
    .map(r => r.email)
})

const openDatePopup = (date: string, type: 'signup' | 'access') => {
  clickedDate.value = date
  clickedType.value = type
}

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    router.replace('/dashboard')
    return
  }
  isAdmin.value = true

  const since = new Date()
  since.setDate(since.getDate() - 90)

  const [signupRes, accessRes] = await Promise.all([
    supabase.from('signup_log').select('email, signed_up_at').gte('signed_up_at', since.toISOString()),
    supabase.from('access_log').select('email, accessed_at').gte('accessed_at', since.toISOString()),
  ])
  signupRows.value = (signupRes.data ?? []).filter(r => r.email !== ADMIN_EMAIL)
  accessRows.value = (accessRes.data ?? []).filter(r => r.email !== ADMIN_EMAIL)
  loading.value = false
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 640px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="text-h5 font-weight-bold">통계</div>
        <div class="text-body-2 text-medium-emphasis">가입 · 접속 현황</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="rounded-xl" />
    </template>

    <template v-else-if="isAdmin">
      <!-- 기간 선택 -->
      <div class="filter-wrap mb-4">
        <button
          v-for="p in periodOptions"
          :key="p"
          class="filter-btn"
          :class="{ active: selectedPeriod === p }"
          @click="selectedPeriod = p"
        >{{ p }}</button>
      </div>

      <!-- 신규 가입 추이 -->
      <div class="glass-card pa-4 mb-3">
        <div class="section-label mb-1">신규 가입 추이</div>
        <div class="text-caption text-medium-emphasis mb-3">
          기간 내 총 {{ signupByDay.reduce((s, d) => s + d.count, 0) }}명 가입
        </div>
        <div class="chart-wrap">
          <svg :viewBox="`0 0 ${VW} ${VH}`" class="chart-svg">
            <!-- y 격자 -->
            <template v-for="tick in signupChart.yTicks" :key="tick">
              <line
                :x1="PAD.left" :y1="VH - PAD.bottom - signupChart.toH(tick)"
                :x2="VW - PAD.right" :y2="VH - PAD.bottom - signupChart.toH(tick)"
                stroke="rgba(128,128,128,0.15)" stroke-width="1"
              />
              <text
                :x="PAD.left - 4" :y="VH - PAD.bottom - signupChart.toH(tick) + 4"
                text-anchor="end" class="chart-tick"
              >{{ tick }}</text>
            </template>
            <!-- 바 -->
            <rect
              v-for="(d, i) in signupChart.data" :key="d.date"
              :x="signupChart.toX(i) - signupChart.barW / 2"
              :y="VH - PAD.bottom - signupChart.toH(d.count)"
              :width="signupChart.barW"
              :height="signupChart.toH(d.count)"
              rx="2"
              :fill="d.count > 0 ? 'rgb(var(--v-theme-primary))' : 'rgba(128,128,128,0.15)'"
              :opacity="d.count > 0 ? 0.85 : 1"
              :style="d.count > 0 ? 'cursor:pointer' : ''"
              @click="d.count > 0 && openDatePopup(d.date, 'signup')"
            />
            <!-- x축 라벨 -->
            <text
              v-for="lbl in signupChart.xLabels" :key="lbl.i"
              :x="signupChart.toX(lbl.i)" :y="VH - PAD.bottom + 14"
              text-anchor="middle" class="chart-tick"
            >{{ lbl.label }}</text>
          </svg>
        </div>
      </div>

      <!-- 일별 접속 추이 -->
      <div class="glass-card pa-4 mb-3">
        <div class="section-label mb-1">일별 접속 추이</div>
        <div class="text-caption text-medium-emphasis mb-3">
          기간 내 총 {{ accessByDay.reduce((s, d) => s + d.count, 0) }}명 접속 (일별 유저 합산)
        </div>
        <div class="chart-wrap">
          <svg :viewBox="`0 0 ${VW} ${VH}`" class="chart-svg">
            <template v-for="tick in accessChart.yTicks" :key="tick">
              <line
                :x1="PAD.left" :y1="VH - PAD.bottom - accessChart.toH(tick)"
                :x2="VW - PAD.right" :y2="VH - PAD.bottom - accessChart.toH(tick)"
                stroke="rgba(128,128,128,0.15)" stroke-width="1"
              />
              <text
                :x="PAD.left - 4" :y="VH - PAD.bottom - accessChart.toH(tick) + 4"
                text-anchor="end" class="chart-tick"
              >{{ tick }}</text>
            </template>
            <rect
              v-for="(d, i) in accessChart.data" :key="d.date"
              :x="accessChart.toX(i) - accessChart.barW / 2"
              :y="VH - PAD.bottom - accessChart.toH(d.count)"
              :width="accessChart.barW"
              :height="accessChart.toH(d.count)"
              rx="2"
              :fill="d.count > 0 ? 'rgb(var(--v-theme-primary))' : 'rgba(128,128,128,0.15)'"
              :opacity="d.count > 0 ? 0.85 : 1"
              :style="d.count > 0 ? 'cursor:pointer' : ''"
              @click="d.count > 0 && openDatePopup(d.date, 'access')"
            />
            <text
              v-for="lbl in accessChart.xLabels" :key="lbl.i"
              :x="accessChart.toX(lbl.i)" :y="VH - PAD.bottom + 14"
              text-anchor="middle" class="chart-tick"
            >{{ lbl.label }}</text>
          </svg>
        </div>
      </div>

      <!-- 접속 TOP 10 -->
      <div class="glass-card pa-4">
        <div class="section-label mb-3">접속 TOP 10 (기간 내 접속 일수)</div>
        <div v-if="accessRanking.length === 0" class="text-center py-6 text-medium-emphasis text-body-2">
          데이터가 없습니다
        </div>
        <div v-for="(item, i) in accessRanking" :key="item.email">
          <div class="rank-row" :class="{ 'mt-2': i > 0 }">
            <div class="d-flex align-center ga-3">
              <span class="rank-num" :class="i < 3 ? 'rank-top' : ''">{{ i + 1 }}</span>
              <span class="rank-email">{{ item.email }}</span>
            </div>
            <div class="d-flex align-center ga-2">
              <div class="rank-bar-wrap">
                <div
                  class="rank-bar"
                  :style="`width: ${(item.count / accessRanking[0]!.count) * 100}%`"
                />
              </div>
              <span class="rank-count">{{ item.count }}일</span>
            </div>
          </div>
          <v-divider v-if="i < accessRanking.length - 1" class="mt-2" opacity="0.06" />
        </div>
      </div>
    </template>
  </v-container>

  <!-- 날짜 클릭 팝업 -->
  <v-dialog :model-value="!!clickedDate" max-width="320" @update:model-value="clickedDate = null">
    <v-card rounded="xl" class="pa-2">
      <v-card-title class="text-body-1 font-weight-bold pt-4 px-4">
        {{ clickedDate }} · {{ clickedType === 'signup' ? '가입' : '접속' }}
      </v-card-title>
      <v-card-text class="px-4 pb-2">
        <div v-if="clickedEmails.length === 0" class="text-body-2 text-medium-emphasis py-2">
          해당 날짜에 데이터가 없습니다
        </div>
        <div v-for="(email, i) in clickedEmails" :key="email">
          <div class="d-flex align-center ga-2 py-1">
            <v-icon size="13" color="primary">mdi-account-outline</v-icon>
            <span style="font-size:13px; font-weight:600">{{ email }}</span>
          </div>
          <v-divider v-if="i < clickedEmails.length - 1" opacity="0.06" />
        </div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-btn variant="tonal" rounded="lg" block @click="clickedDate = null">닫기</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.back-btn {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 50%;
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0;
  transition: opacity 0.15s;
}
.back-btn:active { opacity: 0.6; }

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}

.section-label {
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.filter-wrap {
  display: flex; gap: 6px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 12px; padding: 4px;
}
.filter-btn {
  flex: 1; padding: 6px 0; border: none; border-radius: 9px;
  font-size: 13px; font-weight: 500; cursor: pointer;
  background: transparent; color: rgba(var(--v-theme-on-surface), 0.55);
  transition: background 0.18s, color 0.18s;
}
.filter-btn.active {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
}

.chart-wrap { width: 100%; }
.chart-svg { width: 100%; height: auto; display: block; }
.chart-tick {
  font-size: 8px;
  fill: rgba(128,128,128,0.7);
}

.rank-row {
  display: flex; align-items: center;
  justify-content: space-between; gap: 8px;
}
.rank-num {
  font-size: 12px; font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.35);
  width: 18px; text-align: center; flex-shrink: 0;
}
.rank-top { color: rgb(var(--v-theme-primary)); }
.rank-email {
  font-size: 13px; font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rank-bar-wrap {
  width: 60px; height: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 3px; overflow: hidden; flex-shrink: 0;
}
.rank-bar {
  height: 100%; border-radius: 3px;
  background: rgb(var(--v-theme-primary));
  transition: width 0.4s ease;
}
.rank-count {
  font-size: 12px; font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  min-width: 28px; text-align: right; flex-shrink: 0;
}
</style>
