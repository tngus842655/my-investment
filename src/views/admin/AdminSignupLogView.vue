<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { isAdminEmail } from '@/config/admin'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getTickerDisplayName } from '@/utils/tickerNames'
import { getStockPrice } from '@/services/market'
import { isCrypto as isCryptoItem } from '@/config/marketConfig'
import ProviderBadges from '@/components/common/ProviderBadges.vue'
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
const confirmedMap = ref<Record<string, boolean>>({})
const providerMap = ref<Record<string, string[]>>({})
const deleteTarget = ref<SignupLog | null>(null)
const deleteDialog = ref(false)
const deleteLoading = ref(false)
const deletePassword = ref('')
const deletePasswordVisible = ref(false)
const deletePasswordError = ref('')

// ── 회원 상세 ──────────────────────────────────────
interface PortfolioItem {
  ticker: string
  quantity: number
  avg_price: number
  currency: string
  asset_class?: import('@/config/marketConfig').AssetClass
  market?: import('@/config/marketConfig').MarketCode | null
  evaluationAmountKrw?: number
  profitRate?: number | null
}

interface MemberDetail {
  email: string
  signed_up_at: string
  last_accessed_at: string | null
  session_count: number
  target_asset: number | null
  monthly_investment: number | null
  annual_return: number | null
  current_asset: number | null
  investment_principal: number | null
  cash_total_krw: number
  portfolio_count: number
  portfolios: PortfolioItem[]
}

const detailDialog = ref(false)
const detailLoading = ref(false)
const detail = ref<MemberDetail | null>(null)
const portfolioDialog = ref(false)

const openDetail = async (log: SignupLog) => {
  detailDialog.value = true
  detailLoading.value = true
  detail.value = null

  try {
    // login_log에서 user_id 조회
    const { data: loginData } = await supabase
      .from('login_log')
      .select('user_id')
      .eq('email', log.email)
      .limit(1)

    const userId = loginData?.[0]?.user_id ?? null

    let goal = null
    let assetSummary = null
    let portfolioCount = 0
    let portfolioItems: PortfolioItem[] = []
    let lastAccessedAt: string | null = null
    let sessionCount = 0

    let cashTotalKrw = 0

    if (userId) {
      const [goalRes, assetRes, portRes, accessRes, rate] = await Promise.all([
        supabase.from('investment_goals').select('target_asset, monthly_investment, annual_return').eq('user_id', userId).maybeSingle(),
        supabase.from('asset_summary').select('current_asset, investment_principal').eq('user_id', userId).maybeSingle(),
        supabase.from('portfolios').select('ticker, quantity, avg_price, currency, asset_class, market').eq('user_id', userId).order('sort_order'),
        supabase.from('access_log').select('accessed_at').eq('user_id', userId).order('accessed_at', { ascending: true }),
        getCachedExchangeRate(),
      ])
      goal = goalRes.data
      assetSummary = assetRes.data
      portfolioItems = (portRes.data ?? []) as PortfolioItem[]
      portfolioCount = portfolioItems.length

      cashTotalKrw = portfolioItems
        .filter(p => p.ticker === 'CASH_KRW' || p.ticker === 'CASH_USD')
        .reduce((sum, p) => sum + (p.currency === 'USD' ? p.avg_price * p.quantity * rate : p.avg_price * p.quantity), 0)

      // 보유 종목 평가금액/수익률 계산 (현금 제외)
      const prices = await Promise.all(
        portfolioItems.map(p =>
          p.ticker === 'CASH_KRW' || p.ticker === 'CASH_USD'
            ? Promise.resolve(null)
            : getStockPrice(p.ticker, p).catch(() => null),
        ),
      )
      portfolioItems = portfolioItems.map((p, i) => {
        const isCash = p.ticker === 'CASH_KRW' || p.ticker === 'CASH_USD'
        const rawPrice = isCash ? null : prices[i]
        // 암호화폐 + KRW: Finnhub은 USD로 반환하므로 환율 곱해서 KRW 현재가로 변환
        const isCryptoKrw = isCryptoItem(p) && p.currency === 'KRW'
        const currentPrice = rawPrice ? (isCryptoKrw ? rawPrice * rate : rawPrice) : null
        const price = currentPrice ?? p.avg_price
        const evalAmount = price * p.quantity
        const evaluationAmountKrw = p.currency === 'USD' && !isCryptoKrw ? evalAmount * rate : evalAmount
        const costKrw =
          p.currency === 'USD' && !isCryptoKrw ? p.avg_price * p.quantity * rate : p.avg_price * p.quantity
        const profitRate =
          isCash || currentPrice === null || costKrw === 0
            ? null
            : ((evaluationAmountKrw - costKrw) / costKrw) * 100
        return { ...p, evaluationAmountKrw, profitRate }
      })

      // 세션 카운트: 연속 기록 간격 1시간 초과 시 새 세션
      const accessTimes = (accessRes.data ?? []).map(r => new Date(r.accessed_at).getTime())
      if (accessTimes.length > 0) {
        lastAccessedAt = accessRes.data![accessRes.data!.length - 1]!.accessed_at
        sessionCount = 1
        for (let i = 1; i < accessTimes.length; i++) {
          if (accessTimes[i]! - accessTimes[i - 1]! > 60 * 60 * 1000) sessionCount++
        }
      }
    }

    detail.value = {
      email: log.email,
      signed_up_at: log.signed_up_at,
      last_accessed_at: lastAccessedAt,
      session_count: sessionCount,
      target_asset: goal?.target_asset ?? null,
      monthly_investment: goal?.monthly_investment ?? null,
      annual_return: goal?.annual_return ?? null,
      current_asset: assetSummary?.current_asset ?? null,
      investment_principal: assetSummary?.investment_principal ?? null,
      cash_total_krw: Math.round(cashTotalKrw),
      portfolio_count: portfolioCount,
      portfolios: portfolioItems,
    }
  } catch {
    showMessage('상세 정보 조회 중 오류가 발생했습니다.', 'error')
    detailDialog.value = false
  } finally {
    detailLoading.value = false
  }
}

