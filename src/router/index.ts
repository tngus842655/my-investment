import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/services/supabase'

import LoginView from '@/views/auth/LoginView.vue'
import GoalSettingsView from '@/views/dashboard/GoalSettingsView.vue'
import DashboardView from '@/views/dashboard/DashboardView.vue'

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
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
      meta: {
        requiresAuth: true,
      },
    },
  ],
})

router.beforeEach(async (to) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (to.meta.requiresAuth && !session) {
    return '/'
  }

  return true
})

export default router
