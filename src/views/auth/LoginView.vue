<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { getErrorMessage } from '@/utils/errorMessage'

const router = useRouter()
const form = ref()

const email = ref('')
const password = ref('')
const showPassword = ref(false)

const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref<'success' | 'error' | 'warning'>('success')
const showMessage = (message: string, color: 'success' | 'error' | 'warning' = 'success') => {
  snackbarText.value = message
  snackbarColor.value = color
  snackbar.value = true
}

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

  const { error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
  })

  if (error) {
    showMessage(getErrorMessage(error.code), 'warning')
    return
  }

  showMessage('회원가입이 완료되었습니다. 이메일 인증 후 로그인해주세요.', 'success')
}

const signIn = async () => {
  const { valid } = await form.value.validate()

  if (!valid) return

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

  if (!user) {
    return
  }

  const [goalResult, assetResult] = await Promise.all([
    supabase.from('investment_goals').select('id').eq('user_id', user.id).maybeSingle(),

    supabase.from('asset_summary').select('id').eq('user_id', user.id).maybeSingle(),
  ])

  const hasGoal = !!goalResult.data
  const hasAsset = !!assetResult.data

  if (!hasGoal || !hasAsset) {
    router.push('/goalSettings')
    return
  }

  router.push('/dashboard')
}
</script>

<template>
  <v-container fluid class="login-page fill-height pa-4">
    <v-row justify="center" align="center" class="fill-height">
      <v-col cols="12" sm="10" md="6" lg="4" xl="3">
        <v-card class="pa-6" rounded="xl" elevation="10">
          <div class="text-center mb-6">
            <v-icon icon="mdi-chart-line" size="60" color="primary" class="mb-2" />

            <div class="text-h4 font-weight-bold">MY INVESTMENT</div>

            <div class="text-grey mt-2">나만의 투자 관리 플랫폼</div>
          </div>

          <v-form ref="form">
            <v-text-field
              v-model="email"
              label="이메일"
              type="email"
              :rules="emailRules"
              prepend-inner-icon="mdi-email-outline"
              variant="outlined"
              density="comfortable"
              class="mb-2"
            />

            <v-text-field
              v-model="password"
              label="비밀번호"
              :type="showPassword ? 'text' : 'password'"
              :rules="passwordRules"
              prepend-inner-icon="mdi-lock-outline"
              :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="showPassword = !showPassword"
              variant="outlined"
              density="comfortable"
            />
          </v-form>

          <v-btn color="success" size="large" block class="mt-4" @click="signIn"> 로그인 </v-btn>

          <v-btn variant="text" block class="mt-2" @click="signUp"> 회원가입 </v-btn>
        </v-card>
      </v-col>
    </v-row>
  </v-container>

  <v-snackbar
    v-model="snackbar"
    :color="snackbarColor"
    timeout="3000"
    location="top"
    rounded="lg"
    elevation="10"
  >
    {{ snackbarText }}
  </v-snackbar>
</template>

<style scoped>
.login-page {
  background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
}
</style>
