import type { CurrencyCode } from '@/config/marketConfig'

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value))
}

// 통화별 금액 포맷 (GLOBALIZATION.md 단계 C)
//  - 'full':  KRW '1,234,567원' / 그 외 '$1,234,567'
//  - 'short': KRW '1억 2,345만원' / 그 외 full과 동일
//  - 'bare':  KRW '1억 2,345만' (단위 접미사 없음 — 라벨에 단위가 따로 있는 화면용) / 그 외 full과 동일
export type MoneyStyle = 'full' | 'short' | 'bare'

export const formatMoneyIn = (value: number, currency: CurrencyCode, style: MoneyStyle = 'short'): string => {
  if (currency === 'KRW') {
    if (style === 'full') return `${Math.round(value).toLocaleString('ko-KR')}원`
    const s = formatShortMoney(value)
    return style === 'short' ? `${s}원` : s
  }
  // KRW 외 통화는 Intl 통화 포맷 (기존 달러 토글의 formatUsd와 동일 규칙)
  return value.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })
}

export const formatShortMoney = (value: number) => {
  if (!value) return '-'

  const rounded = Math.round(value)
  const eok = Math.floor(rounded / 100000000)
  const man = Math.floor((rounded % 100000000) / 10000)

  if (eok > 0) {
    if (man > 0) return `${eok}억 ${man.toLocaleString()}만`
    return `${eok}억`
  }

  return `${man.toLocaleString()}만`
}

export const formatCurrencyWithShort = (value: number) => {
  return `${formatCurrency(value)} 원 (${formatShortMoney(value)})`
}