const fmtWon = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만원`
  return `${v.toLocaleString()}원`
}

const confirmDelete = (log: SignupLog) => {
  deleteTarget.value = log
  deletePassword.value = ''
  deletePasswordError.value = ''
  deleteDialog.value = true
}

const executeDelete = async () => {
  if (!deleteTarget.value) return
  deletePasswordError.value = ''

  if (!deletePassword.value) {
    deletePasswordError.value = '비밀번호를 입력해주세요.'
    return
  }

  deleteLoading.value = true
  try {
    // 관리자 비밀번호 검증
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: currentUser?.email ?? '',
      password: deletePassword.value,
    })
    if (authError) {
      deletePasswordError.value = '비밀번호가 올바르지 않습니다.'
      return
    }
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('signup_log')
      .update({ deleted_at: now })
      .eq('id', deleteTarget.value.id)
    if (error) { showMessage('signup_log 오류: ' + error.message, 'error'); return }

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
      // Edge Function 실패 시 signup_log rollback
      await supabase.from('signup_log').update({ deleted_at: null }).eq('id', deleteTarget.value.id)
      showMessage('Auth 삭제 오류: ' + fnErr.error, 'error')
      return
    }

    const idx = logs.value.findIndex(l => l.id === deleteTarget.value!.id)
    if (idx !== -1) {
      const cur = logs.value[idx]!
      logs.value[idx] = { id: cur.id, email: cur.email, signed_up_at: cur.signed_up_at, deleted_at: now }
    }
    showMessage('탈퇴 처리가 완료되었습니다.', 'success')
    deleteDialog.value = false
  } finally {
    deleteLoading.value = false
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

const formatDateShort = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}.${pad(+get('month'))}.${pad(+get('day'))} (${get('hour')}:${get('minute')}:${get('second')})`
}

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    router.replace('/dashboard')
    return
  }
  isAdmin.value = true
  const [{ data }, { data: confirmations }, { data: providers }] = await Promise.all([
    supabase.from('signup_log').select('*').order('signed_up_at', { ascending: false }),
    supabase.rpc('admin_get_email_confirmations'),
    supabase.rpc('admin_get_user_providers'),
  ])
  logs.value = data ?? []
  confirmedMap.value = Object.fromEntries((confirmations ?? []).map((c: { email: string; confirmed: boolean }) => [c.email, c.confirmed]))
  providerMap.value = Object.fromEntries((providers ?? []).map((p: { email: string; providers: string[] }) => [p.email, p.providers]))
  loading.value = false
})

