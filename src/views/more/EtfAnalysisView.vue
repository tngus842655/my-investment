<script setup lang="ts">
import { ref, computed } from 'vue'
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
  totalAssets: number | null
  fundFamily: string | null
  category: string | null
}

const inputA = ref('')
const inputB = ref('')
const dataA = ref<EtfInfo | null>(null)
const dataB = ref<EtfInfo | null>(null)
const loading = ref(false)

const fetchInfo = async () => {
  const tA = inputA.value.trim().toUpperCase()
  const tB = inputB.value.trim().toUpperCase()
  if (!tA) { showMessage('티커를 입력해주세요.', 'warning'); return }

  const tickers = [tA, tB].filter(Boolean)
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
  aum: (v: number | null, currency: string) => {
    if (v == null) return '-'
    if (currency === 'KRW') {
      if (v >= 1e12) return `₩${(v / 1e12).toFixed(1)}조`
      return `₩${(v / 1e8).toFixed(0)}억`
    }
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
    return `$${Math.round(v).toLocaleString()}`
  },
  date: (d: string | null) => {
    if (!d) return '-'
    const [y, m] = d.split('-')
    return `${y}.${m}`
  },
}

// higherIsBetter: MDD는 음수이므로 높을수록(0에 가까울수록) 낙폭이 적어 good → true
const better = (a: number | null, b: number | null, higherIsBetter: boolean): 'a' | 'b' | null => {
  if (a == null || b == null) return null
  if (a === b) return null
  return (higherIsBetter ? a > b : a < b) ? 'a' : 'b'
}

const cls = (a: number | null, b: number | null, higherIsBetter: boolean, side: 'a' | 'b'): string => {
  if (!dataB.value) return ''
  const w = better(a, b, higherIsBetter)
  if (w == null) return ''
  return w === side ? 'winner' : 'loser'
}

const getEtfTags = (info: EtfInfo) => {
  const tags: Array<{ label: string; color: string }> = []
  const name = (info.name ?? '').toLowerCase()
  const cat = (info.category ?? '').toLowerCase()

  if (/^\d{6}$/.test(info.ticker)) tags.push({ label: '국내', color: 'blue' })
  else tags.push({ label: '해외', color: 'indigo' })

  if (cat.includes('leveraged') || name.includes('2x') || name.includes('3x') || name.includes('ultra') || name.includes('레버'))
    tags.push({ label: '레버리지', color: 'orange' })
  else if (cat.includes('inverse') || name.includes('inverse') || name.includes('short') || name.includes('인버'))
    tags.push({ label: '인버스', color: 'red' })
  else if (name.includes('dividend') || name.includes('income') || name.includes('yield') || name.includes('배당') || cat.includes('dividend'))
    tags.push({ label: '배당', color: 'green' })

  if (cat.includes('bond') || name.includes('bond') || name.includes('treasury') || name.includes('채권'))
    tags.push({ label: '채권', color: 'teal' })

  return tags
}

const tooltips: Record<string, string> = {
  cagr: '연평균 복리 수익률. 상장 이후 매년 이 비율로 성장했을 때 현재 가치에 도달합니다. 높을수록 좋습니다.',
  mdd: '최대 낙폭(Max Drawdown). 최고점 대비 최대 하락 폭. 절대값이 작을수록(0에 가까울수록) 리스크가 낮습니다.',
  volatility: '연간 변동성. 월간 수익률의 표준편차를 연율화한 수치. 낮을수록 가격이 안정적입니다.',
  beta: '시장 민감도. S&P 500 대비 움직임. 1이면 시장과 동일, 1 이상이면 더 크게 움직입니다.',
  ter: '운용보수(TER). 매년 ETF 운용에 드는 비용 비율. 낮을수록 장기 수익률에 유리합니다.',
  dividendYield: '최근 12개월 지급 배당금의 현재가 대비 비율입니다.',
}

