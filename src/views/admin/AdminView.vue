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

const stats = computed(() => ({
  total: logs.value.length,
  active: logs.value.filter((l) => !l.deleted_at).length,
  deleted: logs.value.filter((l) => !!l.deleted_at).length,
}))

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
    <div class="d-flex align-center ga-2 mb-6">
      <v-icon size="28" color="primary">mdi-shield-crown-outline</v-icon>
      <div>
        <div class="text-h5 font-weight-bold">관리자</div>
        <div class="text-body-2 text-medium-emphasis">회원 가입 이력</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="list-item-three-line@4" class="rounded-xl" />
    </template>

    <template v-else-if="isAdmin">
      <!-- 통계 카드 -->
      <div class="stat-grid mb-4">
        <div class="stat-card text-center">
          <div class="stat-label">총 가입자</div>
          <div class="stat-value">{{ stats.total }}명</div>
        </div>
        <div class="stat-card text-center">
          <div class="stat-label">활성 회원</div>
          <div class="stat-value" style="color: rgb(var(--v-theme-primary))">{{ stats.active }}명</div>
        </div>
        <div class="stat-card text-center">
          <div class="stat-label">탈퇴 회원</div>
          <div class="stat-value" style="color: rgba(var(--v-theme-on-surface), 0.4)">{{ stats.deleted }}명</div>
        </div>
      </div>

      <!-- 이력 목록 -->
      <div class="glass-card pa-4">
        <div class="section-label mb-3">가입 이력</div>

        <div v-if="logs.length === 0" class="text-center py-8 text-medium-emphasis text-body-2">
          아직 가입 이력이 없습니다
        </div>

        <div
          v-for="(log, i) in logs"
          :key="log.id"
          class="log-row"
          :class="{ 'mt-3': i > 0 }"
        >
          <div class="d-flex align-center ga-2">
            <v-icon size="16" :color="log.deleted_at ? 'error' : 'primary'">
              {{ log.deleted_at ? 'mdi-account-remove-outline' : 'mdi-account-check-outline' }}
            </v-icon>
            <span class="log-email">{{ log.email }}</span>
          </div>
          <div class="log-meta mt-1">
            <span>가입 {{ formatDate(log.signed_up_at) }}</span>
            <span v-if="log.deleted_at" class="log-deleted">· 탈퇴 {{ formatDate(log.deleted_at) }}</span>
          </div>
          <v-divider v-if="i < logs.length - 1" class="mt-3" opacity="0.06" />
        </div>
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}
.stat-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 16px;
  padding: 14px 8px;
}
.stat-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 6px;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}
.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.log-email {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.log-meta {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  padding-left: 24px;
}
.log-deleted {
  color: rgba(var(--v-theme-error), 0.7);
}
</style>
