import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/services/supabase'
import { ADMIN_EMAIL } from '@/config/admin'

import LoginView from '@/views/auth/LoginView.vue'
import GoalSettingsView from '@/views/dashboard/GoalSettingsView.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import DashboardView from '@/views/dashboard/DashboardView.vue'
import PortfolioView from '@/views/portfolio/PortfolioView.vue'
import TransactionView from '@/views/transactions/TransactionView.vue'
import AnalysisView from '@/views/analysis/AnalysisView.vue'
import MoreView from '@/views/more/MoreView.vue'
import PortfolioAnalysisView from '@/views/more/PortfolioAnalysisView.vue'
import BadgesView from '@/views/more/BadgesView.vue'
import FireSimulatorView from '@/views/more/FireSimulatorView.vue'
import FireHistoryView from '@/views/more/FireHistoryView.vue'
import AssetGrowthView from '@/views/more/AssetGrowthView.vue'
import DividendCalendarView from '@/views/more/DividendCalendarView.vue'
import EtfAnalysisView from '@/views/more/EtfAnalysisView.vue'
import FeedbackView from '@/views/more/FeedbackView.vue'
import AdminView from '@/views/admin/AdminView.vue'
import AdminResetPasswordView from '@/views/admin/AdminResetPasswordView.vue'
import AdminLoginLogView from '@/views/admin/AdminLoginLogView.vue'
import AdminSignupLogView from '@/views/admin/AdminSignupLogView.vue'
import AdminStatsView from '@/views/admin/AdminStatsView.vue'
import AdminMembersView from '@/views/admin/AdminMembersView.vue'
import AdminDataView from '@/views/admin/AdminDataView.vue'
import AdminTickerView from '@/views/admin/AdminTickerView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/reset-password',
      name: 'adminResetPassword',
      component: AdminResetPasswordView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/login-log',
      name: 'adminLoginLog',
      component: AdminLoginLogView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/signup-log',
      name: 'adminSignupLog',
      component: AdminSignupLogView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/stats',
      name: 'adminStats',
      component: AdminStatsView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/members',
      name: 'adminMembers',
      component: AdminMembersView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/data',
      name: 'adminData',
      component: AdminDataView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/tickers',
      name: 'adminTickers',
      component: AdminTickerView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/goalSettings',
      name: 'goalSettings',
      component: GoalSettingsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true, requiresGoal: true },
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardView,
        },
        {
          path: 'portfolio',
          name: 'portfolio',
          component: PortfolioView,
        },
        {
          path: 'transactions',
          name: 'transactions',
          component: TransactionView,
        },
        {
          path: 'analysis',
          name: 'analysis',
          component: AnalysisView,
        },
        {
          path: 'more',
          name: 'more',
          component: MoreView,
        },
        {
          path: 'portfolio-analysis',
          name: 'portfolioAnalysis',
          component: PortfolioAnalysisView,
        },
        {
          path: 'badges',
          name: 'badges',
          component: BadgesView,
        },
        {
          path: 'fire-simulator',
          name: 'fireSimulator',
          component: FireSimulatorView,
        },
        {
          path: 'fire-history',
          name: 'fireHistory',
          component: FireHistoryView,
        },
        {
          path: 'asset-growth',
          name: 'assetGrowth',
          component: AssetGrowthView,
        },
        {
          path: 'dividend-calendar',
          name: 'dividendCalendar',
          component: DividendCalendarView,
        },
        {
          path: 'etf-analysis',
          name: 'etfAnalysis',
          component: EtfAnalysisView,
        },
        {
          path: 'feedback',
          name: 'feedback',
          component: FeedbackView,
        },
      ],
    },
  ],
})

// 세션 내 목표 설정 여부 캐시 (재조회 방지)
let goalCheckedUserId: string | null = null

router.beforeEach(async (to) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (to.meta.requiresAuth && !session) {
    goalCheckedUserId = null
    return '/'
  }

  if (to.meta.requiresAdmin && session?.user.email !== ADMIN_EMAIL) {
    return '/dashboard'
  }

  if (to.meta.requiresGoal && session) {
    if (goalCheckedUserId !== session.user.id) {
      const { data: goal } = await supabase
        .from('investment_goals')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!goal) {
        return '/goalSettings'
      }
      goalCheckedUserId = session.user.id
    }
  }

  return true
})

// 목표 설정 저장 후 캐시 갱신용 export
export const invalidateGoalCache = () => {
  goalCheckedUserId = null
}

export default router
