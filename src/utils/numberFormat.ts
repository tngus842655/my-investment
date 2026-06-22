export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value))
}

export const formatShortMoney = (value: number) => {
  if (!value) return '-'

  const rounded = Math.round(value)  // 소수점 제거

  const eok = Math.floor(rounded / 100000000)
  const remainder = rounded % 100000000
  const cheonman = Math.floor(remainder / 10000000)

  if (eok > 0) {
    if (cheonman > 0) return `${eok}억 ${cheonman}천만`
    return `${eok}억`
  }

  if (cheonman > 0) return `${cheonman}천만`

  const man = Math.floor(rounded / 10000)
  return `${man.toLocaleString()}만`
}

export const formatCurrencyWithShort = (value: number) => {
  return `${formatCurrency(value)} 원 (${formatShortMoney(value)})`
}
