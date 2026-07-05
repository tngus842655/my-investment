import type { BudgetType } from '@/types/budget'

// 최초 가계부 진입 시 한 번 시딩되는 기본 카테고리
export const DEFAULT_BUDGET_CATEGORIES: { type: BudgetType; name: string; icon: string }[] = [
  { type: 'EXPENSE', name: '식비', icon: '🍚' },
  { type: 'EXPENSE', name: '교통', icon: '🚗' },
  { type: 'EXPENSE', name: '건강/연금', icon: '💊' },
  { type: 'EXPENSE', name: '패션/미용', icon: '👗' },
  { type: 'EXPENSE', name: '생활', icon: '🛋️' },
  { type: 'EXPENSE', name: '통신', icon: '📱' },
  { type: 'EXPENSE', name: '보험', icon: '🛡️' },
  { type: 'EXPENSE', name: '적금', icon: '💰' },
  { type: 'EXPENSE', name: '기타', icon: '🎸' },
  { type: 'INCOME', name: '월급', icon: '💵' },
  { type: 'INCOME', name: '용돈', icon: '🎁' },
  { type: 'INCOME', name: '부수입', icon: '💼' },
  { type: 'INCOME', name: '기타', icon: '🧾' },
]

// 자주 쓰는 카테고리 아이콘 선택지 (추가/수정 다이얼로그에서 사용)
export const BUDGET_CATEGORY_ICON_CHOICES = [
  '🍚', '🚗', '💊', '👗', '🛋️', '📱', '🛡️', '💰', '🎸',
  '☕', '🍺', '🎮', '📚', '✈️', '🏠', '🐾', '🎁', '🧾',
  '💵', '🎁', '💼', '🧧', '🏥', '⚡', '🎓', '🛒',
]
