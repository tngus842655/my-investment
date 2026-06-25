<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'

const ADMIN_EMAIL = 'tngus842655@gmail.com'
const router = useRouter()
const loading = ref(true)
const isAdmin = ref(false)

interface SignupLog {
  id: string
  email: string
  signed_up_at: string
  deleted_at: string | null
}

const logs = ref<SignupLog[]>([])

// ── 통계 ─────────────────────────────────────────
const stats = computed(() => {
  const total = logs.value.length
  const active = logs.value.filter((l) => !l.deleted_at).length
  const deleted = logs.value.filter((l) => !!l.deleted_at).length
  const retentionRate = total > 0 ? Math.round((active / total) * 100) : 0

  // 평균 활동 기간 (탈퇴자 기준)
  const deletedLogs = logs.value.filter((l) => !!l.deleted_at)
  const avgDays = deletedLogs.length > 0
    ? Math.round(
        deletedLogs.reduce((sum, l) => {
          const diff = new Date(l.deleted_at!).getTime() - new Date(l.signed_up_at).getTime()
          return sum + diff / (1000 * 60 * 60 * 24)
        }, 0) / deletedLogs.length,
      )
    : null

  // 최근 가입 / 최근 탈퇴
  const sorted = [...logs.value].sort(
    (a, b) => new Date(b.signed_up_at).getTime() - new Date(a.signed_up_at).getTime(),
  )
  const lastSignup = sorted[0] ?? null
  const lastDeleted = [...logs.value]
    .filter((l) => l.deleted_at)
    .sort((a, b) => new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime())[0] ?? null

  return { total, active, deleted, retentionRate, avgDays, lastSignup, lastDeleted }
})

