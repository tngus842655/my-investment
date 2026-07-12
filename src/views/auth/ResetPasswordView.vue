<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)

// 이메일의 재설정 링크를 통해 접속하면 supabase-js가 URL의 복구 토큰을 자동으로
// 읽어 세션을 만든다 (detectSessionInUrl 기본값 true). 세션이 없으면 링크가
// 만료됐거나 잘못된 접근이므로 폼 대신 안내만 보여준다.
const checkingSession = ref(true)
const sessionValid = ref(false)

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  sessionValid.value = !!session
  checkingSession.value = false
})

const confirmMismatch = () =>
  confirmPassword.value.length > 0 && newPassword.value !== confirmPassword.value

const isValid = () => {
  if (!newPassword.value || !confirmPassword.value) return false
  if (newPassword.value.length < 6) return false
  if (confirmMismatch()) return false
  return true
}

const submit = async () => {
  if (!isValid()) return
  loading.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword.value })
    if (error) throw error

    // 새 비밀번호로 다시 로그인하도록 복구 세션은 종료
    await supabase.auth.signOut()
    showMessage(t('resetPassword.success'), 'success')
    router.push('/')
  } catch (e: unknown) {
    showMessage(e instanceof Error ? e.message : t('resetPassword.failed'), 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="pa-4" style="max-width: 480px">
    <div class="mb-6">
      <div class="font-weight-bold">{{ $t('resetPassword.title') }}</div>
      <div class="text-medium-emphasis">{{ $t('resetPassword.subtitle') }}</div>
    </div>

    <template v-if="checkingSession">
      <div class="text-center py-8">
        <v-progress-circular indeterminate color="primary" />
      </div>
    </template>

    <template v-else-if="!sessionValid">
      <v-card class="glass-card pa-4 text-center">
        <v-icon size="32" color="warning" class="mb-2">mdi-link-off</v-icon>
        <div class="font-weight-medium mb-1">{{ $t('resetPassword.invalidLinkTitle') }}</div>
        <div class="text-medium-emphasis mb-4">{{ $t('resetPassword.invalidLinkDesc') }}</div>
        <v-btn color="primary" variant="tonal" @click="router.push('/')">
          {{ $t('resetPassword.backToLogin') }}
        </v-btn>
      </v-card>
    </template>

    <template v-else>
      <v-card class="glass-card pa-4 mb-4">
        <v-text-field
          v-model="newPassword"
          :label="$t('resetPassword.newPassword')"
          :type="showNew ? 'text' : 'password'"
          :append-inner-icon="showNew ? 'mdi-eye-off' : 'mdi-eye'"
          :hint="$t('resetPassword.minLengthHint')"
          persistent-hint
          maxlength="72"
          variant="outlined"
          density="comfortable"
          class="mb-2"
          @click:append-inner="showNew = !showNew"
        />
        <v-text-field
          v-model="confirmPassword"
          :label="$t('resetPassword.confirmPassword')"
          :type="showConfirm ? 'text' : 'password'"
          :append-inner-icon="showConfirm ? 'mdi-eye-off' : 'mdi-eye'"
          :error="confirmMismatch()"
          :error-messages="confirmMismatch() ? $t('resetPassword.mismatchError') : ''"
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
        {{ $t('resetPassword.submit') }}
      </v-btn>
    </template>
  </v-container>
</template>

<style scoped>
.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}
</style>
