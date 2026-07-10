// PortfolioView.vue(실시간 재계산)와 assetSummary.ts(백그라운드 재계산)가
// 공통으로 사용하는 평가금액/원가 계산 공식. 한쪽만 고치고 다른 쪽을
// 놓치면 화면마다 총자산 값이 달라지는 문제가 생기므로 반드시 여기만 수정한다.

import { isCrypto, type ClassifiableItem } from '@/config/marketConfig'

export interface EvaluatableItem extends ClassifiableItem {
  currency: string
  avg_price: number
  quantity: number
}

// 현재가(currentPrice, null이면 미조회/실패 → avg_price로 대체)와 환율로 KRW 평가금액 계산.
// 암호화폐 + KRW는 시세 API가 USD로 반환하므로 환율을 곱해 KRW로 환산.
export const evaluateItemKrw = (item: EvaluatableItem, currentPrice: number | null, rate: number) => {
  const isCryptoKrw = isCrypto(item) && item.currency === 'KRW'
  const currentPriceInCurrency = currentPrice
    ? (isCryptoKrw ? currentPrice * rate : currentPrice)
    : null
  const price = currentPriceInCurrency ?? item.avg_price
  const evaluationAmount = price * item.quantity
  const evaluationAmountKrw =
    item.currency === 'USD' && !isCryptoKrw ? evaluationAmount * rate : evaluationAmount
  return { isCryptoKrw, currentPriceInCurrency, evaluationAmount, evaluationAmountKrw }
}

// 평균단가 기준 단순 KRW 원가 (거래별 환율은 반영하지 않는 근사치)
export const simpleCostKrw = (
  item: { currency: string; avg_price: number; quantity: number },
  rate: number,
) => (item.currency === 'USD' ? item.avg_price * item.quantity * rate : item.avg_price * item.quantity)
