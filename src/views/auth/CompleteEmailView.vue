<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
const { t } = useI18n()

const form = ref()
const email = ref('')
const loading = ref(false)
const sent = ref(false) // 확인 메일 발송 완료 상태
const conflict = ref(false) // 이미 다른 계정이 사용 중인 이메일

const emailRules = [
  (v: string) => !!v || t('auth.rules.emailRequired'),
  (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || t('auth.rules.emailInvalid'),
]

const submit = async () => {
  conflict.value = false
  const { valid } = await form.value.validate()
  if (!valid) return
  loading.value = true
  try {
    const { error } = await supabase.auth.updateUser(
      { email: email.value },
      { emailRedirectTo: `${window.location.origin}/` },
    )
    if (error) {
      // 이미 다른 계정이 쓰는 이메일이면 자동 연결이 불가능하므로 기존 로그인 방식으로 안내
      if (error.code === 'email_exists' || /registered|already/i.test(error.message)) {
        conflict.value = true
      } else {
        showMessage(t('auth.completeEmail.error'), 'error')
      }
      return
    }
    // 이메일 확인이 꺼진 환경에서는 즉시 반영되므로, 반영됐으면 바로 진입
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      router.push('/hub')
      return
    }
    sent.value = true
  } finally {
    loading.value = false
  }
}

const recheck = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) router.push('/hub')
  else showMessage(t('auth.completeEmail.notYet'), 'warning')
}

const logout = async () => {
  await supabase.auth.signOut()
  router.push('/')
}
</script>

<template>
  <div class="complete-wrap">
    <div class="complete-card fp-card">
      <!-- 확인 메일 발송 완료 -->
      <template v-if="sent">
        <div class="complete-icon">
          <v-icon size="40" color="primary">mdi-email-check-outline</v-icon>
        </div>
        <div class="complete-title">{{ $t('auth.completeEmail.sentTitle') }}</div>
        <div class="complete-desc">{{ $t('auth.completeEmail.sentDesc') }}</div>
        <v-btn color="primary" size="large" rounded="lg" block elevation="0" class="mt-6" style="font-weight: 700" @click="recheck">
          {{ $t('auth.completeEmail.recheck') }}
        </v-btn>
        <v-btn variant="text" block size="default" class="mt-2" style="color: rgba(var(--v-theme-on-surface), 0.5)" @click="logout">
          {{ $t('auth.completeEmail.logout') }}
        </v-btn>
      </template>

      <!-- 이메일 입력 -->
      <template v-else>
        <div class="complete-title">{{ $t('auth.completeEmail.title') }}</div>
        <div class="complete-desc">{{ $t('auth.completeEmail.desc') }}</div>

        <v-alert v-if="conflict" type="warning" variant="tonal" density="comfortable" rounded="lg" class="mt-4">
          {{ $t('auth.completeEmail.conflictDesc') }}
        </v-alert>

        <v-form ref="form" class="mt-4" @keydown.enter.prevent="submit">
          <v-text-field
            v-model="email"
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

        <v-btn v-if="conflict" color="primary" size="large" rounded="lg" block elevation="0" class="mt-4" style="font-weight: 700" @click="logout">
          {{ $t('auth.completeEmail.logout') }}
        </v-btn>
        <template v-else>
          <v-btn color="primary" size="large" rounded="lg" block elevation="0" :loading="loading" class="mt-4" style="font-weight: 700" @click="submit">
            {{ $t('auth.completeEmail.submit') }}
          </v-btn>

          <v-divider class="my-4" opacity="0.1" />

          <div class="complete-existing">{{ $t('auth.completeEmail.existingHint') }}</div>
          <v-btn variant="text" block size="default" :disabled="loading" class="mt-1" style="color: rgb(var(--v-theme-primary)); font-weight: 600" @click="logout">
            {{ $t('auth.completeEmail.logout') }}
          </v-btn>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.complete-wrap {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.complete-card {
  width: 100%;
  max-width: 400px;
  padding: 32px 28px;
  text-align: center;
}

.complete-icon {
  margin-bottom: 12px;
}

.complete-title {
  font-size: 1.375rem;
  font-weight: 800;
  color: rgb(var(--v-theme-on-surface));
}

.complete-desc {
  margin-top: 8px;
  font-size: 0.875rem;
  line-height: 1.6;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.complete-existing {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
</style>
