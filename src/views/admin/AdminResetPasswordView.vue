<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { ADMIN_EMAIL } from '@/config/admin'
const router = useRouter()
const loading = ref(true)
const isAdmin = ref(false)

const resetForm = ref()
const resetEmail = ref('')
const resetPassword = ref('')
const resetPasswordConfirm = ref('')
const showResetPassword = ref(false)
const showResetPasswordConfirm = ref(false)
const resetLoading = ref(false)

const resetPasswordRules = [
  (v: string) => !!v || '새 비밀번호를 입력해주세요.',
  (v: string) => v.length >= 6 || '6자 이상 입력해주세요.',
]
const resetPasswordConfirmRules = [
  (v: string) => !!v || '비밀번호 확인을 입력해주세요.',
  (v: string) => v === resetPassword.value || '비밀번호가 일치하지 않습니다.',
]

const executeResetPassword = async () => {
  const { valid } = await resetForm.value.validate()
  if (!valid) return
  resetLoading.value = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: resetEmail.value, newPassword: resetPassword.value }),
      },
    )
    const json = await res.json().catch(() => ({ error: res.statusText }))
    if (!res.ok) { showMessage(json.error ?? '오류가 발생했습니다.', 'error'); return }
    showMessage(`${resetEmail.value} 비밀번호가 변경되었습니다.`, 'success')
    resetEmail.value = ''
    resetPassword.value = ''
    resetPasswordConfirm.value = ''
    resetForm.value.resetValidation()
  } finally {
    resetLoading.value = false
  }
}

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    router.replace('/dashboard')
    return
  }
  isAdmin.value = true
  loading.value = false
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 480px">
    <!-- 헤더 -->
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="text-h5 font-weight-bold">비밀번호 재설정</div>
        <div class="text-body-2 text-medium-emphasis">회원 임시 비밀번호 변경</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="card" class="rounded-xl" />
    </template>

    <template v-else-if="isAdmin">
      <div class="glass-card pa-5">
        <v-form ref="resetForm">
          <div class="fp-label mb-2">회원 이메일</div>
          <v-text-field
            v-model="resetEmail"
            type="email"
            :rules="[(v: string) => !!v || '이메일을 입력해주세요.', (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || '올바른 이메일 형식이 아닙니다.']"
            placeholder="변경할 회원 이메일"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            autocomplete="email"
            class="mb-4"
            bg-color="transparent"
          />
          <div class="fp-label mb-2">새 비밀번호</div>
          <v-text-field
            v-model="resetPassword"
            :type="showResetPassword ? 'text' : 'password'"
            :rules="resetPasswordRules"
            placeholder="6자 이상"
            :append-inner-icon="showResetPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            @click:append-inner="showResetPassword = !showResetPassword"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            autocomplete="new-password"
            class="mb-4"
            bg-color="transparent"
          />
          <div class="fp-label mb-2">새 비밀번호 확인</div>
          <v-text-field
            v-model="resetPasswordConfirm"
            :type="showResetPasswordConfirm ? 'text' : 'password'"
            :rules="resetPasswordConfirmRules"
            placeholder="비밀번호 재입력"
            :append-inner-icon="showResetPasswordConfirm ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            @click:append-inner="showResetPasswordConfirm = !showResetPasswordConfirm"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            autocomplete="new-password"
            class="mb-6"
            bg-color="transparent"
          />
          <v-btn
            color="primary"
            variant="flat"
            rounded="lg"
            block
            size="large"
            :loading="resetLoading"
            style="font-weight: 700"
            @click="executeResetPassword"
          >
            비밀번호 변경
          </v-btn>
        </v-form>
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.back-btn {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.back-btn:active { opacity: 0.6; }

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}
</style>
