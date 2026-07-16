<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import { useTheme } from 'vuetify'
import GlobalSnackbar from '@/components/common/GlobalSnackbar.vue'
import { useAppTheme } from '@/composables/useAppTheme'
import { useFontScale } from '@/composables/useFontScale'
import { supabase, OAUTH_LOGIN_PENDING_KEY, OAUTH_PWA_RETURN_KEY } from '@/services/supabase'
import { isAdminEmail } from '@/config/admin'
import { isStandaloneDisplay } from '@/utils/displayMode'

const theme = useTheme()
const { initTheme } = useAppTheme()
const { initFontScale } = useFontScale()

// ── iOS 홈 화면 앱(standalone) SNS 로그인 복귀 처리 ──────────────
// iOS는 standalone에서 외부 도메인(OAuth)으로 나가면 별도 인앱 브라우저(오버레이)를 띄우고,
// 로그인이 끝나도 앱이 오버레이 안에 뜬 채로 남는다. 오버레이와 홈 화면 앱은 localStorage를
// 공유하므로 (1) 오버레이에서는 로그인 완료 시 "✕를 눌러 앱으로 돌아가기" 안내를 띄우고,
// (2) 홈 화면 앱에서는 오버레이가 닫혀 화면이 다시 보일 때 세션을 이어받아 재시동한다.
const PWA_RETURN_MARKER_MAX_AGE_MS = 10 * 60 * 1000 // 취소 등으로 남은 오래된 표식은 무시
const showPwaReturnGuide = ref(false)

