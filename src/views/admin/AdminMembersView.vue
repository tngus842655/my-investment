<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'

const ADMIN_EMAIL = 'tngus842655@gmail.com'
const router = useRouter()
const loading = ref(true)
const isAdmin = ref(false)

// ── 데이터 ────────────────────────────────────────
interface GoalRow {
  user_id: string
  target_asset: number
  monthly_investment: number
  annual_return: number | null
}
interface PortfolioRow { user_id: string; ticker: string }
interface TransactionRow { user_id: string }
interface SignupRow { deleted_at: string | null }

const goals       = ref<GoalRow[]>([])
const portfolios  = ref<PortfolioRow[]>([])
const transactions = ref<TransactionRow[]>([])
const signups     = ref<SignupRow[]>([])

// ── 집계 ──────────────────────────────────────────
const totalActive = computed(() => signups.value.filter(s => !s.deleted_at).length)

const goalStats = computed(() => {
  const g = goals.value
  if (!g.length) return null
  const avgTarget = Math.round(g.reduce((s, r) => s + r.target_asset, 0) / g.length)
  const avgMonthly = Math.round(g.reduce((s, r) => s + r.monthly_investment, 0) / g.length)
  const withReturn = g.filter(r => r.annual_return != null)
  const avgReturn = withReturn.length
    ? (withReturn.reduce((s, r) => s + r.annual_return!, 0) / withReturn.length).toFixed(1)
    : null
  return { count: g.length, avgTarget, avgMonthly, avgReturn }
})

const portfolioUserCount = computed(() =>
  new Set(portfolios.value.map(p => p.user_id)).size
)

const txUserCount = computed(() =>
  new Set(transactions.value.map(t => t.user_id)).size
)

// 목표 설정은 했지만 포트폴리오 미등록
const noPortfolioCount = computed(() => {
  const pUsers = new Set(portfolios.value.map(p => p.user_id))
  return goals.value.filter(g => !pUsers.has(g.user_id)).length
})

// 인기 종목 TOP 10
const topTickers = computed(() => {
  const map = new Map<string, number>()
  for (const p of portfolios.value) map.set(p.ticker, (map.get(p.ticker) ?? 0) + 1)
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ticker, count]) => ({ ticker, count }))
})

// ── 포맷 ──────────────────────────────────────────
const fmtWon = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만원`
  return `${v.toLocaleString()}원`
}

const activationRate = computed(() =>
  totalActive.value > 0
    ? Math.round((goalStats.value?.count ?? 0) / totalActive.value * 100)
    : 0
)

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    router.replace('/dashboard')
    return
  }
  isAdmin.value = true

  const [goalRes, portRes, txRes, signupRes] = await Promise.all([
    supabase.from('investment_goals').select('user_id, target_asset, monthly_investment, annual_return'),
    supabase.from('portfolios').select('user_id, ticker'),
    supabase.from('transactions').select('user_id'),
    supabase.from('signup_log').select('deleted_at'),
  ])

  goals.value       = goalRes.data ?? []
  portfolios.value  = portRes.data ?? []
  transactions.value = txRes.data ?? []
  signups.value     = signupRes.data ?? []
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
        <div class="text-h5 font-weight-bold">회원 현황</div>
        <div class="text-body-2 text-medium-emphasis">활동 및 투자 현황</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="rounded-xl" />
    </template>

    <template v-else-if="isAdmin">

      <!-- 활동 현황 -->
      <div class="section-label mb-2">활동 현황</div>
      <div class="stat-grid mb-3">
        <div class="stat-card">
          <div class="stat-label">활성 회원</div>
          <div class="stat-value">{{ totalActive }}<span class="stat-unit">명</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">목표 설정 완료</div>
          <div class="stat-value" style="color: rgb(var(--v-theme-primary))">
            {{ goalStats?.count ?? 0 }}<span class="stat-unit">명</span>
          </div>
          <div class="stat-sub">활성 회원의 {{ activationRate }}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">포트폴리오 등록</div>
          <div class="stat-value" style="color: rgb(var(--v-theme-primary))">
            {{ portfolioUserCount }}<span class="stat-unit">명</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">거래 내역 있음</div>
          <div class="stat-value" style="color: rgb(var(--v-theme-primary))">
            {{ txUserCount }}<span class="stat-unit">명</span>
          </div>
        </div>
      </div>

      <!-- 이탈 현황 -->
      <div class="glass-card pa-4 mb-3">
        <div class="section-label mb-3">이탈 현황</div>
        <div class="extra-row">
          <span class="extra-label">목표 설정 후 포트폴리오 미등록</span>
          <span class="extra-value text-warning">{{ noPortfolioCount }}명</span>
        </div>
        <v-divider class="my-2" opacity="0.06" />
        <div class="extra-row">
          <span class="extra-label">가입 후 목표 미설정</span>
          <span class="extra-value text-warning">{{ totalActive - (goalStats?.count ?? 0) }}명</span>
        </div>
      </div>

      <!-- 투자 목표 평균 -->
      <div class="glass-card pa-4 mb-3" v-if="goalStats">
        <div class="section-label mb-3">투자 목표 평균</div>
        <div class="extra-row">
          <span class="extra-label">평균 목표 자산</span>
          <span class="extra-value">{{ fmtWon(goalStats.avgTarget) }}</span>
        </div>
        <v-divider class="my-2" opacity="0.06" />
        <div class="extra-row">
          <span class="extra-label">평균 월 투자금</span>
          <span class="extra-value">{{ fmtWon(goalStats.avgMonthly) }}</span>
        </div>
        <v-divider class="my-2" opacity="0.06" />
        <div class="extra-row">
          <span class="extra-label">평균 기대 수익률</span>
          <span class="extra-value">{{ goalStats.avgReturn ? goalStats.avgReturn + '%' : '-' }}</span>
        </div>
      </div>

      <!-- 인기 종목 TOP 10 -->
      <div class="glass-card pa-4">
        <div class="section-label mb-3">인기 보유 종목 TOP 10</div>
        <div v-if="topTickers.length === 0" class="text-center py-6 text-medium-emphasis text-body-2">
          데이터가 없습니다
        </div>
        <div v-for="(item, i) in topTickers" :key="item.ticker">
          <div class="rank-row" :class="{ 'mt-2': i > 0 }">
            <div class="d-flex align-center ga-3">
              <span class="rank-num" :class="i < 3 ? 'rank-top' : ''">{{ i + 1 }}</span>
              <span class="rank-ticker">{{ item.ticker }}</span>
            </div>
            <div class="d-flex align-center ga-2">
              <div class="rank-bar-wrap">
                <div
                  class="rank-bar"
                  :style="`width: ${(item.count / topTickers[0]!.count) * 100}%`"
                />
              </div>
              <span class="rank-count">{{ item.count }}명</span>
            </div>
          </div>
          <v-divider v-if="i < topTickers.length - 1" class="mt-2" opacity="0.06" />
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
  font-size: 26px; font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.1;
}
.stat-unit {
  font-size: 13px; font-weight: 500; margin-left: 2px;
}
.stat-sub {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  margin-top: 2px;
}

.extra-row {
  display: flex; justify-content: space-between;
  align-items: center; gap: 8px; padding: 2px 0;
}
.extra-label {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.extra-value {
  font-size: 12px; font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.text-warning { color: #f59e0b !important; }

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
.rank-ticker {
  font-size: 13px; font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
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
