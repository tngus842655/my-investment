<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { getErrorMessage } from '@/utils/errorMessage'
import { showMessage } from '@/composables/useSnackbar'
import { useDesignTokens } from '@/composables/useDesignTokens'

const router = useRouter()
const { themeId } = useDesignTokens()

const LOGO_MAIN: Partial<Record<string, string>> = {
  light:  '/icons/main/logo-main-light.png',
  dark:   '/icons/main/logo-main-dark.png',
  gold:   '/icons/main/logo-main-gold.png',
  nature: '/icons/main/logo-main-nature.png',
  space:  '/icons/main/logo-main-space.png',
}
const logoMain = computed(() => LOGO_MAIN[themeId.value] ?? null)
const form = ref()

const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const showPassword = ref(false)
const showPasswordConfirm = ref(false)
const loading = ref(false)

// 'login' | 'signup' | 'forgot'
const mode = ref<'login' | 'signup' | 'forgot'>('login')

const isLogin = computed(() => mode.value === 'login')
const isSignup = computed(() => mode.value === 'signup')
const isForgot = computed(() => mode.value === 'forgot')

const emailRules = [
  (v: string) => !!v || '이메일을 입력해주세요.',
  (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || '올바른 이메일 형식이 아닙니다.',
]

const passwordRules = [
  (v: string) => !!v || '비밀번호를 입력해주세요.',
  (v: string) => v.length >= 6 || '비밀번호는 6자 이상 입력해주세요.',
]

const passwordConfirmRules = [
  (v: string) => !!v || '비밀번호 확인을 입력해주세요.',
  (v: string) => v === password.value || '비밀번호가 일치하지 않습니다.',
]

const switchMode = (target: 'login' | 'signup' | 'forgot') => {
  mode.value = target
  password.value = ''
  passwordConfirm.value = ''
  showPassword.value = false
  showPasswordConfirm.value = false
  form.value?.resetValidation()
}

const signUp = async () => {
  const { valid } = await form.value.validate()
  if (!valid) return
  loading.value = true
  try {
    const { data, error } = await supabase.auth.signUp({ email: email.value, password: password.value })
    if (error) { showMessage(getErrorMessage(error.code), 'warning'); return }

    // 이메일 인증 OFF 상태에서 이미 가입된 이메일은 identities가 빈 배열로 반환됨
    if (!data.user?.identities || data.user.identities.length === 0) {
      showMessage('이미 가입된 이메일입니다.', 'warning')
      return
    }

    // SECURITY DEFINER RPC로 RLS 우회하여 signup_log 기록 (재가입 시 재활성화 처리 포함)
    const { error: logError } = await supabase.rpc('record_signup', { user_email: email.value })
    if (logError) { showMessage('회원가입 중 오류가 발생했습니다.', 'error'); return }
    showMessage('회원가입이 완료되었습니다. 로그인해주세요.', 'success')
    switchMode('login')
  } finally {
    loading.value = false
  }
}

const signIn = async () => {
  const { valid } = await form.value.validate()
  if (!valid) return
  loading.value = true
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
    if (error) { showMessage(getErrorMessage(error.code), 'warning'); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) { supabase.from('login_log').insert({ user_id: user.id, email: user.email }).then(() => {}) }
    if (!user) return

    const { data: goal } = await supabase.from('investment_goals').select('id').eq('user_id', user.id).maybeSingle()

    if (!goal) { router.push('/goalSettings'); return }
    router.push('/dashboard')
  } finally {
    loading.value = false
  }
}

const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Enter' && isLogin.value) signIn() }

// ── 홈 화면에 추가 안내 배너 (iOS / Android 전용) ──────────────
const A2HS_DISMISSED_KEY = 'fp-a2hs-dismissed'
const platform = ref<'ios' | 'android' | null>(null)
const showInstallBanner = ref(false)
const installPromptEvent = ref<Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> } | null>(null)

const detectPlatform = (): 'ios' | 'android' | null => {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return null
}

