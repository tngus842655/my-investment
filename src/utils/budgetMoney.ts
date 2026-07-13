import type { CurrencyCode } from '@/config/marketConfig'
import { getCachedRate } from '@/services/exchangeRateCache'
import { formatCurrency, formatMoneyIn } from '@/utils/numberFormat'
import { isKoLocale } from '@/plugins/i18n'

// 가계부 금액 환산·포맷 (BUDGET_GLOBALIZATION.md 통화 설계 3·5항)
// 내역은 행별 currency로 저장돼 있고, 집계는 표시 시점에 현재 기준통화로 환산 후 합산한다.

// 행 통화 → 기준통화 환율 맵 생성. 기준통화와 같은 통화는 항등이라 조회하지 않으므로
// 전 행이 기준통화와 같은(대부분의) 사용자는 환율 API를 아예 호출하지 않는다.
export const loadRatesToBase = async (
  currencies: Iterable<string>,
  base: CurrencyCode,
): Promise<Record<string, number>> => {
  const rates: Record<string, number> = {}
  for (const cur of new Set(currencies)) {
    if (cur === base) continue
    rates[cur] = await getCachedRate(cur as CurrencyCode, base)
  }
  return rates
}

export const toBaseAmount = (
  amount: number,
  currency: string,
  base: CurrencyCode,
  rates: Record<string, number>,
): number => (currency === base ? amount : amount * (rates[currency] ?? 1))

// 단건 금액: 기록된 통화 그대로 표시. ko 로케일 + KRW는 기존 "12,000원" 표기와 문자열 단위로 동일.
export const formatBudgetAmount = (value: number, currency: CurrencyCode): string =>
  formatMoneyIn(value, currency, 'full')

// 집계 금액(기준통화, 접미사 없는 자리용): ko + KRW는 기존 "12,000" 그대로,
// 그 외에는 통화 기호 포함 포맷(예: "$1,234") — 숫자만으로는 통화가 모호하므로.
export const formatBudgetSumBare = (value: number, base: CurrencyCode): string =>
  base === 'KRW' && isKoLocale() ? formatCurrency(value) : formatMoneyIn(value, base, 'full')
