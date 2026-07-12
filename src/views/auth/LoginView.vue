<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/supabase'
import { getErrorMessageKey } from '@/utils/errorMessage'
import { showMessage } from '@/composables/useSnackbar'
import { useDesignTokens } from '@/composables/useDesignTokens'
import { useLocale } from '@/composables/useLocale'
import { getLastModule } from '@/utils/lastModule'
import type { SupportedLocale } from '@/plugins/i18n'

const router = useRouter()
const { t } = useI18n()
const { themeId } = useDesignTokens()

// 로그인 전에도 언어를 바꿀 수 있게 한다. setLocale은 미로그인 시 DB 저장을 건너뛰고
// 로컬스토리지에만 기록하며, 이후 목표 최초 저장 시 investment_goals.locale로 이어진다.
const { locale, setLocale } = useLocale()
const languageOptions: { value: SupportedLocale; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
]

// 부팅 시 브라우저 언어로 자동 감지된 것과 구분하기 위해, 토글을 실제로 클릭했을 때만 표시.
// true인 경우에만 로그인 성공 후 investment_goals.locale에 반영해 기존 DB 값을 덮어쓴다
// (기기 단위 자동감지 값이 다른 기기에서 저장한 언어 설정을 임의로 덮어쓰지 않도록 하기 위함).
let localeChangedManually = false
const onLanguageClick = (loc: SupportedLocale) => {
  localeChangedManually = true
  setLocale(loc)
}

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
  (v: string) => !!v || t('auth.rules.emailRequired'),
  (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || t('auth.rules.emailInvalid'),
]

const passwordRules = [
  (v: string) => !!v || t('auth.rules.passwordRequired'),
  (v: string) => v.length >= 6 || t('auth.rules.passwordMin'),
]

const passwordConfirmRules = [
  (v: string) => !!v || t('auth.rules.passwordConfirmRequired'),
  (v: string) => v === password.value || t('auth.rules.passwordMismatch'),
]

const switchMode = (target: 'login' | 'signup' | 'forgot') => {
  mode.value = target
  password.value = ''
  passwordConfirm.value = ''
  showPassword.value = false
  showPasswordConfirm.value = false
  forgotEmail.value = ''
  forgotSent.value = false
  form.value?.resetValidation()
}

// ── 비밀번호 재설정 요청 ────────────────────────────
const forgotEmail = ref('')
const forgotSent = ref(false)
const forgotLoading = ref(false)
const forgotFormRef = ref()

const sendResetEmail = async () => {
  const { valid } = await forgotFormRef.value.validate()
  if (!valid) return
  forgotLoading.value = true
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.value, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { showMessage(t(getErrorMessageKey(error.code)), 'warning'); return }
    forgotSent.value = true
  } finally {
    forgotLoading.value = false
  }
}

