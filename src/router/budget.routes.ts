import type { RouteRecordRaw } from 'vue-router'
import BudgetLayout from '@/layouts/BudgetLayout.vue'
import BudgetCategoryView from '@/views/budget/BudgetCategoryView.vue'

const budgetRoutes: RouteRecordRaw[] = [
  {
    path: '/budget',
    component: BudgetLayout,
    meta: { requiresAuth: true },
    children: [
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
