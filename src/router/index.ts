import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/services/supabase'

import LoginView from '@/views/auth/LoginView.vue'
import GoalSettingsView from '@/views/dashboard/GoalSettingsView.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import DashboardView from '@/views/dashboard/DashboardView.vue'
import PortfolioView from '@/views/portfolio/PortfolioView.vue'
import TransactionView from '@/views/transactions/TransactionView.vue'
import AnalysisView from '@/views/analysis/AnalysisView.vue'
import MoreView from '@/views/more/MoreView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
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