const dismissInstallBanner = () => {
  showInstallBanner.value = false
  localStorage.setItem(A2HS_DISMISSED_KEY, '1')
}

const installApp = async () => {
  if (!installPromptEvent.value) return
  await installPromptEvent.value.prompt()
  await installPromptEvent.value.userChoice
  installPromptEvent.value = null
  dismissInstallBanner()
}

const onBeforeInstallPrompt = (e: Event) => {
  e.preventDefault()
  installPromptEvent.value = e as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }
}

onMounted(() => {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  platform.value = detectPlatform()
  const dismissed = localStorage.getItem(A2HS_DISMISSED_KEY) === '1'
  showInstallBanner.value = !isStandalone && !dismissed && platform.value !== null

  if (platform.value === 'android') {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }
})

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
})
</script>

<template>
  <div class="login-wrap">
    <div class="login-inner">
      <!-- 브랜드 -->
      <div class="text-center mb-10">
        <img
          v-if="logoMain"
          :src="logoMain"
          class="brand-logo mx-auto mb-2"
          alt="FIREPATH"
        />
        <template v-if="!logoMain">
          <div class="brand-title">FIREPATH</div>
          <div class="brand-sub mt-2">Financial Independence, Retire Early</div>
        </template>
      </div>

      <!-- 홈 화면에 추가 안내 배너 -->
      <div v-if="showInstallBanner" class="install-banner mb-4">
        <button class="install-banner-close" aria-label="닫기" @click="dismissInstallBanner">
          <v-icon size="14">mdi-close</v-icon>
        </button>
        <div class="install-banner-title">홈 화면에 추가하고 앱처럼 사용해보세요</div>
        <template v-if="platform === 'ios'">
          <div class="install-banner-desc mt-1">
            Safari 하단 <b>공유(⬆)</b> 버튼을 누른 뒤 <b>‘홈 화면에 추가’</b>를 선택해주세요
          </div>
        </template>
        <template v-else-if="platform === 'android'">
          <div v-if="installPromptEvent" class="d-flex align-center justify-space-between mt-1" style="gap: 8px">
            <span class="install-banner-desc">한 번의 탭으로 설치할 수 있어요</span>
            <v-btn size="small" color="primary" variant="flat" rounded="lg" @click="installApp">추가</v-btn>
          </div>
          <div v-else class="install-banner-desc mt-1">
            브라우저 메뉴(⋮) → <b>‘홈 화면에 추가’</b>를 선택해주세요
          </div>
        </template>
      </div>

      <!-- 폼 카드 -->
      <div class="login-card">

        <!-- 비밀번호 찾기 안내 -->
        <template v-if="isForgot">
          <div class="forgot-wrap">
            <v-icon size="40" color="primary" class="mb-4">mdi-lock-question</v-icon>
            <div class="forgot-title">비밀번호를 잊으셨나요?</div>
            <div class="forgot-desc mt-3">
              아래 이메일로 문의해 주시면<br>빠르게 도와드리겠습니다.<br><br>
              <span style="color: rgb(var(--v-theme-on-surface)); font-weight: 600;">가입 시 등록한 이메일 주소</span>로<br>문의해 주셔야 처리가 가능합니다.
            </div>
            <a href="mailto:tngus842655@naver.com" class="forgot-email mt-4">
              tngus842655@naver.com
            </a>
          </div>
          <v-btn
            variant="text"
            block
            size="default"
            class="mt-6"
            style="color: rgba(var(--v-theme-on-surface), 0.5)"
            @click="switchMode('login')"
          >
            <v-icon start size="16">mdi-arrow-left</v-icon>
            로그인으로 돌아가기
          </v-btn>
        </template>

        <!-- 로그인 / 회원가입 폼 -->
        <template v-else>
          <v-form ref="form" @keydown="onKeydown">
            <div class="fp-label mb-2">이메일</div>
            <v-text-field
              v-model="email"
              type="email"
              :rules="emailRules"
              placeholder="example@email.com"
              variant="outlined"
              density="comfortable"
              class="mb-4"
              hide-details="auto"
              autocomplete="email"
              maxlength="254"
              bg-color="transparent"
            />
            <div class="fp-label mb-2">비밀번호</div>
            <v-text-field
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :rules="passwordRules"
              placeholder="6자 이상 입력"
              :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              @click:append-inner="showPassword = !showPassword"
              variant="outlined"
              density="comfortable"
              :class="isSignup ? 'mb-4' : ''"
              hide-details="auto"
              autocomplete="current-password"
              maxlength="72"
              bg-color="transparent"
            />

            <!-- 비밀번호 확인 (회원가입 시만) -->
            <template v-if="isSignup">
              <div class="fp-label mb-2 mt-0">비밀번호 확인</div>
              <v-text-field
                v-model="passwordConfirm"
                :type="showPasswordConfirm ? 'text' : 'password'"
                :rules="passwordConfirmRules"
                placeholder="비밀번호 재입력"
                :append-inner-icon="showPasswordConfirm ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                @click:append-inner="showPasswordConfirm = !showPasswordConfirm"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
                maxlength="72"
                bg-color="transparent"
              />
            </template>
          </v-form>

          <!-- 비밀번호 찾기 링크 (로그인 모드만) -->
          <div v-if="isLogin" class="text-right mt-2">
            <span class="forgot-link" @click="switchMode('forgot')">비밀번호를 잊으셨나요?</span>
          </div>

          <!-- 메인 버튼 -->
          <v-btn
            color="primary"
            size="large"
            rounded="lg"
            block
            elevation="0"
            :loading="loading"
            class="mt-6"
            style="font-weight: 700; letter-spacing: 0.03em"
            @click="isLogin ? signIn() : signUp()"
          >
            {{ isLogin ? '로그인' : '회원가입' }}
          </v-btn>

          <v-divider class="my-4" opacity="0.1" />

          <!-- 모드 전환 -->
          <v-btn
            variant="text"
            block
            size="default"
            :disabled="loading"
            style="color: rgba(var(--v-theme-on-surface), 0.5)"
            @click="switchMode(isLogin ? 'signup' : 'login')"
          >
            <template v-if="isLogin">
              계정이 없으신가요?
              <span style="color: rgb(var(--v-theme-primary)); margin-left: 4px">회원가입</span>
            </template>
            <template v-else>
              <v-icon start size="16">mdi-arrow-left</v-icon>
              로그인으로 돌아가기
            </template>
          </v-btn>
        </template>

      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

