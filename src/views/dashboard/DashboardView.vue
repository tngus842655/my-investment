<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { formatShortMoney } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { getTickerLabel } from '@/utils/tickerNames'

const router = useRouter()
const loading = ref(true)

const targetAsset = ref(0)
const currentAsset = ref(0)
const monthlyInvestment = ref(0)
const annualReturn = ref<number | null>(null)

interface MiniPortfolio {
  id: string
  ticker: string
  asset_type: string
  currency: string
  quantity: number
  avg_price: number
  evaluationKrw: number
}

const topPortfolios = ref<MiniPortfolio[]>([])

const progressRate = computed(() => {
  if (!targetAsset.value) return 0
  return Math.min(Math.round((currentAsset.value / targetAsset.value) * 100), 100)
})

const remainingAsset = computed(() => Math.max(targetAsset.value - currentAsset.value, 0))
const isGoalAchieved = computed(() => targetAsset.value > 0 && currentAsset.value >= targetAsset.value)

// SVG 도넛 차트
const RADIUS = 54
const STROKE = 10
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const dashOffset = computed(() => CIRCUMFERENCE * (1 - progressRate.value / 100))

const estimatedDate = computed(() => {
  const T = targetAsset.value
  const C = currentAsset.value
  const M = monthlyInvestment.value
  if (annualReturn.value === null) return null
  const r = annualReturn.value / 100 / 12
  if (!T || !M || C >= T) return null

  let months: number
  if (r === 0) {
    months = Math.ceil((T - C) / M)
  } else {
    const numerator = T * r + M
    const denominator = C * r + M
    if (denominator <= 0) return null
    months = Math.ceil(Math.log(numerator / denominator) / Math.log(1 + r))
  }
  if (!isFinite(months) || months <= 0) return null

  const years = Math.floor(months / 12)
  const remainMonths = months % 12
  const date = new Date()
  date.setMonth(date.getMonth() + months)

  const dateStr = `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}.`
  const durationStr =
    years > 0 ? `${years}년 ${remainMonths > 0 ? remainMonths + '개월' : ''}` : `${months}개월`

  return { dateStr, durationStr }
})

const assetTypeColor = (type: string) =>
  ({ 국내주식: 'blue', 해외주식: 'purple', ETF: 'teal', 암호화폐: 'amber', 현금: 'green' })[type] ?? 'grey'

