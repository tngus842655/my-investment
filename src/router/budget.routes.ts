import type { RouteRecordRaw } from 'vue-router'
import BudgetLayout from '@/layouts/BudgetLayout.vue'
import BudgetCalendarView from '@/views/budget/BudgetCalendarView.vue'
import BudgetStatsView from '@/views/budget/BudgetStatsView.vue'
import BudgetCategoryView from '@/views/budget/BudgetCategoryView.vue'

const budgetRoutes: RouteRecordRaw[] = [
  {
    path: '/budget',
    component: BudgetLayout,
    meta: { requiresAuth: true, module: 'budget' },
    children: [
      {
        path: '',
        name: 'budgetHome',
        component: BudgetCalendarView,
        meta: { label: '가계부' },
      },
      {
        path: 'stats',
        name: 'budgetStats',
        component: BudgetStatsView,
        meta: { label: '통계' },
      },
      {
        path: 'categories',
        name: 'budgetCategories',
        component: BudgetCategoryView,
        meta: { label: '카테고리 관리' },
      },
    ],
  },
]

export default budgetRoutes
