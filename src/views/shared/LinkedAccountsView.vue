<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import type { UserIdentity } from '@supabase/supabase-js'

const router = useRouter()
const { t } = useI18n()

type ManagedProvider = 'google' | 'kakao'
const MANAGED: { provider: ManagedProvider; label: string; icon: string }[] = [
  { provider: 'google', label: 'Google', icon: 'mdi-google' },
  { provider: 'kakao', label: '카카오', icon: 'mdi-chat' },
]

const identities = ref<UserIdentity[]>([])
const email = ref<string | null>(null)
const loading = ref(true)
const busy = ref<ManagedProvider | null>(null)

const load = async () => {
  loading.value = true
  const { data: { user } } = await supabase.auth.getUser()
  email.value = user?.email ?? null
  const { data } = await supabase.auth.getUserIdentities()
  identities.value = data?.identities ?? []
  loading.value = false
}

const isConnected = (p: ManagedProvider) => identities.value.some((i) => i.provider === p)

const connect = async (p: ManagedProvider) => {
  busy.value = p
  const { error } = await supabase.auth.linkIdentity({
    provider: p,
    options: { redirectTo: `${window.location.origin}/linked-accounts` },
  })
  if (error) {
    busy.value = null
    // 해당 소셜 계정이 이미 다른 앱 계정에 연결돼 있으면 연결 불가
    if (/already|linked/i.test(error.message)) {
      showMessage(t('linkedAccounts.alreadyLinkedElsewhere'), 'warning')
    } else {
      showMessage(t('linkedAccounts.connectError'), 'error')
    }
  }
  // 성공 시 소셜 인증 페이지로 이동하므로 busy는 해제하지 않는다
}

const disconnect = async (p: ManagedProvider) => {
  const identity = identities.value.find((i) => i.provider === p)
  if (!identity) return
  // 마지막 로그인 수단은 해제 불가 (로그인 불능 방지)
  if (identities.value.length <= 1) {
    showMessage(t('linkedAccounts.cannotUnlinkLast'), 'warning')
    return
  }
  busy.value = p
  try {
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) {
      showMessage(t('linkedAccounts.disconnectError'), 'error')
      return
    }
    showMessage(t('linkedAccounts.disconnected'), 'success')
    await load()
  } finally {
    busy.value = null
  }
}

// linkIdentity 리다이렉트 복귀 시, "이미 다른 계정에 연결됨" 등의 에러는
// linkIdentity() 즉시 반환값이 아니라 복귀 URL의 에러 파라미터로 돌아온다.
// (query 또는 hash 어느 쪽에 실릴 수 있어 둘 다 확인)
const handleLinkRedirectError = () => {
  const parts = [window.location.search.replace(/^\?/, ''), window.location.hash.replace(/^#/, '')]
  const params = new URLSearchParams(parts.filter(Boolean).join('&'))
  const code = params.get('error_code') || params.get('error') || ''
  const desc = params.get('error_description') || ''
  if (!code && !desc) return
  if (/identity_already_exists|already|linked/i.test(`${code} ${desc}`)) {
    showMessage(t('linkedAccounts.alreadyLinkedElsewhere'), 'warning')
  } else {
    showMessage(t('linkedAccounts.connectError'), 'error')
  }
  // 새로고침 시 재노출되지 않도록 에러 파라미터 제거
  window.history.replaceState({}, '', window.location.pathname)
}

onMounted(() => {
  handleLinkRedirectError()
  load()
})
</script>

<template>
  <v-container class="pa-4" style="max-width: 480px">
    <div class="d-flex align-center ga-2 mb-6">
      <v-btn icon variant="text" size="small" @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="font-weight-bold">{{ $t('linkedAccounts.title') }}</div>
    </div>

    <div class="text-medium-emphasis mb-4" style="font-size: 0.875rem; line-height: 1.6">
      {{ $t('linkedAccounts.desc') }}
    </div>

    <v-card class="glass-card pa-4">
      <!-- 이메일 로그인 -->
      <div v-if="email" class="d-flex align-center ga-3 mb-3">
        <v-icon color="primary">mdi-email-outline</v-icon>
        <div>
          <div class="font-weight-medium">{{ $t('linkedAccounts.emailLogin') }}</div>
          <div class="text-medium-emphasis" style="font-size: 0.8rem">{{ email }}</div>
        </div>
      </div>
      <v-divider v-if="email" class="mb-3" />

      <div v-if="loading" class="text-center py-4">
        <v-progress-circular indeterminate color="primary" size="24" />
      </div>

      <template v-else>
        <div
          v-for="(m, idx) in MANAGED"
          :key="m.provider"
          class="d-flex align-center ga-3"
          :class="{ 'mt-3': idx > 0 }"
        >
          <v-icon>{{ m.icon }}</v-icon>
          <div class="font-weight-medium">{{ m.label }}</div>
          <v-spacer />
          <template v-if="isConnected(m.provider)">
            <v-chip size="small" color="success" variant="tonal">{{ $t('linkedAccounts.connected') }}</v-chip>
            <v-btn size="small" variant="text" color="error" :loading="busy === m.provider" @click="disconnect(m.provider)">
              {{ $t('linkedAccounts.disconnect') }}
            </v-btn>
          </template>
          <v-btn v-else size="small" variant="tonal" color="primary" :loading="busy === m.provider" @click="connect(m.provider)">
            {{ $t('linkedAccounts.connect') }}
          </v-btn>
        </div>
      </template>
    </v-card>
  </v-container>
</template>
