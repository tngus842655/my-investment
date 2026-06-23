import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/services/supabase'

import LoginView from '@/views/auth/LoginView.vue'
import GoalSettingsView from '@/views/dashboard/GoalSettingsView.vue'
import DashboardView from '@/views/dashboard/DashboardView.vue'
import PortfolioView from '@/views/portfolio/PortfolioView.vue'
import TransactionView from '@/views/transactions/TransactionView.vue'

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
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true, requiresGoal: true },
    },
    {
      path: '/portfolio',
      name: 'portfolio',
      component: PortfolioView,
      meta: { requiresAuth: true, requiresGoal: true },
    },
    {
      path: '/transactions',
      name: 'transactions',
      component: TransactionView,
      meta: { requiresAuth: true, requiresGoal: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // 비로그인 → 로그인 페이지로
  if (to.meta.requiresAuth && !session) {
    return '/'
  }

  // 로그인 상태에서 목표 설정 필요한 페이지 접근 시 목표 설정 여부 확인
  if (to.meta.requiresGoal && session) {
    const { data: goal } = await supabase
      .from('investment_goals')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (!goal) {
      return '/goalSettings'
    }
  }

  return true
})

export default router
