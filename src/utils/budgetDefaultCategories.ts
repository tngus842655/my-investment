import type { BudgetType } from '@/types/budget'

// 최초 가계부 진입 시 한 번 시딩되는 기본 카테고리
export const DEFAULT_BUDGET_CATEGORIES: { type: BudgetType; name: string }[] = [
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
