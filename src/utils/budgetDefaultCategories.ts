import type { BudgetType } from '@/types/budget'
import { isKoLocale } from '@/plugins/i18n'

// 최초 가계부 진입 시 한 번 시딩되는 기본 카테고리.
// 이름은 DB에 사용자 데이터로 저장되므로 시딩 시점의 로케일에 맞는 문자열을 넣는다
// (이미 시딩된 기존 데이터는 건드리지 않음 — BUDGET_GLOBALIZATION.md 단계 6).
const KO_CATEGORIES: { type: BudgetType; name: string }[] = [
  { type: 'EXPENSE', name: '🍚 식비' },
  { type: 'EXPENSE', name: '🚗 교통' },
  { type: 'EXPENSE', name: '💊 건강' },
  { type: 'EXPENSE', name: '👗 패션' },
  { type: 'EXPENSE', name: '🛋️ 생활' },
  { type: 'EXPENSE', name: '📱 통신' },
  { type: 'EXPENSE', name: '🛡️ 보험' },
  { type: 'EXPENSE', name: '💰 적금' },
  { type: 'EXPENSE', name: '🧾 기타' },
  { type: 'INCOME', name: '💵 월급' },
  { type: 'INCOME', name: '🎁 용돈' },
  { type: 'INCOME', name: '💼 부수입' },
  { type: 'INCOME', name: '🧾 기타' },
]

const EN_CATEGORIES: { type: BudgetType; name: string }[] = [
  { type: 'EXPENSE', name: '🍚 Food' },
  { type: 'EXPENSE', name: '🚗 Transport' },
  { type: 'EXPENSE', name: '💊 Health' },
  { type: 'EXPENSE', name: '👗 Fashion' },
  { type: 'EXPENSE', name: '🛋️ Household' },
  { type: 'EXPENSE', name: '📱 Phone' },
  { type: 'EXPENSE', name: '🛡️ Insurance' },
  { type: 'EXPENSE', name: '💰 Savings' },
  { type: 'EXPENSE', name: '🧾 Other' },
  { type: 'INCOME', name: '💵 Salary' },
  { type: 'INCOME', name: '🎁 Allowance' },
  { type: 'INCOME', name: '💼 Side Income' },
  { type: 'INCOME', name: '🧾 Other' },
]

export const getDefaultBudgetCategories = () => (isKoLocale() ? KO_CATEGORIES : EN_CATEGORIES)