const loadDashboard = async () => {
  loading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [goalResult, summaryResult, portfolioResult, rate] = await Promise.all([
      supabase.from('investment_goals').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('asset_summary').select('current_asset').eq('user_id', user.id).maybeSingle(),
      supabase.from('portfolios').select('id,ticker,asset_type,currency,quantity,avg_price').eq('user_id', user.id).order('sort_order', { ascending: true }).limit(4),
      getCachedExchangeRate(),
    ])

    if (goalResult.data) {
      targetAsset.value = goalResult.data.target_asset ?? 0
      monthlyInvestment.value = goalResult.data.monthly_investment ?? 0
      annualReturn.value = goalResult.data.annual_return ?? null
    }
    currentAsset.value = summaryResult.data?.current_asset ?? 0

    topPortfolios.value = (portfolioResult.data ?? []).map((p) => {
      const eval_ = p.avg_price * p.quantity
      const evalKrw = p.currency === 'USD' ? eval_ * rate : eval_
      return { ...p, evaluationKrw: Math.round(evalKrw) }
    })
  } catch (error) {
    console.error(error)
    showMessage('데이터를 불러오는 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex justify-space-between align-center mb-6">
      <div class="d-flex align-center ga-2">
        <video
          src="/icons/icon-rocket.mp4"
          class="header-logo"
          autoplay
          loop
          muted
          playsinline
        />
        <div class="text-h6 font-weight-bold">FIREPATH</div>
      </div>
      <button class="icon-btn" @click="router.push('/goalSettings')">
        <img src="/icons/icon-goal.png" alt="목표수정" class="icon-btn-img" />
      </button>
    </div>

    <!-- 스켈레톤 -->
    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
    </template>

    <template v-else>
      <!-- 현재 자산 카드 -->
      <div class="glass-card pa-5 mb-3">
        <div class="field-label mb-1">현재 자산</div>
        <div class="hero-amount font-weight-bold mb-1">
          {{ currentAsset > 0 ? Math.round(currentAsset).toLocaleString('ko-KR') + '원' : '-' }}
        </div>
        <div class="text-body-2" style="color: rgba(var(--v-theme-on-surface), 0.45)">
          <template v-if="currentAsset > 0">
            목표 자산 {{ formatShortMoney(targetAsset) }}원
          </template>
          <template v-else>
            <span
              class="d-inline-flex align-center ga-1"
              style="cursor: pointer; color: rgb(var(--v-theme-primary))"
              @click="router.push('/portfolio')"
            >
              <v-icon size="13">mdi-plus-circle-outline</v-icon>
              보유자산을 추가하면 현재 자산이 집계됩니다
            </span>
          </template>
        </div>
      </div>

      <!-- FIRE 달성률 카드 (도넛 차트) -->
      <div class="glass-card pa-5 mb-3">
        <div class="field-label mb-4">FIRE 달성률</div>
        <div class="fire-rate-layout">
          <div class="donut-wrap">
            <svg
              :width="RADIUS * 2 + STROKE"
              :height="RADIUS * 2 + STROKE"
              :viewBox="`0 0 ${RADIUS * 2 + STROKE} ${RADIUS * 2 + STROKE}`"
            >
              <circle
                :cx="RADIUS + STROKE / 2"
                :cy="RADIUS + STROKE / 2"
                :r="RADIUS"
                fill="none"
                stroke="rgba(var(--v-theme-on-surface), 0.08)"
                :stroke-width="STROKE"
              />
              <circle
                class="donut-progress"
                :cx="RADIUS + STROKE / 2"
                :cy="RADIUS + STROKE / 2"
                :r="RADIUS"
                fill="none"
                stroke="rgb(var(--v-theme-primary))"
                :stroke-width="STROKE"
                stroke-linecap="round"
                :stroke-dasharray="CIRCUMFERENCE"
                :stroke-dashoffset="dashOffset"
                transform-origin="center"
                transform="rotate(-90)"
              />
              <text
                :x="RADIUS + STROKE / 2"
                :y="RADIUS + STROKE / 2 + 1"
                text-anchor="middle"
                dominant-baseline="middle"
                class="donut-label"
                fill="rgb(var(--v-theme-on-surface))"
              >
                {{ progressRate }}%
              </text>
            </svg>
          </div>

          <div class="fire-info">
            <template v-if="isGoalAchieved">
              <div class="fire-info-main" style="color: rgb(var(--v-theme-primary))">🎉 목표 달성!</div>
              <div class="fire-info-sub mt-1">목표금액을 재설정하세요</div>
            </template>
            <template v-else>
              <div class="fire-info-sub mb-1">목표까지</div>
              <div class="fire-info-main">{{ formatShortMoney(remainingAsset) }}원 남음</div>
              <div class="fire-divider my-3" />
              <div class="fire-info-sub mb-1">예상 달성일</div>
              <template v-if="estimatedDate">
                <div class="fire-info-date">{{ estimatedDate.dateStr }}</div>
                <div class="fire-info-sub mt-1">약 {{ estimatedDate.durationStr }} 후</div>
              </template>
              <template v-else>
                <div
                  class="fire-info-sub"
                  style="cursor: pointer; color: rgb(var(--v-theme-primary))"
                  @click="router.push('/goalSettings')"
                >
                  수익률을 설정해주세요
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>

      <!-- 스탯 2개 -->
      <div class="stat-grid mb-3">
        <div class="stat-card">
          <div class="stat-label">월 투자금</div>
          <div class="stat-value">
            {{ monthlyInvestment > 0 ? formatShortMoney(monthlyInvestment) + '원' : '-' }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">연평균 수익률</div>
          <div class="stat-value">
            {{ annualReturn !== null ? annualReturn + '%' : '-' }}
          </div>
        </div>
      </div>

      <!-- 투자 현황 미니 리스트 -->
      <div class="glass-card pa-4">
        <div class="d-flex justify-space-between align-center mb-3">
          <span class="field-label" style="font-size: 13px">투자 현황</span>
          <span
            class="see-all"
            @click="router.push('/portfolio')"
          >
            전체 보기 <v-icon size="13">mdi-chevron-right</v-icon>
          </span>
        </div>

        <!-- 종목 없을 때 -->
        <template v-if="topPortfolios.length === 0">
          <div class="text-center py-6">
            <v-icon size="36" color="primary" style="opacity: 0.35" class="mb-2">mdi-chart-line-variant</v-icon>
            <div class="text-caption text-medium-emphasis">보유 자산이 없습니다</div>
          </div>
        </template>

        <!-- 종목 리스트 -->
        <template v-else>
          <div
            v-for="(item, i) in topPortfolios"
            :key="item.id"
            class="mini-portfolio-item"
            :class="{ 'mt-3': i > 0 }"
          >
            <div class="d-flex align-center ga-2 flex-1 min-w-0">
              <!-- 아이콘 -->
              <div class="mini-icon" :class="`bg-${assetTypeColor(item.asset_type)}`">
                <v-icon size="14" color="white">
                  {{ item.asset_type === '현금' ? 'mdi-cash' : item.asset_type === '암호화폐' ? 'mdi-bitcoin' : 'mdi-chart-line' }}
                </v-icon>
              </div>

              <!-- 종목명 -->
              <div class="flex-1 min-w-0">
                <div class="mini-ticker">
                  <template v-if="item.asset_type === '현금'">보유현금</template>
                  <template v-else-if="getTickerLabel(item.ticker).showTicker">
                    {{ getTickerLabel(item.ticker).name }}
                    <span class="mini-ticker-sub">{{ item.ticker }}</span>
                  </template>
                  <template v-else>{{ item.ticker }}</template>
                </div>
                <div class="mini-asset-type">{{ item.asset_type }}</div>
              </div>
            </div>

            <!-- 금액 -->
            <div class="text-right">
              <div class="mini-amount">{{ item.evaluationKrw.toLocaleString('ko-KR') }}원</div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.header-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  mix-blend-mode: multiply;
}
.v-theme--dark .header-logo {
  mix-blend-mode: normal;
  filter: brightness(0) invert(1);
}

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
  transition: background 0.25s ease, border-color 0.25s ease;
}

.glass-btn {
  background: rgb(var(--v-theme-surface)) !important;
  border-color: rgba(var(--v-theme-on-surface), 0.15) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* 헤더 목표수정 아이콘 버튼 */
.icon-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: opacity 0.15s ease;
}
.icon-btn:active { opacity: 0.6; }
.icon-btn-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}


