import type { RouteRecordRaw } from 'vue-router'
import BudgetLayout from '@/layouts/BudgetLayout.vue'
import BudgetCalendarView from '@/views/budget/BudgetCalendarView.vue'
import BudgetStatsView from '@/views/budget/BudgetStatsView.vue'
import BudgetManageView from '@/views/budget/BudgetManageView.vue'
import BudgetMoreView from '@/views/budget/BudgetMoreView.vue'
import BudgetSearchView from '@/views/budget/BudgetSearchView.vue'
import ChangePasswordView from '@/views/shared/ChangePasswordView.vue'
import DisplaySettingsView from '@/views/shared/DisplaySettingsView.vue'
import FeedbackView from '@/views/shared/FeedbackView.vue'
import NoticesView from '@/views/shared/NoticesView.vue'
import ReleaseNotesView from '@/views/shared/ReleaseNotesView.vue'

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
        path: 'change-password',
        name: 'budgetChangePassword',
        component: ChangePasswordView,
        meta: { label: '비밀번호 변경' },
      },
      {
        path: 'display-settings',
        name: 'budgetDisplaySettings',
        component: DisplaySettingsView,
        meta: { label: '화면 설정' },
      },
      {
        path: 'feedback',
        name: 'budgetFeedback',
        component: FeedbackView,
        meta: { label: '피드백' },
      },
      {
        path: 'notices',
        name: 'budgetNotices',
        component: NoticesView,
        meta: { label: '공지사항' },
      },
      {
        path: 'release-notes',
        name: 'budgetReleaseNotes',
        component: ReleaseNotesView,
        meta: { label: '개발자 노트' },
      },
    ],
  },
]

export default budgetRoutes
