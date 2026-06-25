<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()

interface EtfInfo {
  ticker: string
  name: string
  currency: string
  currentPrice: number | null
  dividendYield: number | null
  expenseRatio: number | null
  week52High: number | null
  week52Low: number | null
  beta: number | null
  cagr: number | null
  mdd: number | null
  volatility: number | null
  inceptionDate: string | null
}

const inputA = ref('')
const inputB = ref('')
const dataA = ref<EtfInfo | null>(null)
const dataB = ref<EtfInfo | null>(null)
const loading = ref(false)
const compareMode = ref(false)

const fetchInfo = async () => {
  const tickers = [
    inputA.value.trim().toUpperCase(),
    compareMode.value ? inputB.value.trim().toUpperCase() : '',
  ].filter(Boolean)
  if (!tickers[0]) { showMessage('티커를 입력해주세요.', 'warning'); return }

  loading.value = true
  dataA.value = null
  dataB.value = null

  try {
    const { data, error } = await supabase.functions.invoke('etf-info', { body: { tickers } })
    if (error) throw error
    const list: EtfInfo[] = data.data
    dataA.value = list[0] ?? null
    dataB.value = list[1] ?? null
  } catch {
    showMessage('데이터를 불러오는 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

const fmt = {
  pct: (v: number | null, digits = 1) => v == null ? '-' : `${(v * 100).toFixed(digits)}%`,
  price: (v: number | null, currency: string) => {
    if (v == null) return '-'
    return currency === 'KRW' ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`
  },
  num: (v: number | null, digits = 2) => v == null ? '-' : v.toFixed(digits),
  shortDate: (d: string | null) => {
    if (!d) return '-'
    const [y, m] = d.split('-')
    return `${y?.slice(2)}.${m}`  // '1999-03-01' → '99.03'
  },
}

const better = (a: number | null, b: number | null, higherIsBetter: boolean): 'a' | 'b' | null => {
  if (a == null || b == null) return null
  if (a === b) return null
  return (higherIsBetter ? a > b : a < b) ? 'a' : 'b'
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
        <div class="text-h5 font-weight-bold">ETF 분석 & 비교</div>
        <div class="text-body-2 text-medium-emphasis">CAGR · MDD · 변동성 · 배당률 · 운용보수</div>
      </div>
    </div>

    <!-- 입력 -->
    <v-card rounded="xl" class="pa-4 mb-4">
      <div class="d-flex align-center ga-2 mb-3">
        <v-text-field
          v-model="inputA"
          label="티커 입력 (예: SPY)"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          style="flex:1"
          @keyup.enter="fetchInfo"
        />
        <template v-if="compareMode">
          <div class="text-body-2 font-weight-bold text-medium-emphasis">vs</div>
          <v-text-field
            v-model="inputB"
            label="비교 티커 (예: QQQ)"
            variant="outlined"
            density="compact"
            rounded="lg"
            hide-details
            style="flex:1"
            @keyup.enter="fetchInfo"
          />
        </template>
      </div>
      <div class="d-flex align-center ga-2">
        <v-btn
          variant="tonal"
          size="small"
          rounded="lg"
          :color="compareMode ? 'primary' : 'default'"
          @click="compareMode = !compareMode; dataB = null"
        >
          <v-icon size="16" class="mr-1">mdi-compare</v-icon>
          비교 모드
        </v-btn>
        <v-spacer />
        <v-btn color="primary" rounded="lg" :loading="loading" @click="fetchInfo">분석</v-btn>
      </div>
    </v-card>

    <!-- 로딩 -->
    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <!-- 빈 상태 -->
    <div v-else-if="!dataA" class="text-center py-12 text-medium-emphasis">
      <v-icon size="48" class="mb-3">mdi-chart-box-outline</v-icon>
      <div class="text-body-2">티커를 입력하고 분석 버튼을 눌러주세요.</div>
      <div class="text-caption mt-1">미국 ETF(SPY, QQQ 등) 및 국내 ETF(069500 등) 지원</div>
    </div>

    <template v-else>
      <!-- 종목 헤더 -->
      <div class="d-flex ga-3 mb-3">
        <div class="ticker-header flex-1 text-center pa-3">
          <div class="text-caption text-medium-emphasis">{{ dataA.ticker }}</div>
          <div class="text-body-2 font-weight-bold">{{ dataA.name }}</div>
          <div class="text-body-2 text-primary font-weight-bold mt-1">{{ fmt.price(dataA.currentPrice, dataA.currency) }}</div>
        </div>
        <div v-if="dataB" class="ticker-header flex-1 text-center pa-3">
          <div class="text-caption text-medium-emphasis">{{ dataB.ticker }}</div>
          <div class="text-body-2 font-weight-bold">{{ dataB.name }}</div>
          <div class="text-body-2 text-primary font-weight-bold mt-1">{{ fmt.price(dataB.currentPrice, dataB.currency) }}</div>
        </div>
      </div>

      <!-- 수익률 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="d-flex align-center px-4 pt-3 pb-1">
          <div class="section-title flex-1">수익률</div>
          <template v-if="dataB">
            <div class="col-header">{{ dataA.ticker }}</div>
            <div class="col-header">{{ dataB.ticker }}</div>
          </template>
        </div>

        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">CAGR (연평균 수익률)</div>
          <div class="metric-val text-body-2 font-weight-bold text-right"
            :class="dataB && better(dataA.cagr, dataB.cagr, true) === 'a' ? 'text-success' : ''">
            {{ fmt.pct(dataA.cagr) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-bold text-right"
            :class="better(dataA.cagr, dataB.cagr, true) === 'b' ? 'text-success' : ''">
            {{ fmt.pct(dataB.cagr) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption text-medium-emphasis">
            상장일 기준<span v-if="dataB"> · 기간 다르면 비교 불가</span>
          </div>
          <div class="metric-val text-caption text-medium-emphasis text-right">{{ fmt.shortDate(dataA.inceptionDate) }}</div>
          <div v-if="dataB" class="metric-val text-caption text-medium-emphasis text-right">{{ fmt.shortDate(dataB.inceptionDate) }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">52주 최고</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataA.week52High, dataA.currency) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataB.week52High, dataB.currency) }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">52주 최저</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataA.week52Low, dataA.currency) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataB.week52Low, dataB.currency) }}</div>
        </div>
      </v-card>

      <!-- 리스크 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="d-flex align-center px-4 pt-3 pb-1">
          <div class="section-title flex-1">리스크</div>
          <template v-if="dataB">
            <div class="col-header">{{ dataA.ticker }}</div>
            <div class="col-header">{{ dataB.ticker }}</div>
          </template>
        </div>

        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">MDD (최대 낙폭)</div>
          <div class="metric-val text-body-2 font-weight-bold text-right"
            :class="dataB && better(dataA.mdd, dataB.mdd, false) === 'a' ? 'text-success' : ''">
            {{ fmt.pct(dataA.mdd) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-bold text-right"
            :class="better(dataA.mdd, dataB.mdd, false) === 'b' ? 'text-success' : ''">
            {{ fmt.pct(dataB.mdd) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">연간 변동성</div>
          <div class="metric-val text-body-2 font-weight-medium text-right"
            :class="dataB && better(dataA.volatility, dataB.volatility, false) === 'a' ? 'text-success' : ''">
            {{ fmt.pct(dataA.volatility) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right"
            :class="better(dataA.volatility, dataB.volatility, false) === 'b' ? 'text-success' : ''">
            {{ fmt.pct(dataB.volatility) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">베타</div>
          <div class="metric-val text-body-2 font-weight-medium text-right"
            :class="dataB && better(dataA.beta, dataB.beta, false) === 'a' ? 'text-success' : ''">
            {{ fmt.num(dataA.beta) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right"
            :class="better(dataA.beta, dataB.beta, false) === 'b' ? 'text-success' : ''">
            {{ fmt.num(dataB.beta) }}
          </div>
        </div>
      </v-card>

      <!-- 배당 & 비용 섹션 -->
      <v-card rounded="xl" class="mb-4 overflow-hidden">
        <div class="d-flex align-center px-4 pt-3 pb-1">
          <div class="section-title flex-1">배당 & 비용</div>
          <template v-if="dataB">
            <div class="col-header">{{ dataA.ticker }}</div>
            <div class="col-header">{{ dataB.ticker }}</div>
          </template>
        </div>

        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">배당률</div>
          <div class="metric-val text-body-2 font-weight-medium text-right"
            :class="dataB && better(dataA.dividendYield, dataB.dividendYield, true) === 'a' ? 'text-success' : ''">
            {{ fmt.pct(dataA.dividendYield) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right"
            :class="better(dataA.dividendYield, dataB.dividendYield, true) === 'b' ? 'text-success' : ''">
            {{ fmt.pct(dataB.dividendYield) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">운용보수 (TER)</div>
          <div class="metric-val text-body-2 font-weight-medium text-right"
            :class="dataB && better(dataA.expenseRatio, dataB.expenseRatio, false) === 'a' ? 'text-success' : ''">
            {{ dataA.expenseRatio != null ? fmt.pct(dataA.expenseRatio, 2) : '-' }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right"
            :class="better(dataA.expenseRatio, dataB.expenseRatio, false) === 'b' ? 'text-success' : ''">
            {{ dataB.expenseRatio != null ? fmt.pct(dataB.expenseRatio, 2) : '-' }}
          </div>
        </div>
      </v-card>

      <div class="text-caption text-medium-emphasis">
        * Yahoo Finance 데이터 기반 · 투자 판단의 참고 자료로만 활용하세요.
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.ticker-header {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 16px;
}
.section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.metric-row {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.metric-label {
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.metric-val {
  min-width: 72px;
}
.date-val {
  font-size: 11px;
  min-width: 72px;
  white-space: nowrap;
}
.col-header {
  min-width: 72px;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
</style>
