import type { RouteRecordRaw } from 'vue-router'
import BudgetLayout from '@/layouts/BudgetLayout.vue'
import BudgetCalendarView from '@/views/budget/BudgetCalendarView.vue'
import BudgetStatsView from '@/views/budget/BudgetStatsView.vue'
import BudgetManageView from '@/views/budget/BudgetManageView.vue'
import BudgetImportView from '@/views/budget/BudgetImportView.vue'
import BudgetMoreView from '@/views/budget/BudgetMoreView.vue'
import BudgetSearchView from '@/views/budget/BudgetSearchView.vue'

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
        meta: { label: '캘린더' },
      },
      {
        path: 'stats',
        name: 'budgetStats',
        component: BudgetStatsView,
        meta: { label: '통계' },
      },
      {
        path: 'more',
        name: 'budgetMore',
        component: BudgetMoreView,
        meta: { label: '더보기' },
      },
      {
        path: 'search',
        name: 'budgetSearch',
        component: BudgetSearchView,
        meta: { label: '내역 검색' },
      },
      {
        path: 'manage',
        name: 'budgetManage',
        component: BudgetManageView,
        meta: { label: '관리' },
      },
      {
        path: 'import',
        name: 'budgetImport',
        component: BudgetImportView,
        meta: { label: '엑셀 가져오기' },
      },
    ],
  },
]

export default budgetRoutes
