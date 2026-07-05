export type BudgetType = 'INCOME' | 'EXPENSE'

export interface BudgetCategory {
  id: string
  user_id: string
  type: BudgetType
  name: string
  icon: string
  sort_order: number
  created_at: string
  updated_at: string
}
