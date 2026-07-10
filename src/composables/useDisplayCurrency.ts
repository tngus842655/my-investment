import { ref } from 'vue'

export type DisplayCurrency = 'KRW' | 'USD'

const STORAGE_KEY = 'firepath-display-currency'

const displayCurrency = ref<DisplayCurrency>(
  localStorage.getItem(STORAGE_KEY) === 'USD' ? 'USD' : 'KRW',
)

export const useDisplayCurrency = () => {
  const setDisplayCurrency = (c: DisplayCurrency) => {
    if (displayCurrency.value === c) return
    displayCurrency.value = c
    localStorage.setItem(STORAGE_KEY, c)
  }

  // KRW 금액을 환율로 나눠 달러 표기로 변환
  const formatUsd = (krwValue: number, rate: number) =>
    (krwValue / rate).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    })

  return { displayCurrency, setDisplayCurrency, formatUsd }
}
