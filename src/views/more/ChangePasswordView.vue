<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const showCurrent = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)

const isSameAsCurrent = () =>
  currentPassword.value.length > 0 && newPassword.value.length > 0 && newPassword.value === currentPassword.value

const confirmMismatch = () =>
  confirmPassword.value.length > 0 && newPassword.value !== confirmPassword.value

const isValid = () => {
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) return false
  if (newPassword.value.length < 6) return false
  if (isSameAsCurrent()) return false
  if (confirmMismatch()) return false
  return true
}

const submit = async () => {
  if (!isValid()) return
  loading.value = true
  try {
    // 현재 비밀번호 확인: 재로그인으로 검증
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) throw new Error('로그인 정보를 확인할 수 없습니다.')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword.value,
    })
    if (signInError) {
      showMessage('현재 비밀번호가 올바르지 않습니다.', 'error')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword.value })
    if (error) {
      if (error.message.includes('different from the old password') || error.status === 422) {
        showMessage('현재 비밀번호와 동일한 비밀번호는 사용할 수 없습니다.', 'error')
        return
      }
      throw error
    }

    showMessage('비밀번호가 변경되었습니다.', 'success')
    router.back()
  } catch (e: unknown) {
    showMessage(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="pa-4" style="max-width: 480px">
    <div class="d-flex align-center ga-2 mb-6">
      <v-btn icon variant="text" size="small" @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="font-weight-bold">비밀번호 변경</div>
    </div>

    <v-card class="glass-card pa-4 mb-4">
      <v-text-field
        v-model="currentPassword"
        label="현재 비밀번호"
        :type="showCurrent ? 'text' : 'password'"
        :append-inner-icon="showCurrent ? 'mdi-eye-off' : 'mdi-eye'"
        maxlength="72"
        variant="outlined"
        density="comfortable"
        class="mb-2"
        @click:append-inner="showCurrent = !showCurrent"
      />
      <v-text-field
        v-model="newPassword"
        label="새 비밀번호"
        :type="showNew ? 'text' : 'password'"
        :append-inner-icon="showNew ? 'mdi-eye-off' : 'mdi-eye'"
        :error="isSameAsCurrent()"
        :error-messages="isSameAsCurrent() ? '현재 비밀번호와 동일합니다.' : ''"
        hint="6자 이상 입력해 주세요"
        :persistent-hint="!isSameAsCurrent()"
        maxlength="72"
        variant="outlined"
        density="comfortable"
        class="mb-2"
        @click:append-inner="showNew = !showNew"
      />
      <v-text-field
        v-model="confirmPassword"
        label="새 비밀번호 확인"
        :type="showConfirm ? 'text' : 'password'"
        :append-inner-icon="showConfirm ? 'mdi-eye-off' : 'mdi-eye'"
        :error="confirmMismatch()"
        :error-messages="confirmMismatch() ? '비밀번호가 일치하지 않습니다.' : ''"
        maxlength="72"
        variant="outlined"
        density="comfortable"
        @click:append-inner="showConfirm = !showConfirm"
      />
    </v-card>

    <v-btn
      block
      color="primary"
      size="large"
      :loading="loading"
      :disabled="!isValid()"
      @click="submit"
    >
      변경하기
    </v-btn>
  </v-container>
</template>