const signUp = async () => {
  const { valid } = await form.value.validate()
  if (!valid) return
  loading.value = true
  try {
    const { data, error } = await supabase.auth.signUp({ email: email.value, password: password.value })
    if (error) { showMessage(t(getErrorMessageKey(error.code)), 'warning'); return }

    // 이미 가입된 이메일로 재시도하면 에러 없이 identities가 빈 배열로 반환됨 (Supabase의 사용자 열거 방지 동작)
    if (!data.user?.identities || data.user.identities.length === 0) {
      showMessage(t('auth.alreadyRegistered'), 'warning')
      return
    }

    // SECURITY DEFINER RPC로 RLS 우회하여 signup_log 기록 (재가입 시 재활성화 처리 포함)
    const { error: logError } = await supabase.rpc('record_signup', { user_email: email.value })
    if (logError) { showMessage(t('auth.signupError'), 'error'); return }
    showMessage(t('auth.signupEmailSent'), 'success')
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
    if (error) { showMessage(t(getErrorMessageKey(error.code)), 'warning'); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) { supabase.from('login_log').insert({ user_id: user.id, email: user.email }).then(() => {}) }
    if (!user) return

    // 로그인 화면에서 언어를 직접 바꾼 경우에만 계정 DB에 반영 — 이후 ensureGoals()가
    // DB 값을 로컬보다 우선 적용하므로, 여기서 먼저 써두지 않으면 로그인 직후 이전 DB 값으로 되돌아간다.
    if (localeChangedManually) {
      await supabase.from('investment_goals').update({ locale: locale.value }).eq('user_id', user.id)
    }

    const lastModule = getLastModule()

    if (lastModule === 'budget') {
      router.push('/budget')
      return
    }
    if (lastModule === null) {
      router.push('/hub')
      return
    }

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
      <!-- 언어 선택 (로그인 전 전환) -->
      <div class="lang-switch mb-2">
        <button
          v-for="opt in languageOptions"
          :key="opt.value"
          class="lang-btn"
          :class="{ 'lang-btn--active': locale === opt.value }"
          @click="onLanguageClick(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>

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
        <button class="install-banner-close" :aria-label="$t('auth.close')" @click="dismissInstallBanner">
          <v-icon size="14">mdi-close</v-icon>
        </button>
        <div class="install-banner-title">{{ $t('auth.installTitle') }}</div>
        <template v-if="platform === 'ios'">
          <div class="install-banner-desc mt-1">
            {{ $t('auth.installIosDesc') }}
          </div>
        </template>
        <template v-else-if="platform === 'android'">
          <div v-if="installPromptEvent" class="d-flex align-center justify-space-between mt-1" style="gap: 8px">
            <span class="install-banner-desc">{{ $t('auth.installAndroidOneTap') }}</span>
            <v-btn size="small" color="primary" variant="flat" rounded="lg" @click="installApp">{{ $t('auth.installAdd') }}</v-btn>
          </div>
          <div v-else class="install-banner-desc mt-1">
            {{ $t('auth.installAndroidMenuDesc') }}
          </div>
        </template>
      </div>

      <!-- 폼 카드 -->
      <div class="login-card">

        <!-- 비밀번호 찾기 -->
        <template v-if="isForgot">
          <template v-if="!forgotSent">
            <div class="forgot-wrap">
              <v-icon size="40" color="primary" class="mb-4">mdi-lock-question</v-icon>
              <div class="forgot-title">{{ $t('auth.forgotTitle') }}</div>
              <div class="forgot-desc mt-3">{{ $t('auth.forgotDesc') }}</div>
            </div>
            <v-form ref="forgotFormRef" class="mt-4" @keydown.enter="sendResetEmail">
              <v-text-field
                v-model="forgotEmail"
                type="email"
                :rules="emailRules"
                :placeholder="$t('auth.emailPlaceholder')"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
                autocomplete="email"
                maxlength="254"
                bg-color="transparent"
              />
            </v-form>
            <v-btn
              color="primary"
              size="large"
              rounded="lg"
              block
              elevation="0"
              :loading="forgotLoading"
              class="mt-4"
              style="font-weight: 700; letter-spacing: 0.03em"
              @click="sendResetEmail"
            >
              {{ $t('auth.sendResetLink') }}
            </v-btn>
          </template>
          <template v-else>
            <div class="forgot-wrap">
              <v-icon size="40" color="success" class="mb-4">mdi-email-check-outline</v-icon>
              <div class="forgot-title">{{ $t('auth.resetEmailSentTitle') }}</div>
              <div class="forgot-desc mt-3">{{ $t('auth.resetEmailSentDesc', { email: forgotEmail }) }}</div>
            </div>
          </template>

          <v-divider class="my-4" opacity="0.1" />
          <div class="forgot-desc-note text-center">{{ $t('auth.forgotEmailNote') }}</div>
          <div class="text-center mt-2">
            <a href="mailto:tngus842655@gmail.com" class="forgot-email">
              tngus842655@gmail.com
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
            {{ $t('auth.backToLogin') }}
          </v-btn>
        </template>

        <!-- 로그인 / 회원가입 폼 -->
        <template v-else>
          <v-form ref="form" @keydown="onKeydown">
            <div class="fp-label mb-2">{{ $t('auth.emailLabel') }}</div>
            <v-text-field
              v-model="email"
              type="email"
              :rules="emailRules"
              :placeholder="$t('auth.emailPlaceholder')"
              variant="outlined"
              density="comfortable"
              class="mb-4"
              hide-details="auto"
              autocomplete="email"
              maxlength="254"
              bg-color="transparent"
            />
            <div class="fp-label mb-2">{{ $t('auth.passwordLabel') }}</div>
            <v-text-field
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :rules="passwordRules"
              :placeholder="$t('auth.passwordPlaceholder')"
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
              <div class="fp-label mb-2 mt-0">{{ $t('auth.passwordConfirmLabel') }}</div>
              <v-text-field
                v-model="passwordConfirm"
                :type="showPasswordConfirm ? 'text' : 'password'"
                :rules="passwordConfirmRules"
                :placeholder="$t('auth.passwordConfirmPlaceholder')"
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
            <span class="forgot-link" @click="switchMode('forgot')">{{ $t('auth.forgotLink') }}</span>
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
            {{ isLogin ? $t('auth.login') : $t('auth.signup') }}
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
              {{ $t('auth.noAccount') }}
              <span style="color: rgb(var(--v-theme-primary)); margin-left: 4px">{{ $t('auth.signupLink') }}</span>
            </template>
            <template v-else>
              <v-icon start size="16">mdi-arrow-left</v-icon>
              {{ $t('auth.backToLogin') }}
            </template>
          </v-btn>
        </template>

      </div>

      <div class="text-center mt-4">
        <RouterLink to="/privacy-policy" class="privacy-link">{{ $t('auth.privacyPolicy') }}</RouterLink>
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

.lang-switch {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.lang-btn {
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.lang-btn--active {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.privacy-link {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
  text-decoration: none;
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
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgb(var(--v-theme-on-surface));
}

.brand-sub {
  font-size: 0.8125rem;
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
  background: transparent;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.4);
  transition: opacity 0.15s;
}
.install-banner-close:active {
  opacity: 0.6;
}

.install-banner-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.install-banner-desc {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  line-height: 1.5;
}

.forgot-link {
  font-size: 0.75rem;
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
  font-size: 1.125rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.forgot-desc {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  line-height: 1.6;
}

.forgot-desc-note {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
}

.forgot-email {
  display: inline-block;
  font-size: 0.9375rem;
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
