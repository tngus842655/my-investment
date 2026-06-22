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

// 엔터키로 로그인
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') signIn()
}
</script>

<template>
  <div class="login-bg fill-height d-flex align-center justify-center pa-4">
    <div style="width: 100%; max-width: 400px">
      <!-- 로고 영역 -->
      <div class="text-center mb-6">
        <div class="logo-icon mx-auto mb-3">
          <v-icon icon="mdi-chart-line" size="28" color="primary" />
        </div>
        <div class="text-h5 font-weight-bold">MY INVESTMENT</div>
        <div class="text-body-2 text-medium-emphasis mt-1">나만의 FIRE 목표 관리 플랫폼</div>
      </div>

      <!-- 로그인 카드 -->
      <v-card rounded="xl" elevation="0" border class="pa-2">
        <v-card-text class="pa-4">
          <v-form ref="form" @keydown="onKeydown">
            <div class="text-caption text-medium-emphasis font-weight-medium mb-1">이메일</div>
            <v-text-field
              v-model="email"
              type="email"
              :rules="emailRules"
              placeholder="example@email.com"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              hide-details="auto"
              autocomplete="email"
            />

            <div class="text-caption text-medium-emphasis font-weight-medium mb-1">비밀번호</div>
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
            />
          </v-form>
        </v-card-text>

        <v-card-actions class="px-4 pb-4 pt-0 flex-column ga-2">
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

          <v-divider class="w-100 my-1" />

          <v-btn variant="text" block size="default" :disabled="loading" @click="signUp">
            회원가입
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
  </div>
</template>

<style scoped>
.login-bg {
  min-height: 100vh;
  background-color: rgb(var(--v-theme-surface));
}

.logo-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  background: rgba(var(--v-theme-primary), 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
