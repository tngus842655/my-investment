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
    const { error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
    })

    if (error) {
      showMessage(getErrorMessage(error.code), 'warning')
      return
    }

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
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (error) {
      showMessage(getErrorMessage(error.code), 'warning')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const [goalResult, assetResult] = await Promise.all([
      supabase.from('investment_goals').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('asset_summary').select('id').eq('user_id', user.id).maybeSingle(),
    ])

    if (!goalResult.data || !assetResult.data) {
      router.push('/goalSettings')
      return
    }

    router.push('/dashboard')
  } finally {
    loading.value = false
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') signIn()
}
</script>

<template>
  <div class="fill-height d-flex align-center justify-center pa-4">
    <div style="width: 100%; max-width: 400px">
      <!-- 로고 -->
      <div class="text-center mb-8">
        <div class="logo-icon mx-auto mb-3">
          <v-icon icon="mdi-chart-line" size="26" color="primary" />
        </div>
        <div class="text-h5 font-weight-bold text-white">MY INVESTMENT</div>
        <div class="text-body-2 mt-1" style="color: rgba(255, 255, 255, 0.7)">
          나만의 FIRE 목표 관리 플랫폼
        </div>
      </div>

      <!-- 로그인 카드 -->
      <div class="glass-card pa-6">
        <v-form ref="form" @keydown="onKeydown">
          <div class="field-label mb-1">이메일</div>
          <v-text-field
            v-model="email"
            type="email"
            :rules="emailRules"
            placeholder="example@email.com"
            variant="outlined"
            density="comfortable"
            class="mb-3 glass-field"
            hide-details="auto"
            autocomplete="email"
          />

          <div class="field-label mb-1">비밀번호</div>
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
            class="glass-field"
          />
        </v-form>

        <div class="mt-5 d-flex flex-column ga-2">
          <v-btn
            color="primary"
            size="large"
            rounded="lg"
            block
            elevation="0"
            :loading="loading"
            @click="signIn"
          >
            로그인
          </v-btn>

          <v-divider class="my-1" style="border-color: rgba(255, 255, 255, 0.2)" />

          <v-btn
            variant="text"
            block
            size="default"
            :disabled="loading"
            style="color: rgba(255, 255, 255, 0.75)"
            @click="signUp"
          >
            회원가입
          </v-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.logo-icon {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.glass-card {
  background: rgb(var(--v-theme-card-bg, 255 255 255 / 0.72));
  background: v-bind("'var(--v-theme-card-bg, rgba(255,255,255,0.72))'");
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 20px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.dark .glass-card {
  background: rgba(17, 46, 45, 0.82);
  border-color: rgba(79, 200, 194, 0.18);
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