// ── 월별 가입 추이 SVG 바 차트 ────────────────────
const monthlyChart = computed(() => {
  if (logs.value.length === 0) return null

  const map = new Map<string, { signup: number; deleted: number }>()
  for (const l of logs.value) {
    const d = new Date(l.signed_up_at)
    const key = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`
    const cur = map.get(key) ?? { signup: 0, deleted: 0 }
    cur.signup++
    if (l.deleted_at) cur.deleted++
    map.set(key, cur)
  }

  const entries = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6) // 최근 6개월

  const maxVal = Math.max(...entries.map(([, v]) => v.signup), 1)
  const VH = 80
  return entries.map(([label, v], i) => ({
    label: label.slice(5), // MM
    signup: v.signup,
    deleted: v.deleted,
    barH: Math.round((v.signup / maxVal) * VH),
    x: i * 40 + 16,
  }))
})

// ── 포맷 ─────────────────────────────────────────
const formatDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const formatDateShort = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    router.replace('/dashboard')
    return
  }
  isAdmin.value = true
  const { data } = await supabase
    .from('signup_log')
    .select('*')
    .order('signed_up_at', { ascending: false })
  logs.value = data ?? []
  loading.value = false
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 600px">
    <!-- 헤더 -->
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="text-h5 font-weight-bold">관리자</div>
        <div class="text-body-2 text-medium-emphasis">회원 현황 대시보드</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="list-item-three-line@3" class="rounded-xl" />
    </template>

    <template v-else-if="isAdmin">

      <!-- 핵심 지표 4개 -->
      <div class="stat-grid mb-3">
        <div class="stat-card">
          <div class="stat-label">총 가입자</div>
          <div class="stat-value">{{ stats.total }}<span class="stat-unit">명</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">활성 회원</div>
          <div class="stat-value" style="color: rgb(var(--v-theme-primary))">{{ stats.active }}<span class="stat-unit">명</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">탈퇴 회원</div>
          <div class="stat-value text-error">{{ stats.deleted }}<span class="stat-unit">명</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">잔존율</div>
          <div class="stat-value" style="color: rgb(var(--v-theme-primary))">{{ stats.retentionRate }}<span class="stat-unit">%</span></div>
        </div>
      </div>

      <!-- 부가 지표 -->
      <div class="glass-card pa-4 mb-3">
        <div class="section-label mb-3">부가 지표</div>
        <div class="extra-row">
          <span class="extra-label">탈퇴자 평균 활동 기간</span>
          <span class="extra-value">
            {{ stats.avgDays !== null ? stats.avgDays + '일' : '데이터 없음' }}
          </span>
        </div>
        <v-divider class="my-2" opacity="0.06" />
        <div class="extra-row">
          <span class="extra-label">최근 가입</span>
          <span class="extra-value">
            {{ stats.lastSignup ? stats.lastSignup.email + ' · ' + formatDateShort(stats.lastSignup.signed_up_at) : '-' }}
          </span>
        </div>
        <v-divider class="my-2" opacity="0.06" />
        <div class="extra-row">
          <span class="extra-label">최근 탈퇴</span>
          <span class="extra-value text-error">
            {{ stats.lastDeleted ? stats.lastDeleted.email + ' · ' + formatDateShort(stats.lastDeleted.deleted_at!) : '-' }}
          </span>
        </div>
      </div>

      <!-- 월별 가입 추이 -->
      <div v-if="monthlyChart" class="glass-card pa-4 mb-3">
        <div class="section-label mb-4">월별 가입 추이 (최근 6개월)</div>
        <svg width="100%" :viewBox="`0 0 ${monthlyChart.length * 40 + 16} 110`" style="overflow: visible">
          <g v-for="item in monthlyChart" :key="item.label">
            <!-- 바 -->
            <rect
              :x="item.x"
              :y="90 - item.barH"
              width="24"
              :height="item.barH"
              rx="6"
              fill="rgb(var(--v-theme-primary))"
              opacity="0.8"
            />
            <!-- 가입 수 -->
            <text
              :x="item.x + 12"
              :y="85 - item.barH"
              text-anchor="middle"
              font-size="10"
              font-weight="700"
              fill="rgb(var(--v-theme-primary))"
            >{{ item.signup }}</text>
            <!-- 월 레이블 -->
            <text
              :x="item.x + 12"
              y="104"
              text-anchor="middle"
              font-size="9"
              fill="rgba(var(--v-theme-on-surface), 0.4)"
            >{{ item.label }}월</text>
          </g>
        </svg>
      </div>

      <!-- 가입 이력 목록 -->
      <div class="glass-card pa-4">
        <div class="section-label mb-3">전체 가입 이력 ({{ logs.length }}건)</div>

        <div v-if="logs.length === 0" class="text-center py-8 text-medium-emphasis text-body-2">
          아직 가입 이력이 없습니다
        </div>

        <div v-for="(log, i) in logs" :key="log.id">
          <div class="log-row" :class="{ 'mt-2': i > 0 }">
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center ga-2">
                <v-icon size="15" :color="log.deleted_at ? 'error' : 'primary'">
                  {{ log.deleted_at ? 'mdi-account-remove-outline' : 'mdi-account-check-outline' }}
                </v-icon>
                <span class="log-email">{{ log.email }}</span>
              </div>
              <v-chip
                :color="log.deleted_at ? 'error' : 'primary'"
                size="x-small"
                variant="tonal"
              >{{ log.deleted_at ? '탈퇴' : '활성' }}</v-chip>
            </div>
            <div class="log-meta mt-1">
              <span>가입 {{ formatDate(log.signed_up_at) }}</span>
            </div>
            <div v-if="log.deleted_at" class="log-meta log-deleted">
              탈퇴 {{ formatDate(log.deleted_at) }}
            </div>
          </div>
          <v-divider v-if="i < logs.length - 1" class="mt-2" opacity="0.06" />
        </div>
      </div>

    </template>
  </v-container>
</template>

<style scoped>
.back-btn {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.back-btn:active { opacity: 0.6; }

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.stat-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 16px;
  padding: 14px 16px;
}
.stat-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 4px;
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.1;
}
.stat-unit {
  font-size: 13px;
  font-weight: 500;
  margin-left: 2px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.extra-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.extra-label {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.extra-value {
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  text-align: right;
}

.log-email {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.log-meta {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  padding-left: 23px;
}
.log-deleted {
  color: rgba(var(--v-theme-error), 0.65);
}
</style>
