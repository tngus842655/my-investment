<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useI18n } from 'vue-i18n'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
const { t } = useI18n()
const dataManageOpen = ref(false)

// ── 데이터 초기화 ──────────────────────────
type ResetTarget = 'entries' | 'favorites' | 'all'
const resetTarget = ref<ResetTarget | null>(null)
const resetPassword = ref('')
const resetPasswordError = ref('')
const resetLoading = ref(false)

const resetTitle = computed(() => {
  if (resetTarget.value === 'entries') return t('budget.more.resetEntries')
  if (resetTarget.value === 'favorites') return t('budget.more.resetFavorites')
  if (resetTarget.value === 'all') return t('budget.more.resetAll')
  return ''
})
const resetDescription = computed(() => {
  if (resetTarget.value === 'entries') return t('budget.more.resetEntriesDesc')
  if (resetTarget.value === 'favorites') return t('budget.more.resetFavoritesDesc')
  if (resetTarget.value === 'all') return t('budget.more.resetAllDesc')
  return ''
})

const openResetDialog = (target: ResetTarget) => {
  resetTarget.value = target
  resetPassword.value = ''
  resetPasswordError.value = ''
}
const closeResetDialog = () => {
  resetTarget.value = null
}

const executeReset = async () => {
  if (!resetPassword.value) {
    resetPasswordError.value = t('budget.more.passwordRequired')
    return
  }
  resetLoading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: resetPassword.value,
    })
    if (authError) {
      resetPasswordError.value = t('budget.more.passwordWrong')
      return
    }

    const target = resetTarget.value
    if (target === 'entries' || target === 'all') {
      const { error } = await supabase.from('budget_entries').delete().eq('user_id', user.id)
      if (error) throw error
    }
    if (target === 'favorites' || target === 'all') {
      const { error } = await supabase.from('budget_favorites').delete().eq('user_id', user.id)
      if (error) throw error
    }
    if (target === 'all') {
      const { error: catError } = await supabase.from('budget_categories').delete().eq('user_id', user.id)
      if (catError) throw catError
      const { error: pmError } = await supabase.from('budget_payment_methods').delete().eq('user_id', user.id)
      if (pmError) throw pmError
    }

    showMessage(t('budget.more.resetDone', { title: resetTitle.value }), 'success')
    closeResetDialog()
  } catch {
    showMessage(t('budget.more.resetFailed'), 'error')
  } finally {
    resetLoading.value = false
  }
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6 budget-more-page">
    <div class="d-flex align-center justify-space-between mb-2">
      <div class="d-flex align-center ga-2">
        <img src="/icons/icon-more.png" class="header-icon" :alt="$t('budget.nav.more')" />
        <div class="font-weight-bold">{{ $t('budget.nav.more') }}</div>
      </div>
      <v-btn variant="text" size="small" to="/hub" class="hub-btn">
        <img src="/icons/icon-hub.png" class="header-icon" :alt="$t('common.hub')" />
        <span class="hub-btn-label">{{ $t('common.hub') }}</span>
      </v-btn>
    </div>

    <div class="section-label mb-2">{{ $t('hub.budget') }}</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/budget/search')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-magnify</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('budget.search.title') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/budget/manage')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-cog-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('budget.common.manage') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-2 d-flex align-center ga-3" @click="router.push('/budget/import')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-file-excel-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">{{ $t('budget.import.title') }}</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <div class="glass-card py-2 px-4 mb-5 mt-auto">
      <div class="section-label-lg d-flex align-center justify-space-between cursor-pointer" @click="dataManageOpen = !dataManageOpen">
        <span>{{ $t('budget.more.dataManage') }}</span>
        <v-icon size="18" class="collapse-icon" :class="{ 'collapse-icon-open': dataManageOpen }">mdi-chevron-down</v-icon>
      </div>
      <div v-if="dataManageOpen" class="mt-2">
        <v-btn variant="tonal" color="error" rounded="lg" block prepend-icon="mdi-delete-clock-outline" class="mb-2" @click="openResetDialog('entries')">
          {{ $t('budget.more.resetEntries') }}
        </v-btn>
        <v-btn variant="tonal" color="error" rounded="lg" block prepend-icon="mdi-star-off-outline" class="mb-2" @click="openResetDialog('favorites')">
          {{ $t('budget.more.resetFavorites') }}
        </v-btn>
        <v-btn variant="tonal" color="error" rounded="lg" block prepend-icon="mdi-database-remove-outline" @click="openResetDialog('all')">
          {{ $t('budget.more.resetAll') }}
        </v-btn>
      </div>
    </div>

    <v-dialog :model-value="resetTarget !== null" max-width="360" @update:model-value="(v) => !v && closeResetDialog()">
      <v-card rounded="xl" class="glass-dialog pa-4">
        <div class="font-weight-bold mb-2 text-error">{{ resetTitle }}</div>
        <div class="text-medium-emphasis mb-4" style="font-size: 0.8125rem">
          {{ resetDescription }} {{ $t('budget.more.irreversible') }}
        </div>
        <form @submit.prevent="executeReset">
          <input
            type="text"
            value=""
            autocomplete="off"
            readonly
            class="visually-hidden"
            tabindex="-1"
            aria-hidden="true"
          />
          <v-text-field
            v-model="resetPassword"
            type="password"
            autocomplete="current-password"
            :label="$t('hub.passwordLabel')"
            density="compact"
            variant="outlined"
            rounded="lg"
            :error-messages="resetPasswordError"
            autofocus
          />
          <div class="d-flex ga-2 mt-2">
            <v-btn type="button" variant="text" class="flex-1" :disabled="resetLoading" @click="closeResetDialog">{{ $t('common.cancel') }}</v-btn>
            <v-btn type="submit" color="error" variant="tonal" class="flex-1" :loading="resetLoading">{{ $t('budget.more.resetButton') }}</v-btn>
          </div>
        </form>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
/* 크롬 비밀번호 폼 접근성 경고 방지용 — 화면에는 안 보이지만 DOM/접근성 트리에는 남겨둠 */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.budget-more-page {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 32px - 10px);
}

.header-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.hub-btn {
  min-width: auto !important;
  padding: 0 14px 0 8px !important;
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%) !important;
  border-radius: 999px !important;
  box-shadow: 0 4px 14px rgba(109, 40, 217, 0.45) !important;
}
.hub-btn-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
  margin-left: 4px;
}

.section-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
  padding: 0 4px;
}

.section-label-lg {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-on-surface));
  padding: 6px 0;
}

.glass-card {
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
  border-radius: 20px;
}

.menu-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-card {
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.menu-card:active {
  opacity: 0.7;
}

.chevron-icon {
  color: rgba(var(--v-theme-on-surface), 0.3);
}

.cursor-pointer {
  cursor: pointer;
}

.collapse-icon {
  color: rgba(var(--v-theme-on-surface), 0.4);
  transition: transform 0.2s ease;
}

.collapse-icon-open {
  transform: rotate(180deg);
}

.glass-dialog {
  background: var(--fp-surface) !important;
  border: 1px solid var(--fp-outline) !important;
}

.flex-1 {
  flex: 1;
}
</style>