// SNS(OAuth) 로그인은 리다이렉트 복귀 후 LoginView를 거치지 않으므로 여기서 login_log를 기록한다.
// LoginView에서 심어둔 표식(sessionStorage)이 있을 때만 기록해, 탭 포커스 등으로
// SIGNED_IN 이벤트가 재발화해도 중복 기록되지 않는다. (비밀번호 로그인은 LoginView에서 기록)
// INITIAL_SESSION도 처리하는 이유: 홈 화면 앱이 오버레이의 세션을 이어받아 재시동하는 경우
// SIGNED_IN 없이 INITIAL_SESSION으로 로그인이 복원되기 때문 (표식 조건으로 중복은 방지된다).
supabase.auth.onAuthStateChange((event, session) => {
  if ((event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') || !session?.user) return

  // (1) 홈 화면 앱에서 시작한 OAuth가 오버레이(비 standalone)에서 완료된 경우 → 복귀 안내
  const pwaReturnStartedAt = Number(localStorage.getItem(OAUTH_PWA_RETURN_KEY) ?? 0)
  if (pwaReturnStartedAt && !isStandaloneDisplay()) {
    localStorage.removeItem(OAUTH_PWA_RETURN_KEY)
    if (Date.now() - pwaReturnStartedAt < PWA_RETURN_MARKER_MAX_AGE_MS) {
      showPwaReturnGuide.value = true
    }
  }

  if (!sessionStorage.getItem(OAUTH_LOGIN_PENDING_KEY)) return
  sessionStorage.removeItem(OAUTH_LOGIN_PENDING_KEY)
  const user = session.user
  // 관리자 로그인은 기록하지 않는다 (access_log도 관리자를 기록하지 않음 — router 가드)
  if (!isAdminEmail(user.email)) {
    supabase
      .from('login_log')
      .insert({ user_id: user.id, email: user.email })
      .then(() => {})
  }
  // 소셜 신규 가입도 signup_log에 남긴다. record_signup은 이메일 기준 멱등이라
  // 기존 회원(자동 연결 포함)은 no-op, 신규만 insert 된다. 이메일 없는 계정은
  // 이후 CompleteEmailView에서 이메일 등록 시 기록한다.
  // 관리자 이메일은 가입 통계·이력 대상이 아니므로 기록하지 않는다 (AdminStatsView도 관리자 제외).
  if (user.email && !isAdminEmail(user.email)) {
    supabase.rpc('record_signup', { user_email: user.email }).then(() => {})
  }
})

onMounted(() => {
  initTheme()
  initFontScale()

  // (2) 홈 화면 앱 쪽: 오버레이가 닫혀 화면이 다시 보이면, OAuth 진행 표식이 있을 때
  // 공유 localStorage의 세션을 확인해 로그인 상태로 재시동한다. 세션이 없으면(취소·실패)
  // LoginView가 재마운트되지 않아 잔존하는 표식을 여기서 정리한다.
  // iOS에서 visibilitychange가 누락되는 경우를 대비해 focus도 함께 듣는다 (핸들러는 멱등).
  if (isStandaloneDisplay()) {
    const resumeFromOAuthOverlay = async () => {
      if (document.visibilityState !== 'visible') return
      if (!sessionStorage.getItem(OAUTH_LOGIN_PENDING_KEY)) return
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        window.location.reload()
      } else {
        sessionStorage.removeItem(OAUTH_LOGIN_PENDING_KEY)
        localStorage.removeItem(OAUTH_PWA_RETURN_KEY)
      }
    }
    document.addEventListener('visibilitychange', resumeFromOAuthOverlay)
    window.addEventListener('focus', resumeFromOAuthOverlay)
  }
})
</script>

<template>
  <div class="app-bg" :class="theme.global.name.value">
    <RouterView />
    <GlobalSnackbar />

    <!-- iOS 홈 화면 앱에서 시작한 OAuth가 인앱 브라우저(오버레이)에서 완료된 경우의 복귀 안내 -->
    <div v-if="showPwaReturnGuide" class="pwa-return-guide">
      <div class="pwa-return-check">✓</div>
      <h2 class="pwa-return-title">{{ $t('auth.pwaReturnTitle') }}</h2>
      <p class="pwa-return-desc">{{ $t('auth.pwaReturnDesc') }}</p>
      <button type="button" class="pwa-return-dismiss" @click="showPwaReturnGuide = false">
        {{ $t('auth.pwaReturnDismiss') }}
      </button>
    </div>
  </div>
</template>

<style>
/* ── 배경 기본 ─────────────────────────────────────────────── */
.app-bg {
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  /* transition은 theme.css에서 선언 */
}

/* ── ☀️ Light — 깔끔한 화이트-블루 ─────────────────────────── */
.app-bg.light {
  background: linear-gradient(160deg, #F4F8FC 0%, #ECF3FB 100%);
}

/* ── 🌙 Dark — 절제된 딥 네이비 ────────────────────────────── */
.app-bg.dark {
  background: linear-gradient(160deg, #0D1520 0%, #091018 100%);
}

/* ── 🌿 Nature — 연한 그린 그라데이션 ──────────────────────── */
.app-bg.nature {
  background: linear-gradient(160deg, #EFF7F2 0%, #E5F2EA 60%, #EAF5EE 100%);
}

/* ── 🚀 Space — 은은한 Nebula (성운) 느낌 ─────────────────── */
.app-bg.space {
  background:
    radial-gradient(ellipse at 15% 20%, rgba(0, 212, 184, 0.05) 0%, transparent 45%),
    radial-gradient(ellipse at 85% 75%, rgba(124, 111, 205, 0.07) 0%, transparent 45%),
    radial-gradient(ellipse at 50% 50%, rgba(0, 80, 140, 0.04) 0%, transparent 65%),
    #080F1E;
}

/* ── 👑 Gold — 극도로 절제된 다크, 상단 아주 은은한 warm glow */
.app-bg.gold {
  background:
    radial-gradient(ellipse at 50% -10%, rgba(201, 153, 58, 0.05) 0%, transparent 50%),
    linear-gradient(170deg, #131109 0%, #0E0C07 100%);
}

/* ── iOS 홈 화면 앱 OAuth 복귀 안내 (인앱 브라우저 오버레이 전용) ── */
.pwa-return-guide {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
  background: linear-gradient(160deg, #0e8a82 0%, #0a6660 100%);
  color: #fff;
}

.pwa-return-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 20px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  font-size: 32px;
}

.pwa-return-title {
  font-size: 24px;
  font-weight: 700;
}

.pwa-return-desc {
  margin-top: 12px;
  font-size: 16px;
  line-height: 1.6;
  opacity: 0.92;
  white-space: pre-line;
}

.pwa-return-dismiss {
  margin-top: 32px;
  padding: 10px 24px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 14px;
}
</style>