const memberStatus = (log: SignupLog): { label: string; color: string; icon: string } => {
  if (log.deleted_at) return { label: '탈퇴', color: 'error', icon: 'mdi-account-remove-outline' }
  if (confirmedMap.value[log.email] === false) return { label: '미인증', color: 'warning', icon: 'mdi-email-alert-outline' }
  return { label: '활성', color: 'primary', icon: 'mdi-account-check-outline' }
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 600px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="font-weight-bold">가입 이력</div>
        <div class="text-medium-emphasis">전체 회원 가입 기록</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="list-item-three-line@5" class="rounded-xl" />
    </template>

    <template v-else-if="isAdmin">
      <div class="glass-card pa-4">
        <div class="section-label mb-3">전체 가입 이력 ({{ logs.length }}건)</div>

        <div v-if="logs.length === 0" class="text-center py-8 text-medium-emphasis">
          아직 가입 이력이 없습니다
        </div>

        <div v-for="(log, i) in logs" :key="log.id">
          <div class="log-row" :class="{ 'mt-2': i > 0 }" style="cursor:pointer" @click="openDetail(log)">
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center ga-2">
                <v-icon size="15" :color="memberStatus(log).color">{{ memberStatus(log).icon }}</v-icon>
                <span class="log-email">{{ log.email }}</span>
                <ProviderBadges :providers="providerMap[log.email]" />
              </div>
              <div class="d-flex align-center ga-2">
                <v-chip :color="memberStatus(log).color" size="x-small" variant="tonal">
                  {{ memberStatus(log).label }}
                </v-chip>
                <button v-if="!log.deleted_at" class="del-btn" @click.stop="confirmDelete(log)">
                  <v-icon size="14">mdi-account-remove-outline</v-icon>
                </button>
              </div>
            </div>
            <div class="log-meta mt-1">가입 {{ formatDate(log.signed_up_at) }}</div>
            <div v-if="log.deleted_at" class="log-meta log-deleted">탈퇴 {{ formatDate(log.deleted_at) }}</div>
          </div>
          <v-divider v-if="i < logs.length - 1" class="mt-2" opacity="0.06" />
        </div>
      </div>
    </template>
  </v-container>

  <v-dialog v-model="deleteDialog" max-width="320">
    <v-card rounded="xl" class="pa-2">
      <v-card-title class="font-weight-bold pt-4 px-4">탈퇴 처리</v-card-title>
      <v-card-text class="px-4 pb-2">
        <div class="text-medium-emphasis mb-1">아래 회원을 탈퇴 처리합니다.</div>
        <div class="font-weight-bold mb-3">{{ deleteTarget?.email }}</div>
        <v-text-field
          v-model="deletePassword"
          :type="deletePasswordVisible ? 'text' : 'password'"
          label="관리자 비밀번호 확인"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          :append-inner-icon="deletePasswordVisible ? 'mdi-eye-off' : 'mdi-eye'"
          :error="!!deletePasswordError"
          @click:append-inner="deletePasswordVisible = !deletePasswordVisible"
          @keyup.enter="executeDelete"
        />
        <div v-if="deletePasswordError" class="text-error mt-1 ml-1">{{ deletePasswordError }}</div>
        <div class="text-error mt-2">이 작업은 되돌릴 수 없습니다.</div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4 ga-2">
        <v-btn variant="tonal" rounded="lg" block @click="deleteDialog = false">취소</v-btn>
        <v-btn color="error" variant="flat" rounded="lg" block :loading="deleteLoading" @click="executeDelete">탈퇴 처리</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
<!-- 보유 종목 다이얼로그 -->
<v-dialog v-model="portfolioDialog" max-width="340">
  <v-card rounded="xl" class="pa-2">
    <v-card-title class="font-weight-bold pt-4 px-4">보유 종목</v-card-title>
    <v-card-text class="px-4 pb-2" style="max-height: 66vh; overflow-y: auto">
      <div v-for="(p, i) in detail?.portfolios" :key="`${p.ticker}-${i}`" :class="{ 'mt-2': i > 0 }">
        <div class="font-weight-bold" style="line-height: 1.3">{{ getTickerDisplayName(p.ticker) }}</div>
        <div class="d-flex justify-space-between align-center mt-1" style="gap: 8px">
          <span class="text-medium-emphasis">{{ p.quantity.toLocaleString() }}주</span>
          <span
            class="font-weight-bold"
            style="flex-shrink: 0"
            :class="p.profitRate == null ? 'text-medium-emphasis' : p.profitRate >= 0 ? 'text-success' : 'text-error'"
          >
            {{ fmtWon(p.evaluationAmountKrw ?? 0) }}<template v-if="p.profitRate != null"> ({{ p.profitRate >= 0 ? '+' : '' }}{{ p.profitRate.toFixed(1) }}%)</template>
          </span>
        </div>
        <v-divider v-if="i < (detail?.portfolios.length ?? 0) - 1" class="mt-2" opacity="0.06" />
      </div>
    </v-card-text>
    <v-card-actions class="px-4 pb-4">
      <v-btn variant="tonal" rounded="lg" block @click="portfolioDialog = false">닫기</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>

<!-- 회원 상세 다이얼로그 -->
<v-dialog v-model="detailDialog" max-width="360">
  <v-card rounded="xl" class="pa-2">
    <v-card-title class="font-weight-bold pt-4 px-4">회원 상세</v-card-title>
    <v-card-text class="px-4 pb-4">
      <div v-if="detailLoading" class="d-flex justify-center py-6">
        <v-progress-circular indeterminate color="primary" size="28" />
      </div>
      <template v-else-if="detail">
        <!-- 기본 정보 -->
        <div class="detail-section-label mb-2">기본 정보</div>
        <div class="detail-row"><span class="detail-key">이메일</span><span class="detail-val">{{ detail.email }}</span></div>
        <div class="detail-row"><span class="detail-key">가입일</span><span class="detail-val">{{ formatDateShort(detail.signed_up_at) }}</span></div>
        <div class="detail-row"><span class="detail-key">최근 접속</span><span class="detail-val">{{ detail.last_accessed_at ? formatDateShort(detail.last_accessed_at) : '-' }}</span></div>
        <div class="detail-row"><span class="detail-key">접속 횟수</span><span class="detail-val">{{ detail.session_count > 0 ? detail.session_count + '회' : '-' }}</span></div>

        <v-divider class="my-3" opacity="0.08" />

        <!-- 투자 목표 -->
        <div class="detail-section-label mb-2">투자 목표</div>
        <div class="detail-row"><span class="detail-key">목표 자산</span><span class="detail-val">{{ detail.target_asset ? fmtWon(detail.target_asset) : '-' }}</span></div>
        <div class="detail-row"><span class="detail-key">월 투자금</span><span class="detail-val">{{ detail.monthly_investment ? fmtWon(detail.monthly_investment) : '-' }}</span></div>
        <div class="detail-row"><span class="detail-key">기대 수익률</span><span class="detail-val">{{ detail.annual_return != null ? detail.annual_return + '%' : '-' }}</span></div>

        <v-divider class="my-3" opacity="0.08" />

        <!-- 현재 자산 -->
        <div class="detail-section-label mb-2">현재 자산</div>
        <div class="detail-row"><span class="detail-key">현재 평가액</span><span class="detail-val">{{ detail.current_asset ? fmtWon(detail.current_asset) : '-' }}</span></div>
        <div class="detail-row"><span class="detail-key">투자 원금</span><span class="detail-val">{{ detail.investment_principal ? fmtWon(detail.investment_principal) : '-' }}</span></div>
        <div class="detail-row"><span class="detail-key">현금 자산</span><span class="detail-val">{{ detail.cash_total_krw > 0 ? fmtWon(detail.cash_total_krw) : '-' }}</span></div>
        <div class="detail-row" :style="detail.portfolio_count > 0 ? 'cursor:pointer' : ''" @click="detail.portfolio_count > 0 && (portfolioDialog = true)">
          <span class="detail-key">보유 종목 수</span>
          <span class="detail-val" :style="detail.portfolio_count > 0 ? 'color:rgb(var(--v-theme-primary))' : ''">
            {{ detail.portfolio_count }}개{{ detail.portfolio_count > 0 ? ' ›' : '' }}
          </span>
        </div>
      </template>
    </v-card-text>
    <v-card-actions class="px-4 pb-4">
      <v-btn variant="tonal" rounded="lg" block @click="detailDialog = false">닫기</v-btn>
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

.section-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.log-email {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.log-meta {
  font-size: 0.6875rem;
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

.detail-section-label {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.38);
}
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  gap: 8px;
}
.detail-key {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  flex-shrink: 0;
}
.detail-val {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  text-align: right;
  word-break: break-all;
}
</style>
