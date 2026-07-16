<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useTheme } from 'vuetify'
import GlobalSnackbar from '@/components/common/GlobalSnackbar.vue'
import { useAppTheme } from '@/composables/useAppTheme'
import { useFontScale } from '@/composables/useFontScale'
import { supabase, OAUTH_LOGIN_PENDING_KEY } from '@/services/supabase'

const theme = useTheme()
const { initTheme } = useAppTheme()
const { initFontScale } = useFontScale()

// SNS(OAuth) 로그인은 리다이렉트 복귀 후 LoginView를 거치지 않으므로 여기서 login_log를 기록한다.
// LoginView에서 심어둔 표식(sessionStorage)이 있을 때만 기록해, 탭 포커스 등으로
// SIGNED_IN 이벤트가 재발화해도 중복 기록되지 않는다. (비밀번호 로그인은 LoginView에서 기록)
supabase.auth.onAuthStateChange((event, session) => {
  if (event !== 'SIGNED_IN' || !session?.user) return
  if (!sessionStorage.getItem(OAUTH_LOGIN_PENDING_KEY)) return
  sessionStorage.removeItem(OAUTH_LOGIN_PENDING_KEY)
  const user = session.user
  supabase
    .from('login_log')
    .insert({ user_id: user.id, email: user.email })
    .then(() => {})
  // 소셜 신규 가입도 signup_log에 남긴다. record_signup은 이메일 기준 멱등이라
  // 기존 회원(자동 연결 포함)은 no-op, 신규만 insert 된다. 이메일 없는 계정은
  // 이후 CompleteEmailView에서 이메일 등록 시 기록한다.
  if (user.email) {
    supabase.rpc('record_signup', { user_email: user.email }).then(() => {})
  }
})

onMounted(() => {
  initTheme()
  initFontScale()
})
</script>

<template>
  <div class="app-bg" :class="theme.global.name.value">
    <RouterView />
    <GlobalSnackbar />
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
</style>
