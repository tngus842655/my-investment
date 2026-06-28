<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { ADMIN_EMAIL } from '@/config/admin'

const router = useRouter()
const loading = ref(false)
const isAdmin = ref(false)

interface AccessLog {
  id: string
  email: string
  page: string
  accessed_at: string
}

const logs = ref<AccessLog[]>([])
const emailSearch = ref('')
const dateSearch = ref('')
const pageSearch = ref('')

const parseDateInput = (val: string) => {
  const v = val.replace(/-/g, '').trim()
  if (v.length === 6) return `${v.slice(0, 4)}-${v.slice(4, 6)}`
  if (v.length === 8) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
  return null
}

const nextDatePrefix = (prefix: string) => {
  if (prefix.length === 7) {
    const [y, m] = prefix.split('-').map(Number)
    const next = m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, '0')}`
    return `${next}-01T00:00:00+09:00`
  }
  const d = new Date(`${prefix}T00:00:00+09:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

const search = async () => {
  loading.value = true
  try {
    let query = supabase
      .from('access_log')
      .select('id, email, page, accessed_at')
      .order('accessed_at', { ascending: false })
      .limit(100)

    if (emailSearch.value.trim()) {
      query = query.ilike('email', `%${emailSearch.value.trim()}%`)
    }

    if (pageSearch.value.trim()) {
      query = query.ilike('page', `%${pageSearch.value.trim()}%`)
    }

    const datePrefix = parseDateInput(dateSearch.value)
    if (datePrefix) {
      query = query
        .gte('accessed_at', `${datePrefix}T00:00:00+09:00`)
        .lt('accessed_at', nextDatePrefix(datePrefix))
    }

    const { data } = await query
    logs.value = (data ?? []) as AccessLog[]
  } finally {
    loading.value = false
  }
}

const KST = 'Asia/Seoul'
const formatDate = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}.${pad(+get('month'))}.${pad(+get('day'))} (${get('hour')}:${get('minute')}:${pad(d.getSeconds())})`
}

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': '대시보드',
  '/portfolio': '포트폴리오',
  '/transactions': '거래 내역',
  '/analysis': '분석',
  '/more': '더보기',
  '/portfolio-analysis': '포트폴리오 분석',
  '/badges': '뱃지',
  '/fire-simulator': 'FIRE 시뮬레이터',
  '/fire-history': 'FIRE 히스토리',
  '/asset-growth': '자산 성장',
  '/dividend-calendar': '배당 캘린더',
  '/etf-analysis': 'ETF 분석',
  '/feedback': '피드백',
  '/change-password': '비밀번호 변경',
  '/goalSettings': '목표 설정',
}

const pageLabel = (page: string) => PAGE_LABELS[page] ?? page

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    router.replace('/dashboard')
    return
  }
  isAdmin.value = true
  await search()
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 600px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="text-h5 font-weight-bold">페이지 접속 이력</div>
        <div class="text-body-2 text-medium-emphasis">회원 페이지 방문 기록</div>
      </div>
    </div>

    <template v-if="isAdmin">
      <!-- 조회 조건 -->
      <div class="glass-card pa-4 mb-3">
        <div class="section-label mb-3">조회 조건</div>
        <v-text-field
          v-model="emailSearch"
          placeholder="이메일 검색"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          class="mb-3"
          bg-color="transparent"
          @keyup.enter="search"
        />
        <v-text-field
          v-model="pageSearch"
          placeholder="페이지 검색 (예: dashboard)"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          clearable
          prepend-inner-icon="mdi-file-outline"
          class="mb-3"
          bg-color="transparent"
          @keyup.enter="search"
        />
        <v-text-field
          v-model="dateSearch"
          placeholder="예) 202506 또는 20250601"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          clearable
          prepend-inner-icon="mdi-calendar-month-outline"
          bg-color="transparent"
          maxlength="8"
          class="mb-3"
          @keyup.enter="search"
        />
        <v-btn
          variant="tonal"
          color="primary"
          rounded="lg"
          block
          prepend-icon="mdi-magnify"
          :loading="loading"
          @click="search"
        >조회</v-btn>
      </div>

      <!-- 결과 -->
      <div class="glass-card pa-4">
        <template v-if="loading">
          <v-skeleton-loader type="list-item-three-line@5" />
        </template>
        <template v-else>
          <div class="section-label mb-3">
            조회 결과 ({{ logs.length }}건{{ logs.length === 100 ? ', 최대 100건' : '' }})
          </div>
          <div v-if="logs.length === 0" class="text-center py-8 text-medium-emphasis text-body-2">
            조회된 이력이 없습니다
          </div>
          <div v-for="(log, i) in logs" :key="log.id">
            <div :class="{ 'mt-2': i > 0 }">
              <div class="d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-2 mr-2" style="min-width: 0">
                  <v-icon size="15" color="primary">mdi-file-eye-outline</v-icon>
                  <div style="min-width: 0">
                    <div class="log-email text-truncate">{{ log.email }}</div>
                    <div class="log-page">{{ pageLabel(log.page) }}</div>
                  </div>
                </div>
                <span class="log-date">{{ formatDate(log.accessed_at) }}</span>
              </div>
            </div>
            <v-divider v-if="i < logs.length - 1" class="mt-2" opacity="0.06" />
          </div>
        </template>
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

.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.log-email {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.log-page {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-top: 1px;
}
.log-date {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
