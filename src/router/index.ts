import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/services/supabase'
import { isAdminEmail } from '@/config/admin'
import { setLastModule, getLastModule } from '@/utils/lastModule'
import { markCategoryVisited } from '@/services/tossPromotion'
import budgetRoutes from './budget.routes'

import LoginView from '@/views/auth/LoginView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/privacy-policy',
      name: 'privacyPolicy',
      component: () => import('@/views/shared/PrivacyPolicyView.vue'),
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('@/views/shared/TermsView.vue'),
    },
    {
      path: '/reset-password',
      name: 'resetPassword',
      component: () => import('@/views/auth/ResetPasswordView.vue'),
    },
    {
      path: '/completeEmail',
      name: 'completeEmail',
      component: () => import('@/views/auth/CompleteEmailView.vue'),
    },
    {
      path: '/hub',
      name: 'hub',
      component: () => import('@/views/HubView.vue'),
      meta: { requiresAuth: true, label: '허브' },
    },
    ...budgetRoutes,
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/admin/AdminView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/reset-password',
      name: 'adminResetPassword',
      component: () => import('@/views/admin/AdminResetPasswordView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/access-history',
      name: 'adminAccessHistory',
      component: () => import('@/views/admin/AdminAccessHistoryView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/signup-log',
      name: 'adminSignupLog',
      component: () => import('@/views/admin/AdminSignupLogView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/stats',
      name: 'adminStats',
      component: () => import('@/views/admin/AdminStatsView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/members',
      name: 'adminMembers',
      component: () => import('@/views/admin/AdminMembersView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/data',
      name: 'adminData',
      component: () => import('@/views/admin/AdminDataView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/tickers',
      name: 'adminTickers',
      component: () => import('@/views/admin/AdminTickerView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/feedback',
      name: 'adminFeedback',
      component: () => import('@/views/admin/AdminFeedbackView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/notices',
      name: 'adminNotices',
      component: () => import('@/views/admin/AdminNoticesView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/goalSettings',
      name: 'goalSettings',
      component: () => import('@/views/asset/dashboard/GoalSettingsView.vue'),
      meta: { requiresAuth: true, label: '목표 설정' },
    },
    {
      path: '/feedback',
      name: 'feedback',
      component: () => import('@/views/shared/FeedbackView.vue'),
      meta: { requiresAuth: true, label: '피드백' },
    },
    {
      path: '/change-password',
      name: 'changePassword',
      component: () => import('@/views/shared/ChangePasswordView.vue'),
      meta: { requiresAuth: true, label: '비밀번호 변경' },
    },
    {
      path: '/linked-accounts',
      name: 'linkedAccounts',
      component: () => import('@/views/shared/LinkedAccountsView.vue'),
      meta: { requiresAuth: true, label: '소셜 로그인 연결' },
    },
    {
      path: '/display-settings',
      name: 'displaySettings',
      component: () => import('@/views/shared/DisplaySettingsView.vue'),
      meta: { requiresAuth: true, label: '화면 설정' },
    },
    {
      path: '/release-notes',
      name: 'releaseNotes',
      component: () => import('@/views/shared/ReleaseNotesView.vue'),
      meta: { requiresAuth: true, label: '개발자 노트' },
    },
    {
      path: '/notices',
      name: 'notices',
      component: () => import('@/views/shared/NoticesView.vue'),
      meta: { requiresAuth: true, label: '공지사항' },
    },
    {
      path: '/',
      component: () => import('@/layouts/AssetLayout.vue'),
      meta: { requiresAuth: true, requiresGoal: true, module: 'asset' },
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/asset/dashboard/DashboardView.vue'),
          meta: { label: '홈' },
        },
        {
          path: 'portfolio',
          name: 'portfolio',
          component: () => import('@/views/asset/portfolio/PortfolioView.vue'),
          meta: { label: '자산' },
        },
        {
          path: 'transactions',
          name: 'transactions',
          component: () => import('@/views/asset/transactions/TransactionView.vue'),
          meta: { label: '기록' },
        },
        {
          path: 'analysis',
          name: 'analysis',
          component: () => import('@/views/asset/analysis/AnalysisView.vue'),
          meta: { label: '예측' },
        },
        {
          path: 'more',
          name: 'more',
          component: () => import('@/views/asset/more/MoreView.vue'),
          meta: { label: '더보기' },
        },
        {
          path: 'portfolio-analysis',
          name: 'portfolioAnalysis',
          component: () => import('@/views/asset/more/PortfolioAnalysisView.vue'),
          meta: { label: '포트폴리오 분석' },
        },
        {
          path: 'badges',
          name: 'badges',
          component: () => import('@/views/asset/more/BadgesView.vue'),
          meta: { label: '뱃지' },
        },
        {
          path: 'fire-simulator',
          name: 'fireSimulator',
          component: () => import('@/views/asset/more/FireSimulatorView.vue'),
          meta: { label: 'FIRE 시뮬레이터' },
        },
        {
          path: 'fire-history',
          name: 'fireHistory',
          component: () => import('@/views/asset/more/FireHistoryView.vue'),
          meta: { label: 'FIRE 히스토리' },
        },
        {
          path: 'asset-growth',
          name: 'assetGrowth',
          component: () => import('@/views/asset/more/AssetGrowthView.vue'),
          meta: { label: '자산 성장' },
        },
        {
          path: 'dividend-calendar',
          name: 'dividendCalendar',
          component: () => import('@/views/asset/more/DividendCalendarView.vue'),
          meta: { label: '배당 캘린더' },
        },
        {
          path: 'etf-analysis',
          name: 'etfAnalysis',
          component: () => import('@/views/asset/more/EtfAnalysisView.vue'),
          meta: { label: 'ETF 분석' },
        },
        {
          path: 'etf-backtest',
          name: 'etfBacktest',
          component: () => import('@/views/asset/more/EtfBacktestView.vue'),
          meta: { label: 'ETF 백테스트' },
        },
      ],
    },
  ],
})

// 세션 내 목표 설정 여부 캐시 (재조회 방지)
let goalCheckedUserId: string | null = null

// 앱 최초 진입(홈 화면 아이콘 등으로 PWA start_url 진입) 여부 — 최초 1회만 마지막 모듈로 리다이렉트
let isInitialNavigation = true

// beforeEach가 조회한 세션의 사용자 id — afterEach에서 계정 단위로 모듈을 기록할 때 쓴다
let currentUserId: string | null = null

// 페이지별 마지막 접속 기록 캐시 (1시간 내 중복 방지)
const lastAccessedAt: Record<string, number> = {}
const ACCESS_LOG_INTERVAL_MS = 60 * 60 * 1000 // 1시간

const logAccess = (userId: string, email: string, page: string) => {
  const now = Date.now()
  const key = `${userId}:${page}`
  if (lastAccessedAt[key] && now - lastAccessedAt[key] < ACCESS_LOG_INTERVAL_MS) return
  lastAccessedAt[key] = now
  supabase.from('access_log').insert({ user_id: userId, email, page }).then()
}

router.beforeEach(async (to) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // SNS(카카오) 로그인 시 이메일을 제공받지 못한 계정 — 이메일 등록을 먼저 완료해야 앱 사용 가능
  const needsEmail = !!session && !session.user.email

  // 이메일 등록 화면 자체의 접근 제어
  if (to.path === '/completeEmail') {
    if (!session) return '/'
    if (!needsEmail) return '/hub' // 이미 이메일이 있으면 등록 화면 불필요
    return true
  }

  // 이메일 미보유 SNS 계정은 보호 페이지·로그인 리다이렉트 전에 이메일 등록으로 유도
  if (needsEmail && (to.meta.requiresAuth || to.path === '/')) {
    return '/completeEmail'
  }

  // 마지막 사용 모듈 기록은 계정 단위인데 afterEach에는 세션이 없다.
  // 매 내비게이션마다 beforeEach가 세션을 조회하므로 그 값을 넘겨 쓴다.
  currentUserId = session?.user.id ?? null

  if (isInitialNavigation) {
    isInitialNavigation = false
    if (to.path === '/dashboard' && session) {
      const lastModule = getLastModule(session.user.id)
      if (lastModule === 'budget') return '/budget'
    }
  }

  // 세션이 있는데 로그인 화면(/)으로 들어오면 마지막 사용 모듈로 보낸다 (LoginView 로그인 성공 후와 동일 규칙).
  // 안드로이드 앱(TWA) Start URL이 '/'라 앱을 열 때마다 로그인 폼이 떠서 로그아웃된 것처럼 보이던 문제 해결.
  // 로그아웃 플로우는 전부 signOut 완료 후 '/'로 이동하므로(세션 없음) 이 분기를 타지 않는다.
  if (to.path === '/' && session) {
    const lastModule = getLastModule(session.user.id)
    if (lastModule === 'budget') return '/budget'
    if (lastModule === 'asset') return '/dashboard'
    return '/hub'
  }

  if (to.meta.requiresAuth && !session) {
    goalCheckedUserId = null
    return '/'
  }

  if (to.meta.requiresAdmin && !isAdminEmail(session?.user.email)) {
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

  // 인증된 일반 유저 페이지 접속 로그 (관리자 및 로그인 페이지 제외)
  if (session && !isAdminEmail(session.user.email) && to.meta.requiresAuth) {
    logAccess(session.user.id, session.user.email ?? '', to.path)
  }

  // 앱인토스 프로모션 — 서비스 카테고리(자산관리/가계부) 진입 기록.
  // 리다이렉트 분기가 모두 끝난 지점이라 실제로 진입한 경우에만 기록된다.
  if (session && (to.meta.module === 'asset' || to.meta.module === 'budget')) {
    markCategoryVisited(session.user.id)
  }

  return true
})

// 마지막으로 사용한 모듈(자산관리/가계부) 기록 — 다음 로그인 시 자동 진입에 사용
router.afterEach((to) => {
  const module = to.meta.module
  if ((module === 'asset' || module === 'budget') && currentUserId !== null) {
    setLastModule(currentUserId, module)
  }
})

// 목표 설정 저장 후 캐시 갱신용 export
export const invalidateGoalCache = () => {
  goalCheckedUserId = null
}

export default router
