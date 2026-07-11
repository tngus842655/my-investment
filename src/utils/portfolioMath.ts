// PortfolioView.vue(실시간 재계산)와 assetSummary.ts(백그라운드 재계산)가
// 공통으로 사용하는 평가금액/원가 계산 공식. 한쪽만 고치고 다른 쪽을
// 놓치면 화면마다 총자산 값이 달라지는 문제가 생기므로 반드시 여기만 수정한다.

import { isCrypto, type ClassifiableItem, type CurrencyCode } from '@/config/marketConfig'

export interface EvaluatableItem extends ClassifiableItem {
  currency: string
  avg_price: number
  quantity: number
}

// 통화 간 금액 환산. usdKrw: USD 1단위 = KRW 환율.
// 활성 통화가 KRW/USD뿐이라 환율 하나로 충분하다 (JPY/CNY 활성화 시 환율 테이블로 확장).
export const convertMoney = (amount: number, from: string, to: string, usdKrw: number): number => {
  if (from === to) return amount
  if (from === 'USD' && to === 'KRW') return amount * usdKrw
  if (from === 'KRW' && to === 'USD') return amount / usdKrw
  return amount
}

// 현재가(currentPrice, null이면 미조회/실패 → avg_price로 대체)와 환율로 기준통화 평가금액 계산.
// 암호화폐 시세는 API가 USD로 반환하므로, 통화가 USD가 아닌 종목은 종목 통화로 먼저 환산한다.
export const evaluateItemBase = (
  item: EvaluatableItem,
  currentPrice: number | null,
  usdKrw: number,
  base: CurrencyCode,
) => {
  const isCryptoKrw = isCrypto(item) && item.currency !== 'USD'
  const currentPriceInCurrency = currentPrice
    ? (isCryptoKrw ? convertMoney(currentPrice, 'USD', item.currency, usdKrw) : currentPrice)
    : null
  const price = currentPriceInCurrency ?? item.avg_price
  const evaluationAmount = price * item.quantity
  const evaluationAmountBase = convertMoney(evaluationAmount, item.currency, base, usdKrw)
  return { isCryptoKrw, currentPriceInCurrency, evaluationAmount, evaluationAmountBase }
}

// 평균단가 기준 단순 기준통화 원가 (거래별 환율은 반영하지 않는 근사치)
export const simpleCostBase = (
  item: { currency: string; avg_price: number; quantity: number },
  usdKrw: number,
  base: CurrencyCode,
) => convertMoney(item.avg_price * item.quantity, item.currency, base, usdKrw)