.login-inner {
  width: 100%;
  max-width: 380px;
}

.brand-logo {
  width: 180px;
  height: 180px;
  object-fit: contain;
  display: block;
}

.brand-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(0, 212, 184, 0.12);
  border: 1px solid rgba(0, 212, 184, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgb(var(--v-theme-on-surface));
}

.brand-sub {
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  letter-spacing: 0.02em;
}

.login-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 24px;
  padding: 28px 24px;
}


.install-banner {
  position: relative;
  background: rgba(0, 212, 184, 0.06);
  border: 1px solid rgba(0, 212, 184, 0.2);
  border-radius: 16px;
  padding: 14px 32px 14px 16px;
}

.install-banner-close {
  position: absolute;
  top: 10px;
  right: 10px;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.install-banner-title {
  font-size: 13px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.install-banner-desc {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  line-height: 1.5;
}

.forgot-link {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.forgot-link:hover {
  color: rgb(var(--v-theme-primary));
}

.forgot-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8px 0 4px;
}

.forgot-title {
  font-size: 18px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.forgot-desc {
  font-size: 14px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  line-height: 1.6;
}

.forgot-email {
  display: inline-block;
  font-size: 15px;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  border: 1px solid rgba(0, 212, 184, 0.3);
  border-radius: 10px;
  padding: 10px 20px;
  transition: background 0.2s;
}

.forgot-email:hover {
  background: rgba(0, 212, 184, 0.08);
}
</style>
