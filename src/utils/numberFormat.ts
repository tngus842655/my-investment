import type { CurrencyCode } from '@/config/marketConfig'
import { isKoLocale } from '@/plugins/i18n'

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value))
}

// 통화별 금액 포맷 (GLOBALIZATION.md 단계 C)
// ko 로케일 KRW:
//  - 'full':  '1,234,567원'
//  - 'short': '1억 2,345만원'
//  - 'bare':  '1억 2,345만' (단위 접미사 없음 — 라벨에 단위가 따로 있는 화면용)
// ko 외 로케일 KRW는 한글 단위(억/만) 대신 국제 표기:
//  - 'full':  '₩1,234,567' / 'short'·'bare': '₩972.17M' (Intl compact, 작은 값은 '₩9,500' 그대로)
// KRW 외 통화는 로케일 무관 Intl 통화 포맷 ('$1,234,567')
export type MoneyStyle = 'full' | 'short' | 'bare'

export const formatMoneyIn = (value: number, currency: CurrencyCode, style: MoneyStyle = 'short'): string => {
  if (currency === 'KRW') {
    if (isKoLocale()) {
      if (style === 'full') return `${Math.round(value).toLocaleString('ko-KR')}원`
      const s = formatShortMoney(value)
      return style === 'short' ? `${s}원` : s
    }
    if (style === 'full') return value.toLocaleString('en-US', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 })
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'KRW', notation: 'compact', maximumFractionDigits: 2 }).format(value)
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
