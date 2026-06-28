<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { ADMIN_EMAIL } from '@/config/admin'
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
const newFeedbackCount = ref(0)
const todaySignupCount = ref(0)
const todayAccessCount = ref(0)

const stats = computed(() => {
  const total = logs.value.length
  const active = logs.value.filter((l) => !l.deleted_at).length
  const deleted = logs.value.filter((l) => !!l.deleted_at).length
  const retentionRate = total > 0 ? Math.round((active / total) * 100) : 0

  const deletedLogs = logs.value.filter((l) => !!l.deleted_at)
  const avgDays = deletedLogs.length > 0
    ? Math.round(
        deletedLogs.reduce((sum, l) => {
          const diff = new Date(l.deleted_at!).getTime() - new Date(l.signed_up_at).getTime()
          return sum + diff / (1000 * 60 * 60 * 24)
        }, 0) / deletedLogs.length,
      )
    : null

  const sorted = [...logs.value].sort(
    (a, b) => new Date(b.signed_up_at).getTime() - new Date(a.signed_up_at).getTime(),
  )
  const lastSignup = sorted[0] ?? null
  const lastDeleted = [...logs.value]
    .filter((l) => l.deleted_at)
    .sort((a, b) => new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime())[0] ?? null

  return { total, active, deleted, retentionRate, avgDays, lastSignup, lastDeleted }
})

const KST = 'Asia/Seoul'

const todayLabel = new Date().toLocaleDateString('ko-KR', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' })
  .replace(/\. /g, '.').replace(/\.$/, '')

const formatDateShort = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}.${pad(+get('month'))}.${pad(+get('day'))} (${get('hour')}:${get('minute')})`
}

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    router.replace('/dashboard')
    return
  }
  isAdmin.value = true

  // 오늘 KST 00:00 기준
  const todayStart = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '-').replace('.', '')
  const todayFrom = `${todayStart}T00:00:00+09:00`

  const [{ data }, { count }, { count: signupToday }, accessTodayRes] = await Promise.all([
    supabase.from('signup_log').select('*').order('signed_up_at', { ascending: false }),
    supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'NEW'),
    supabase.from('signup_log').select('id', { count: 'exact', head: true }).gte('signed_up_at', todayFrom),
    supabase.from('access_log').select('email').gte('accessed_at', todayFrom),
  ])
  logs.value = data ?? []
  newFeedbackCount.value = count ?? 0
  todaySignupCount.value = signupToday ?? 0
  // 오늘 접속 unique 유저 수
  todayAccessCount.value = new Set((accessTodayRes.data ?? []).map(r => r.email)).size
  loading.value = false
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 600px">
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
      <v-skeleton-loader type="card" class="rounded-xl" />
    </template>

    <template v-else-if="isAdmin">
      <!-- 오늘 현황 -->
      <div class="glass-card pa-4 mb-3">
        <div class="today-label mb-3 text-center">오늘 현황 ({{ todayLabel }})</div>
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">신규 가입</div>
            <div class="stat-value" :style="todaySignupCount > 0 ? 'color: rgb(var(--v-theme-primary))' : ''">
              {{ todaySignupCount }}<span class="stat-unit">명</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">접속 유저</div>
            <div class="stat-value" :style="todayAccessCount > 0 ? 'color: rgb(var(--v-theme-primary))' : ''">
              {{ todayAccessCount }}<span class="stat-unit">명</span>
            </div>
          </div>
        </div>
      </div>

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
          <span class="extra-value">{{ stats.avgDays !== null ? stats.avgDays + '일' : '데이터 없음' }}</span>
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

      <!-- 관리 메뉴 -->
      <div class="glass-card pa-4">
        <div class="section-label mb-3">관리 메뉴</div>
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-account-plus-outline" class="mb-2" @click="router.push('/admin/signup-log')">
          가입 이력 조회
        </v-btn>
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-history" class="mb-2" @click="router.push('/admin/access-history')">
          이력 조회
        </v-btn>
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-account-group-outline" class="mb-2" @click="router.push('/admin/members')">
          회원 현황
        </v-btn>
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-chart-bar" class="mb-2" @click="router.push('/admin/stats')">
          통계
        </v-btn>
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-lock-reset" class="mb-2" @click="router.push('/admin/reset-password')">
          회원 비밀번호 재설정
        </v-btn>
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-database-sync-outline" class="mb-2" @click="router.push('/admin/data')">
          데이터 관리
        </v-btn>
        <v-btn variant="tonal" color="primary" rounded="lg" block prepend-icon="mdi-message-text-outline" @click="router.push('/admin/feedback')">
          사용자 의견
          <v-badge v-if="newFeedbackCount > 0" :content="newFeedbackCount" color="error" inline class="ml-2" />
        </v-btn>
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
.today-label {
  font-size: 14px;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.6);
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
</style>
