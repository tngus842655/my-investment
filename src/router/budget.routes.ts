import type { RouteRecordRaw } from 'vue-router'

const budgetRoutes: RouteRecordRaw[] = [
  {
    path: '/budget',
    component: () => import('@/layouts/BudgetLayout.vue'),
    meta: { requiresAuth: true, module: 'budget' },
    children: [
      {
        path: '',
        name: 'budgetHome',
        component: () => import('@/views/budget/BudgetCalendarView.vue'),
        meta: { label: '캘린더' },
      },
      {
        path: 'stats',
        name: 'budgetStats',
        component: () => import('@/views/budget/BudgetStatsView.vue'),
        meta: { label: '통계' },
      },
      {
        path: 'more',
        name: 'budgetMore',
        component: () => import('@/views/budget/BudgetMoreView.vue'),
        meta: { label: '더보기' },
      },
      {
        path: 'search',
        name: 'budgetSearch',
        component: () => import('@/views/budget/BudgetSearchView.vue'),
        meta: { label: '내역 검색' },
      },
      {
        path: 'manage',
        name: 'budgetManage',
        component: () => import('@/views/budget/BudgetManageView.vue'),
        meta: { label: '관리' },
      },
      {
        path: 'import',
        name: 'budgetImport',
        component: () => import('@/views/budget/BudgetImportView.vue'),
        meta: { label: '엑셀 가져오기' },
      },
    ],
  },
]

export default budgetRoutes
