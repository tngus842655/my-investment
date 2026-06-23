export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value))
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
