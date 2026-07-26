<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import {
  PROMOTION_AMOUNT,
  claimReward,
  fetchRewardStatus,
  hasVisitedCategory,
  isPromotionAvailable,
} from '@/services/tossPromotion'

// 앱인토스 프로모션 카드 — 토스 앱에서만 노출.
// 허브(아직 카테고리를 안 둘러봤을 수 있음)와 카테고리 첫 화면(대시보드/가계부)에 함께 놓는다.
// 로그인 후 마지막 사용 모듈로 직행하는 유저는 허브를 안 지나가므로, 카테고리 화면에도
// 카드가 있어야 수령할 수 있다.
//   hidden  : 노출 안 함 (토스 앱이 아니거나 이미 지급 완료)
//   locked  : 아직 서비스 카테고리를 둘러보지 않음
//   ready   : 조건 충족, 받기 가능
//   pending : 지급 결과를 알 수 없음 → 확인 경로 안내 (콘솔 가이드 요구사항)
const state = ref<'hidden' | 'locked' | 'ready' | 'pending'>('hidden')
const loading = ref(false)

const router = useRouter()
const { t } = useI18n()

onMounted(async () => {
  if (!isPromotionAvailable()) return
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const status = await fetchRewardStatus(session.user.id)
  if (status === 'GRANTED') return
  if (status === 'PENDING') {
    state.value = 'pending'
    return
  }
  // 카테고리 화면에 들어온 시점에 라우터 가드가 이미 방문을 기록해두므로,
  // 대시보드·가계부에서는 항상 ready로 열린다.
  state.value = hasVisitedCategory(session.user.id) ? 'ready' : 'locked'
})

const claim = async () => {
  loading.value = true
  const result = await claimReward()
  loading.value = false

  if (result === 'GRANTED') {
    state.value = 'hidden'
    showMessage(t('hub.promo.success', { amount: PROMOTION_AMOUNT }), 'success')
  } else if (result === 'ALREADY') {
    state.value = 'hidden'
    showMessage(t('hub.promo.already'), 'warning')
  } else if (result === 'UNKNOWN') {
    // 지급됐는지 알 수 없는 상태 — 카드를 닫지 않고 확인 경로를 안내한다
    state.value = 'pending'
    showMessage(t('hub.promo.unknown'), 'warning')
  } else {
    showMessage(t('hub.promo.failed'), 'error')
  }
}
</script>

<template>
  <div v-if="state !== 'hidden'" class="promo-card pa-3 mb-3">
    <div class="d-flex align-center ga-3">
      <div class="promo-icon"><v-icon size="22" color="primary">mdi-gift-outline</v-icon></div>
      <div>
        <div class="font-weight-medium">
          {{ state === 'pending' ? $t('hub.promo.pendingTitle') : $t('hub.promo.title', { amount: PROMOTION_AMOUNT }) }}
        </div>
        <div class="promo-desc">
          {{ state === 'pending' ? $t('hub.promo.pendingDesc') : state === 'ready' ? $t('hub.promo.ready') : $t('hub.promo.guide') }}
        </div>
      </div>
    </div>

    <!-- 지급 결과를 알 수 없는 상태 — 적립 내역 확인 경로와 문의 경로를 안내 -->
    <v-btn
      v-if="state === 'pending'"
      variant="tonal"
      color="primary"
      rounded="lg"
      block
      class="mt-3"
      prepend-icon="mdi-message-text-outline"
      @click="router.push('/feedback')"
    >
      {{ $t('hub.feedback') }}
    </v-btn>

    <template v-else>
      <v-btn
        color="primary"
        rounded="lg"
        block
        class="mt-3"
        :disabled="state !== 'ready'"
        :loading="loading"
        @click="claim"
      >
        {{ $t('hub.promo.claim', { amount: PROMOTION_AMOUNT }) }}
      </v-btn>

      <!-- 지급 시점·조건·제한 및 중단 가능성 고지 (앱인토스 프로모션 필수 고지 항목) -->
      <ul class="promo-notice mt-3">
        <li>{{ $t('hub.promo.noticeWhen') }}</li>
        <li>{{ $t('hub.promo.noticeCondition') }}</li>
        <li>{{ $t('hub.promo.noticeLimit') }}</li>
        <li>{{ $t('hub.promo.noticeStop') }}</li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.promo-card {
  background: var(--fp-surface);
  border: 1px solid rgba(var(--v-theme-primary), 0.4);
  border-radius: 20px;
}

.promo-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.promo-desc {
  font-size: 0.75rem;
  color: var(--fp-text-secondary);
  margin-top: 2px;
}

.promo-notice {
  list-style: none;
  padding: 0;
  font-size: 0.6875rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.promo-notice li::before {
  content: '· ';
}
</style>
