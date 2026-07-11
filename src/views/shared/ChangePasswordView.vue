<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()

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
    if (!user?.email) throw new Error(t('changePassword.errors.cannotVerifyLogin'))

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword.value,
    })
    if (signInError) {
      showMessage(t('changePassword.errors.wrongCurrent'), 'error')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword.value })
    if (error) {
      if (error.message.includes('different from the old password') || error.status === 422) {
        showMessage(t('changePassword.errors.samePasswordNotAllowed'), 'error')
        return
      }
      throw error
    }

    showMessage(t('changePassword.errors.success'), 'success')
    router.back()
  } catch (e: unknown) {
    showMessage(e instanceof Error ? e.message : t('changePassword.errors.failed'), 'error')
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
      <div class="font-weight-bold">{{ $t('changePassword.title') }}</div>
    </div>

    <v-card class="glass-card pa-4 mb-4">
      <v-text-field
        v-model="currentPassword"
        :label="$t('changePassword.currentPassword')"
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
        :label="$t('changePassword.newPassword')"
        :type="showNew ? 'text' : 'password'"
        :append-inner-icon="showNew ? 'mdi-eye-off' : 'mdi-eye'"
        :error="isSameAsCurrent()"
        :error-messages="isSameAsCurrent() ? $t('changePassword.sameAsCurrentError') : ''"
        :hint="$t('changePassword.minLengthHint')"
        :persistent-hint="!isSameAsCurrent()"
        maxlength="72"
        variant="outlined"
        density="comfortable"
        class="mb-2"
        @click:append-inner="showNew = !showNew"
      />
      <v-text-field
        v-model="confirmPassword"
        :label="$t('changePassword.confirmPassword')"
        :type="showConfirm ? 'text' : 'password'"
        :append-inner-icon="showConfirm ? 'mdi-eye-off' : 'mdi-eye'"
        :error="confirmMismatch()"
        :error-messages="confirmMismatch() ? $t('changePassword.mismatchError') : ''"
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
      {{ $t('changePassword.submit') }}
    </v-btn>
  </v-container>
</template>
