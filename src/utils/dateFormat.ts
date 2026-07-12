import { i18n } from '@/plugins/i18n'

// locale 연동 날짜/기간 포맷 (GLOBALIZATION.md 단계 D).
// 예: ko "2027년 9월" ↔ en "Sep 2027", ko "3년 2개월" ↔ en "3y 2mo".
// 영어 월 약어는 로케일 데이터가 아니라 코드 상수라 여기 둔다.

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const t = i18n.global.t

// year + month(1~12) → 로케일 표기 (ko: "2027년 9월", en: "Sep 2027")
export const formatYearMonth = (year: number, month: number): string =>
  t('date.yearMonth', { year, month, monthShort: MONTHS_EN[month - 1] ?? String(month) })

// year + month(1~12) + day → 로케일 표기 (ko: "2027년 9월 5일", en: "Sep 5, 2027")
export const formatFullDate = (year: number, month: number, day: number): string =>
  t('date.fullDate', { year, month, day, monthShort: MONTHS_EN[month - 1] ?? String(month) })

// "YYYY-MM-DD" 문자열 → formatFullDate
export const formatFullDateStr = (dateStr: string): string => {
  const parts = dateStr.split('-')
  return formatFullDate(Number(parts[0]), Number(parts[1]), Number(parts[2]))
}

// 개월 수 → 기간 표기 (ko: "3년 2개월"/"5개월", en: "3y 2mo"/"5mo")
export const formatDuration = (totalMonths: number): string => {
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (years > 0) {
    return months > 0
      ? t('date.durationYM', { years, months })
      : t('date.durationY', { years })
  }
  return t('date.durationM', { months: totalMonths })
}
