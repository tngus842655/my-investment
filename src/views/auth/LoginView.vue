<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { getErrorMessage } from '@/utils/errorMessage'

const router = useRouter()

const email = ref('')
const password = ref('')

const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref<'success' | 'error' | 'warning'>('success')
const showMessage = (message: string, color: 'success' | 'error' | 'warning' = 'success') => {
  snackbarText.value = message
  snackbarColor.value = color
  snackbar.value = true
}

const signUp = async () => {
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
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  if (error) {
    showMessage(getErrorMessage(error.code), 'warning')
    return
  }

  router.push('/dashboard')
}
</script>

<template>
  <v-container class="fill-height">
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card>
          <v-card-title class="text-h5 text-center"> MY INVESTMENT </v-card-title>

          <v-card-text>
            <v-text-field v-model="email" label="이메일" type="email" />

            <v-text-field v-model="password" label="비밀번호" type="password" />
          </v-card-text>

          <v-card-actions>
            <v-btn color="primary" block @click="signIn"> 로그인 </v-btn>
          </v-card-actions>

          <v-card-actions>
            <v-btn variant="outlined" block @click="signUp"> 회원가입 </v-btn>
          </v-card-actions>
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
