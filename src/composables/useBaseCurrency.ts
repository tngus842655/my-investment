import { ref, computed } from 'vue'
import type { CurrencyCode } from '@/config/marketConfig'
import { formatMoneyIn, type MoneyStyle } from '@/utils/numberFormat'

// 기준통화(base currency): 자산을 집계·표시하는 통화 (GLOBALIZATION.md 단계 C).
// 원본은 investment_goals.base_currency이며, userData 스토어가 goals 로드/초기화 시
// setBaseCurrency로 이 모듈 레벨 ref를 동기화한다.
//
// 기존 원화/달러 토글(useDisplayCurrency)의 재해석: 표시통화가 기준통화와 다르면
// "미리보기"(현재 환율로 환산해 보기)이며 저장 데이터에는 영향이 없다.

const STORAGE_KEY = 'firepath-display-currency' // 기존 토글 키 유지 (KRW/USD 저장)

const baseCurrency = ref<CurrencyCode>('KRW')

const stored = localStorage.getItem(STORAGE_KEY)
const selectedDisplay = ref<CurrencyCode | null>(stored === 'USD' || stored === 'KRW' ? stored : null)

export const setBaseCurrency = (c: CurrencyCode) => {
  baseCurrency.value = c
}

export const useBaseCurrency = () => {
  const displayCurrency = computed<CurrencyCode>(() => selectedDisplay.value ?? baseCurrency.value)
  const isPreview = computed(() => displayCurrency.value !== baseCurrency.value)

  const setDisplayCurrency = (c: CurrencyCode) => {
    if (selectedDisplay.value === c) return
    selectedDisplay.value = c
    localStorage.setItem(STORAGE_KEY, c)
  }

  // 기준통화 금액을 표시통화로 환산 (활성 통화가 KRW/USD뿐이라 usdKrw 환율 하나로 충분)
  const toDisplay = (vBase: number, usdKrw: number): number => {
    const from = baseCurrency.value
    const to = displayCurrency.value
    if (from === to) return vBase
    if (from === 'KRW' && to === 'USD') return vBase / usdKrw
    if (from === 'USD' && to === 'KRW') return vBase * usdKrw
    return vBase
  }

  // 기준통화 금액 vBase를 표시통화로 포맷. usdKrw: USD→KRW 환율 (각 화면이 들고 있는 값)
  const money = (vBase: number, usdKrw: number, style: MoneyStyle = 'short'): string =>
    formatMoneyIn(toDisplay(vBase, usdKrw), displayCurrency.value, style)

  // KRW 전용 커스텀 축약 표기를 유지해야 하는 화면용:
  // 기준·표시가 모두 KRW면 기존 커스텀 포맷, 그 외에는 표시통화 기본 포맷.
  const moneyOr = (vBase: number, usdKrw: number, customKrw: (v: number) => string): string =>
    baseCurrency.value === 'KRW' && displayCurrency.value === 'KRW'
      ? customKrw(vBase)
      : money(vBase, usdKrw, 'full')

  return { baseCurrency, displayCurrency, isPreview, setDisplayCurrency, money, moneyOr }
}
