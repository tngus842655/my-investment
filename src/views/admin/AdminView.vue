<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

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

const deleteTarget = ref<SignupLog | null>(null)
const deleteDialog = ref(false)
const deleteLoading = ref(false)

const confirmDelete = (log: SignupLog) => {
  deleteTarget.value = log
  deleteDialog.value = true
}

const executeDelete = async () => {
  if (!deleteTarget.value) return
  deleteLoading.value = true
  try {
    const now = new Date().toISOString()

    // signup_log 탈퇴 처리
    const { error } = await supabase
      .from('signup_log')
      .update({ deleted_at: now })
      .eq('id', deleteTarget.value.id)
    if (error) { showMessage('signup_log 오류: ' + error.message, 'error'); return }

    // Auth 계정 삭제 (Edge Function)
    const { data: { session } } = await supabase.auth.getSession()
    const fnRes = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: deleteTarget.value.email }),
      },
    )
    if (!fnRes.ok) {
      const fnErr = await fnRes.json().catch(() => ({ error: fnRes.statusText }))
      showMessage('Auth 삭제 오류: ' + fnErr.error, 'error')
      return
    }

    const idx = logs.value.findIndex(l => l.id === deleteTarget.value!.id)
    if (idx !== -1) {
      const cur = logs.value[idx]!
      logs.value[idx] = { id: cur.id, email: cur.email, signed_up_at: cur.signed_up_at, deleted_at: now }
    }
    deleteDialog.value = false
  } finally {
    deleteLoading.value = false
  }
}

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
              <div class="d-flex align-center ga-2">
                <v-chip
                  :color="log.deleted_at ? 'error' : 'primary'"
                  size="x-small"
                  variant="tonal"
                >{{ log.deleted_at ? '탈퇴' : '활성' }}</v-chip>
                <button
                  v-if="!log.deleted_at"
                  class="del-btn"
                  @click="confirmDelete(log)"
                >
                  <v-icon size="14">mdi-account-remove-outline</v-icon>
                </button>
              </div>
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

  <!-- 탈퇴 처리 확인 다이얼로그 -->
  <v-dialog v-model="deleteDialog" max-width="320">
    <v-card rounded="xl" class="pa-2">
      <v-card-title class="text-body-1 font-weight-bold pt-4 px-4">탈퇴 처리</v-card-title>
      <v-card-text class="px-4 pb-2">
        <div class="text-body-2 text-medium-emphasis mb-1">아래 회원을 탈퇴 처리합니다.</div>
        <div class="text-body-2 font-weight-bold">{{ deleteTarget?.email }}</div>
        <div class="text-caption text-error mt-2">이 작업은 되돌릴 수 없습니다.</div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4 ga-2">
        <v-btn variant="tonal" rounded="lg" block @click="deleteDialog = false">취소</v-btn>
        <v-btn color="error" variant="flat" rounded="lg" block :loading="deleteLoading" @click="executeDelete">탈퇴 처리</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
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

.del-btn {
  background: rgba(var(--v-theme-error), 0.08);
  border: none;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgb(var(--v-theme-error));
  opacity: 0.7;
  transition: opacity 0.15s;
}
.del-btn:active { opacity: 1; }
</style>
