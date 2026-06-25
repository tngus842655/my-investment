<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { getErrorMessage } from '@/utils/errorMessage'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
const form = ref()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)

const emailRules = [
  (v: string) => !!v || '이메일을 입력해주세요.',
  (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || '올바른 이메일 형식이 아닙니다.',
]

const passwordRules = [
  (v: string) => !!v || '비밀번호를 입력해주세요.',
  (v: string) => v.length >= 6 || '비밀번호는 6자 이상 입력해주세요.',
]

const signUp = async () => {
  const { valid } = await form.value.validate()
  if (!valid) return
  loading.value = true
  try {
    const { error } = await supabase.auth.signUp({ email: email.value, password: password.value })
    if (error) { showMessage(getErrorMessage(error.code), 'warning'); return }
    showMessage('회원가입이 완료되었습니다. 이메일 인증 후 로그인해주세요.', 'success')
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
    if (!user) return

    const [goalResult, assetResult] = await Promise.all([
      supabase.from('investment_goals').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('asset_summary').select('id').eq('user_id', user.id).maybeSingle(),
    ])

    if (!goalResult.data || !assetResult.data) { router.push('/goalSettings'); return }
    router.push('/dashboard')
  } finally {
    loading.value = false
  }
}

const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Enter') signIn() }
</script>

<template>
  <div class="login-wrap">
    <div class="login-inner">
      <!-- 브랜드 -->
      <div class="text-center mb-10">
        <video
          src="/icons/icon-rocket.mp4"
          class="brand-logo mx-auto mb-2"
          autoplay
          loop
          muted
          playsinline
        />
        <div class="brand-title">FIREPATH</div>
        <div class="brand-sub mt-2">Financial Independence, Retire Early</div>
      </div>

      <!-- 폼 카드 -->
      <div class="login-card">
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
            hide-details="auto"
            autocomplete="current-password"
            bg-color="transparent"
          />
        </v-form>

        <v-btn
          color="primary"
          size="large"
          rounded="lg"
          block
          elevation="0"
          :loading="loading"
          class="mt-6"
          style="font-weight: 700; letter-spacing: 0.03em"
          @click="signIn"
        >
          로그인
        </v-btn>

        <v-divider class="my-4" opacity="0.1" />

        <v-btn
          variant="text"
          block
          size="default"
          :disabled="loading"
          style="color: rgba(var(--v-theme-on-surface), 0.5)"
          @click="signUp"
        >
          계정이 없으신가요? <span style="color: rgb(var(--v-theme-primary)); margin-left: 4px">회원가입</span>
        </v-btn>
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

/* 브랜드 */
.brand-logo {
  width: 100px;
  height: 100px;
  object-fit: contain;
  display: block;
  mix-blend-mode: multiply;
}
:global(.v-theme--dark) .brand-logo {
  mix-blend-mode: normal;
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

/* 폼 카드 */
.login-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 24px;
  padding: 28px 24px;
}

.v-theme--dark .login-card {
  border-color: rgba(0, 212, 184, 0.12);
}
</style>
