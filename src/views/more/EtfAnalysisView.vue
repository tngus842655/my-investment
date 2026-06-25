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
  const tickers = [inputA.value.trim().toUpperCase(), compareMode.value ? inputB.value.trim().toUpperCase() : ''].filter(Boolean)
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
}

// 두 값 비교: 높을수록 좋은지(true), 낮을수록 좋은지(false)
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
          :style="compareMode ? 'flex:1' : ''"
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
        <v-btn color="primary" rounded="lg" :loading="loading" @click="fetchInfo">
          분석
        </v-btn>
      </div>
    </v-card>

    <!-- 로딩 -->
    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <!-- 결과 없음 -->
    <div v-else-if="!dataA && !loading" class="text-center py-12 text-medium-emphasis">
      <v-icon size="48" class="mb-3">mdi-chart-box-outline</v-icon>
      <div class="text-body-2">티커를 입력하고 분석 버튼을 눌러주세요.</div>
      <div class="text-caption mt-1">미국 ETF(SPY, QQQ 등) 및 국내 ETF(069500 등) 지원</div>
    </div>

    <!-- 결과 카드 -->
    <template v-else-if="dataA">
      <!-- 종목명 헤더 -->
      <div class="d-flex ga-3 mb-3" :class="dataB ? 'd-flex' : ''">
        <div class="ticker-header flex-1 text-center">
          <div class="text-caption text-medium-emphasis">{{ dataA.ticker }}</div>
          <div class="text-body-2 font-weight-bold">{{ dataA.name }}</div>
          <div class="text-body-2 text-primary font-weight-bold">{{ fmt.price(dataA.currentPrice, dataA.currency) }}</div>
        </div>
        <div v-if="dataB" class="ticker-header flex-1 text-center">
          <div class="text-caption text-medium-emphasis">{{ dataB.ticker }}</div>
          <div class="text-body-2 font-weight-bold">{{ dataB.name }}</div>
          <div class="text-body-2 text-primary font-weight-bold">{{ fmt.price(dataB.currentPrice, dataB.currency) }}</div>
        </div>
      </div>

      <!-- 지표 카드들 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="section-title pa-3 pb-2">수익률</div>

        <metric-row
          label="CAGR (연평균 수익률)"
          :valA="fmt.pct(dataA.cagr)"
          :valB="dataB ? fmt.pct(dataB.cagr) : null"
          :highlight="dataB ? better(dataA.cagr, dataB.cagr, true) : null"
          good
        />
        <metric-row
          label="상장 이후 기준"
          :valA="dataA.inceptionDate ?? '-'"
          :valB="dataB ? (dataB.inceptionDate ?? '-') : null"
          sub
        />
        <metric-row
          label="52주 최고"
          :valA="fmt.price(dataA.week52High, dataA.currency)"
          :valB="dataB ? fmt.price(dataB.week52High, dataB.currency) : null"
        />
        <metric-row
          label="52주 최저"
          :valA="fmt.price(dataA.week52Low, dataA.currency)"
          :valB="dataB ? fmt.price(dataB.week52Low, dataB.currency) : null"
        />
      </v-card>

      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="section-title pa-3 pb-2">리스크</div>
        <metric-row
          label="MDD (최대 낙폭)"
          :valA="fmt.pct(dataA.mdd)"
          :valB="dataB ? fmt.pct(dataB.mdd) : null"
          :highlight="dataB ? better(dataA.mdd, dataB.mdd, false) : null"
          :good-is-a="dataB ? (dataA.mdd != null && dataB.mdd != null && dataA.mdd > dataB.mdd ? 'b' : 'a') : null"
        />
        <metric-row
          label="연간 변동성"
          :valA="fmt.pct(dataA.volatility)"
          :valB="dataB ? fmt.pct(dataB.volatility) : null"
          :highlight="dataB ? better(dataA.volatility, dataB.volatility, false) : null"
        />
        <metric-row
          label="베타"
          :valA="fmt.num(dataA.beta)"
          :valB="dataB ? fmt.num(dataB.beta) : null"
          :highlight="dataB ? better(dataA.beta, dataB.beta, false) : null"
        />
      </v-card>

      <v-card rounded="xl" class="mb-4 overflow-hidden">
        <div class="section-title pa-3 pb-2">배당 & 비용</div>
        <metric-row
          label="배당률"
          :valA="fmt.pct(dataA.dividendYield)"
          :valB="dataB ? fmt.pct(dataB.dividendYield) : null"
          :highlight="dataB ? better(dataA.dividendYield, dataB.dividendYield, true) : null"
        />
        <metric-row
          label="운용보수 (TER)"
          :valA="dataA.expenseRatio != null ? fmt.pct(dataA.expenseRatio, 2) : '-'"
          :valB="dataB ? (dataB.expenseRatio != null ? fmt.pct(dataB.expenseRatio, 2) : '-') : null"
          :highlight="dataB ? better(dataA.expenseRatio, dataB.expenseRatio, false) : null"
        />
      </v-card>

      <div class="text-caption text-medium-emphasis mt-1">
        * Yahoo Finance 데이터 기반 · 투자 판단의 참고 자료로만 활용하세요.
      </div>
    </template>
  </v-container>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'

const MetricRow = defineComponent({
  name: 'MetricRow',
  props: {
    label: String,
    valA: String,
    valB: { type: String as PropType<string | null>, default: null },
    highlight: { type: String as PropType<'a' | 'b' | null>, default: null },
    sub: Boolean,
  },
  template: `
    <div class="metric-row d-flex align-center px-4 py-3">
      <div class="metric-label text-caption" :class="sub ? 'text-medium-emphasis' : ''">{{ label }}</div>
      <div class="metric-val text-body-2 font-weight-medium text-right"
        :class="highlight === 'a' ? 'text-success' : ''">{{ valA }}</div>
      <div v-if="valB !== null" class="metric-val text-body-2 font-weight-medium text-right"
        :class="highlight === 'b' ? 'text-success' : ''">{{ valB }}</div>
    </div>
  `,
})

export default { components: { MetricRow } }
</script>

<style scoped>
.ticker-header {
  background: rgb(var(--v-theme-surface-variant));
  border-radius: 16px;
  padding: 12px;
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
  min-width: 80px;
}
</style>
