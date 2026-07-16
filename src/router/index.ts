import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/services/supabase'
import { isAdminEmail } from '@/config/admin'
import { setLastModule, getLastModule } from '@/utils/lastModule'
import budgetRoutes from './budget.routes'

import LoginView from '@/views/auth/LoginView.vue'
import HubView from '@/views/HubView.vue'
import GoalSettingsView from '@/views/asset/dashboard/GoalSettingsView.vue'
import AssetLayout from '@/layouts/AssetLayout.vue'
import DashboardView from '@/views/asset/dashboard/DashboardView.vue'
import PortfolioView from '@/views/asset/portfolio/PortfolioView.vue'
import TransactionView from '@/views/asset/transactions/TransactionView.vue'
import AnalysisView from '@/views/asset/analysis/AnalysisView.vue'
import MoreView from '@/views/asset/more/MoreView.vue'
import PortfolioAnalysisView from '@/views/asset/more/PortfolioAnalysisView.vue'
import BadgesView from '@/views/asset/more/BadgesView.vue'
import FireSimulatorView from '@/views/asset/more/FireSimulatorView.vue'
import FireHistoryView from '@/views/asset/more/FireHistoryView.vue'
import AssetGrowthView from '@/views/asset/more/AssetGrowthView.vue'
import DividendCalendarView from '@/views/asset/more/DividendCalendarView.vue'
import EtfAnalysisView from '@/views/asset/more/EtfAnalysisView.vue'
import EtfBacktestView from '@/views/asset/more/EtfBacktestView.vue'
import FeedbackView from '@/views/shared/FeedbackView.vue'
import ReleaseNotesView from '@/views/shared/ReleaseNotesView.vue'
import ChangePasswordView from '@/views/shared/ChangePasswordView.vue'
import DisplaySettingsView from '@/views/shared/DisplaySettingsView.vue'
import AdminView from '@/views/admin/AdminView.vue'
import AdminResetPasswordView from '@/views/admin/AdminResetPasswordView.vue'
import AdminSignupLogView from '@/views/admin/AdminSignupLogView.vue'
import AdminStatsView from '@/views/admin/AdminStatsView.vue'
import AdminMembersView from '@/views/admin/AdminMembersView.vue'
import AdminDataView from '@/views/admin/AdminDataView.vue'
import AdminTickerView from '@/views/admin/AdminTickerView.vue'
import AdminFeedbackView from '@/views/admin/AdminFeedbackView.vue'
import AdminAccessHistoryView from '@/views/admin/AdminAccessHistoryView.vue'
import AdminNoticesView from '@/views/admin/AdminNoticesView.vue'
import NoticesView from '@/views/shared/NoticesView.vue'
import PrivacyPolicyView from '@/views/shared/PrivacyPolicyView.vue'
import ResetPasswordView from '@/views/auth/ResetPasswordView.vue'
import CompleteEmailView from '@/views/auth/CompleteEmailView.vue'

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
      component: PrivacyPolicyView,
    },
    {
      path: '/reset-password',
      name: 'resetPassword',
      component: ResetPasswordView,
    },
    {
      path: '/completeEmail',
      name: 'completeEmail',
      component: CompleteEmailView,
    },
    {
      path: '/hub',
      name: 'hub',
      component: HubView,
      meta: { requiresAuth: true, label: '허브' },
    },
    ...budgetRoutes,
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
      path: '/admin/access-history',
      name: 'adminAccessHistory',
      component: AdminAccessHistoryView,
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
      path: '/admin/feedback',
      name: 'adminFeedback',
      component: AdminFeedbackView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/notices',
      name: 'adminNotices',
      component: AdminNoticesView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/goalSettings',
      name: 'goalSettings',
      component: GoalSettingsView,
      meta: { requiresAuth: true, label: '목표 설정' },
    },
    {
      path: '/feedback',
      name: 'feedback',
      component: FeedbackView,
      meta: { requiresAuth: true, label: '피드백' },
    },
    {
      path: '/change-password',
      name: 'changePassword',
      component: ChangePasswordView,
      meta: { requiresAuth: true, label: '비밀번호 변경' },
    },
    {
      path: '/display-settings',
      name: 'displaySettings',
      component: DisplaySettingsView,
      meta: { requiresAuth: true, label: '화면 설정' },
    },
    {
      path: '/release-notes',
      name: 'releaseNotes',
      component: ReleaseNotesView,
      meta: { requiresAuth: true, label: '개발자 노트' },
    },
    {
      path: '/notices',
      name: 'notices',
      component: NoticesView,
      meta: { requiresAuth: true, label: '공지사항' },
    },
    {
      path: '/',
      component: AssetLayout,
      meta: { requiresAuth: true, requiresGoal: true, module: 'asset' },
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardView,
          meta: { label: '홈' },
        },
        {
          path: 'portfolio',
          name: 'portfolio',
          component: PortfolioView,
          meta: { label: '자산' },
        },
        {
          path: 'transactions',
          name: 'transactions',
          component: TransactionView,
          meta: { label: '기록' },
        },
        {
          path: 'analysis',
          name: 'analysis',
          component: AnalysisView,
          meta: { label: '예측' },
        },
        {
          path: 'more',
          name: 'more',
          component: MoreView,
          meta: { label: '더보기' },
        },
        {
          path: 'portfolio-analysis',
          name: 'portfolioAnalysis',
          component: PortfolioAnalysisView,
          meta: { label: '포트폴리오 분석' },
        },
        {
          path: 'badges',
          name: 'badges',
          component: BadgesView,
          meta: { label: '뱃지' },
        },
        {
          path: 'fire-simulator',
          name: 'fireSimulator',
          component: FireSimulatorView,
          meta: { label: 'FIRE 시뮬레이터' },
        },
        {
          path: 'fire-history',
          name: 'fireHistory',
          component: FireHistoryView,
          meta: { label: 'FIRE 히스토리' },
        },
        {
          path: 'asset-growth',
          name: 'assetGrowth',
          component: AssetGrowthView,
          meta: { label: '자산 성장' },
        },
        {
          path: 'dividend-calendar',
          name: 'dividendCalendar',
          component: DividendCalendarView,
          meta: { label: '배당 캘린더' },
        },
        {
          path: 'etf-analysis',
          name: 'etfAnalysis',
          component: EtfAnalysisView,
          meta: { label: 'ETF 분석' },
        },
        {
          path: 'etf-backtest',
          name: 'etfBacktest',
          component: EtfBacktestView,
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

  if (isInitialNavigation) {
    isInitialNavigation = false
    if (to.path === '/dashboard' && session) {
      const lastModule = getLastModule()
      if (lastModule === 'budget') return '/budget'
    }
  }

  // 세션이 있는데 로그인 화면(/)으로 들어오면 마지막 사용 모듈로 보낸다 (LoginView 로그인 성공 후와 동일 규칙).
  // 안드로이드 앱(TWA) Start URL이 '/'라 앱을 열 때마다 로그인 폼이 떠서 로그아웃된 것처럼 보이던 문제 해결.
  // 로그아웃 플로우는 전부 signOut 완료 후 '/'로 이동하므로(세션 없음) 이 분기를 타지 않는다.
  if (to.path === '/' && session) {
    const lastModule = getLastModule()
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

  return true
})

// 마지막으로 사용한 모듈(자산관리/가계부) 기록 — 다음 로그인 시 자동 진입에 사용
router.afterEach((to) => {
  const module = to.meta.module
  if (module === 'asset' || module === 'budget') setLastModule(module)
})

// 목표 설정 저장 후 캐시 갱신용 export
export const invalidateGoalCache = () => {
  goalCheckedUserId = null
}

export default router