const aiSummary = computed((): string => {
  const a = dataA.value
  const b = dataB.value
  if (!a) return ''

  if (!b) {
    const parts: string[] = []
    if (a.cagr != null) parts.push(`연평균 수익률(CAGR) ${fmt.pct(a.cagr)}`)
    if (a.mdd != null) parts.push(`최대 낙폭(MDD) ${fmt.pct(a.mdd)}`)
    if (a.expenseRatio != null) parts.push(`운용보수 ${fmt.pct(a.expenseRatio, 2)}`)
    const risk = a.mdd == null ? '' : a.mdd > -0.2 ? '낮은' : a.mdd > -0.4 ? '중간 수준의' : '높은'
    const div = (a.dividendYield ?? 0) > 0.02 ? ' 배당 수익을 원하는 투자자에게 적합하며,' : ''
    return `${a.ticker}은 ${parts.join(', ')}의 ETF입니다.${div} 리스크는 ${risk} 편입니다.`
  }

  const lines: string[] = []

  if (a.cagr != null && b.cagr != null) {
    const winner = a.cagr > b.cagr ? a.ticker : b.ticker
    const diff = Math.abs((a.cagr - b.cagr) * 100).toFixed(1)
    lines.push(`수익률 면에서 ${winner}의 CAGR이 ${diff}%p 높습니다.`)
  }

  if (a.mdd != null && b.mdd != null) {
    const winner = a.mdd > b.mdd ? a.ticker : b.ticker
    lines.push(`리스크는 ${winner}의 최대 낙폭이 더 작아 상대적으로 안정적입니다.`)
  }

  if (a.expenseRatio != null && b.expenseRatio != null) {
    const winner = a.expenseRatio < b.expenseRatio ? a.ticker : b.ticker
    lines.push(`운용보수는 ${winner}이 더 저렴합니다.`)
  }

  if ((a.dividendYield ?? 0) > 0 || (b.dividendYield ?? 0) > 0) {
    if (a.dividendYield != null && b.dividendYield != null) {
      const winner = a.dividendYield > b.dividendYield ? a.ticker : b.ticker
      lines.push(`배당률은 ${winner}이 더 높습니다.`)
    }
  }

  let aScore = 0, bScore = 0
  if (a.cagr != null && b.cagr != null) a.cagr > b.cagr ? aScore++ : bScore++
  if (a.mdd != null && b.mdd != null) a.mdd > b.mdd ? aScore++ : bScore++
  if (a.expenseRatio != null && b.expenseRatio != null) a.expenseRatio < b.expenseRatio ? aScore++ : bScore++
  if (a.dividendYield != null && b.dividendYield != null) a.dividendYield > b.dividendYield ? aScore++ : bScore++
  if (aScore !== bScore) {
    const overall = aScore > bScore ? a.ticker : b.ticker
    lines.push(`종합적으로 이번 비교에서 ${overall}이 더 유리한 ETF로 평가됩니다.`)
  }

  return lines.join(' ')
})
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
          label="티커 (예: SPY)"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          style="flex:1"
          @keyup.enter="fetchInfo"
        />
        <div class="text-body-2 font-weight-bold text-medium-emphasis">vs</div>
        <v-text-field
          v-model="inputB"
          label="비교 티커 (선택)"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          style="flex:1"
          @keyup.enter="fetchInfo"
        />
      </div>
      <div class="d-flex justify-end">
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
      <!-- ETF 카드 -->
      <div class="d-flex ga-3 mb-4">
        <template v-for="info in ([dataA, dataB].filter(Boolean) as EtfInfo[])" :key="info.ticker">
          <div class="etf-card flex-1 pa-3">
            <div class="d-flex align-center ga-1 mb-1 flex-wrap">
              <v-chip
                v-for="tag in getEtfTags(info)" :key="tag.label"
                :color="tag.color" size="x-small" variant="tonal"
              >{{ tag.label }}</v-chip>
            </div>
            <div class="text-caption text-medium-emphasis mt-1">{{ info.ticker }}</div>
            <div class="text-body-2 font-weight-bold" style="line-height:1.3">{{ info.name }}</div>
            <div v-if="info.fundFamily" class="text-caption text-medium-emphasis mt-1">{{ info.fundFamily }}</div>
            <div class="text-h6 font-weight-bold text-primary mt-2">{{ fmt.price(info.currentPrice, info.currency) }}</div>
          </div>
        </template>
      </div>

      <!-- 기본 정보 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="section-title-row px-4 pt-3 pb-1">
          <div class="section-title flex-1">기본 정보</div>
          <template v-if="dataB">
            <div class="col-header">{{ dataA!.ticker }}</div>
            <div class="col-header">{{ dataB.ticker }}</div>
          </template>
        </div>

        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption">운용사</div>
          <div class="metric-val text-caption text-right">{{ dataA!.fundFamily ?? '-' }}</div>
          <div v-if="dataB" class="metric-val text-caption text-right">{{ dataB.fundFamily ?? '-' }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption">카테고리</div>
          <div class="metric-val text-caption text-right" style="word-break:break-word">{{ dataA!.category ?? '-' }}</div>
          <div v-if="dataB" class="metric-val text-caption text-right" style="word-break:break-word">{{ dataB.category ?? '-' }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption">운용자산 (AUM)</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.aum(dataA!.totalAssets, dataA!.currency) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.aum(dataB.totalAssets, dataB.currency) }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-2">
          <div class="metric-label text-caption">상장일</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.date(dataA!.inceptionDate) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.date(dataB.inceptionDate) }}</div>
        </div>
      </v-card>

      <!-- 수익률 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="section-title-row px-4 pt-3 pb-1">
          <div class="section-title flex-1">수익률</div>
          <template v-if="dataB">
            <div class="col-header">{{ dataA!.ticker }}</div>
            <div class="col-header">{{ dataB.ticker }}</div>
          </template>
        </div>

        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption d-flex align-center ga-1">
            CAGR (연평균 수익률)
            <v-tooltip :text="tooltips.cagr" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val text-body-2 text-right" :class="cls(dataA!.cagr, dataB?.cagr ?? null, true, 'a')">
            {{ fmt.pct(dataA!.cagr) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 text-right" :class="cls(dataA!.cagr, dataB.cagr, true, 'b')">
            {{ fmt.pct(dataB.cagr) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">52주 최고</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataA!.week52High, dataA!.currency) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataB.week52High, dataB.currency) }}</div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption">52주 최저</div>
          <div class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataA!.week52Low, dataA!.currency) }}</div>
          <div v-if="dataB" class="metric-val text-body-2 font-weight-medium text-right">{{ fmt.price(dataB.week52Low, dataB.currency) }}</div>
        </div>
      </v-card>

      <!-- 리스크 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="section-title-row px-4 pt-3 pb-1">
          <div class="section-title flex-1">리스크</div>
          <template v-if="dataB">
            <div class="col-header">{{ dataA!.ticker }}</div>
            <div class="col-header">{{ dataB.ticker }}</div>
          </template>
        </div>

        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption d-flex align-center ga-1">
            MDD (최대 낙폭)
            <v-tooltip :text="tooltips.mdd" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <!-- MDD는 음수값 → 0에 가까울수록(높을수록) 낙폭 적음 → higherIsBetter: true -->
          <div class="metric-val text-body-2 text-right" :class="cls(dataA!.mdd, dataB?.mdd ?? null, true, 'a')">
            {{ fmt.pct(dataA!.mdd) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 text-right" :class="cls(dataA!.mdd, dataB.mdd, true, 'b')">
            {{ fmt.pct(dataB.mdd) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption d-flex align-center ga-1">
            연간 변동성
            <v-tooltip :text="tooltips.volatility" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val text-body-2 text-right" :class="cls(dataA!.volatility, dataB?.volatility ?? null, false, 'a')">
            {{ fmt.pct(dataA!.volatility) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 text-right" :class="cls(dataA!.volatility, dataB.volatility, false, 'b')">
            {{ fmt.pct(dataB.volatility) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption d-flex align-center ga-1">
            베타
            <v-tooltip :text="tooltips.beta" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val text-body-2 text-right" :class="cls(dataA!.beta, dataB?.beta ?? null, false, 'a')">
            {{ fmt.num(dataA!.beta) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 text-right" :class="cls(dataA!.beta, dataB.beta, false, 'b')">
            {{ fmt.num(dataB.beta) }}
          </div>
        </div>
      </v-card>

      <!-- 배당 & 비용 섹션 -->
      <v-card rounded="xl" class="mb-3 overflow-hidden">
        <div class="section-title-row px-4 pt-3 pb-1">
          <div class="section-title flex-1">배당 & 비용</div>
          <template v-if="dataB">
            <div class="col-header">{{ dataA!.ticker }}</div>
            <div class="col-header">{{ dataB.ticker }}</div>
          </template>
        </div>

        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption d-flex align-center ga-1">
            배당률
            <v-tooltip :text="tooltips.dividendYield" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val text-body-2 text-right" :class="cls(dataA!.dividendYield, dataB?.dividendYield ?? null, true, 'a')">
            {{ fmt.pct(dataA!.dividendYield) }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 text-right" :class="cls(dataA!.dividendYield, dataB.dividendYield, true, 'b')">
            {{ fmt.pct(dataB.dividendYield) }}
          </div>
        </div>
        <div class="metric-row d-flex align-center px-4 py-3">
          <div class="metric-label text-caption d-flex align-center ga-1">
            운용보수 (TER)
            <v-tooltip :text="tooltips.ter" location="bottom" open-on-click>
              <template #activator="{ props }">
                <v-icon v-bind="props" size="13" class="tooltip-icon">mdi-information-outline</v-icon>
              </template>
            </v-tooltip>
          </div>
          <div class="metric-val text-body-2 text-right" :class="cls(dataA!.expenseRatio, dataB?.expenseRatio ?? null, false, 'a')">
            {{ dataA!.expenseRatio != null ? fmt.pct(dataA!.expenseRatio, 2) : '-' }}
          </div>
          <div v-if="dataB" class="metric-val text-body-2 text-right" :class="cls(dataA!.expenseRatio, dataB.expenseRatio, false, 'b')">
            {{ dataB.expenseRatio != null ? fmt.pct(dataB.expenseRatio, 2) : '-' }}
          </div>
        </div>
      </v-card>

      <!-- AI 요약 -->
      <v-card v-if="aiSummary" rounded="xl" class="mb-4 ai-card pa-4">
        <div class="d-flex align-center ga-2 mb-2">
          <v-icon size="18" color="primary">mdi-creation</v-icon>
          <div class="text-caption font-weight-bold" style="color: rgb(var(--v-theme-primary))">AI 분석 요약</div>
        </div>
        <div class="text-body-2" style="line-height:1.7">{{ aiSummary }}</div>
      </v-card>

      <div class="text-caption text-medium-emphasis">
        * Yahoo Finance 데이터 기반 · 투자 판단의 참고 자료로만 활용하세요.
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.etf-card {
  background: rgba(var(--v-theme-primary), 0.05);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
  border-radius: 16px;
}
.section-title-row {
  display: flex;
  align-items: center;
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
  min-width: 84px;
}
.col-header {
  min-width: 84px;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
.tooltip-icon {
  color: rgba(var(--v-theme-on-surface), 0.35);
  cursor: pointer;
}
.winner {
  color: rgb(var(--v-theme-success));
  font-weight: 700;
}
.loser {
  color: rgb(var(--v-theme-error));
}
.ai-card {
  background: rgba(var(--v-theme-primary), 0.04);
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
}
</style>