.field-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.hero-amount {
  font-size: 28px;
  line-height: 1.2;
  color: rgb(var(--v-theme-on-surface));
}

/* 도넛 */
.fire-rate-layout {
  display: flex;
  align-items: center;
  gap: 24px;
}
.donut-wrap { flex-shrink: 0; }
.donut-progress {
  transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}
.donut-label {
  font-size: 18px;
  font-weight: 700;
}

/* FIRE 정보 */
.fire-info { flex: 1; min-width: 0; }
.fire-info-sub {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.fire-info-main {
  font-size: 17px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fire-info-date {
  font-size: 20px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
.fire-divider {
  height: 1px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

/* 스탯 */
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.stat-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 16px;
  padding: 16px;
}
.stat-label {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 8px;
}
.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

/* 투자 현황 미니 리스트 */
.see-all {
  font-size: 12px;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
}

.mini-portfolio-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mini-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.85;
}
.bg-blue { background: #1976d2; }
.bg-purple { background: #7b1fa2; }
.bg-teal { background: #00796b; }
.bg-amber { background: #f57c00; }
.bg-green { background: #388e3c; }
.bg-grey { background: #616161; }

.mini-ticker {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mini-ticker-sub {
  font-size: 11px;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-left: 4px;
}
.mini-asset-type {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-top: 1px;
}
.mini-amount {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
}

</style>
