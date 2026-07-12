<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { formatFullDate } from '@/utils/dateFormat'
import PrivacyPolicyContentKo from './PrivacyPolicyContentKo.vue'
import PrivacyPolicyContentEn from './PrivacyPolicyContentEn.vue'

const router = useRouter()
const { locale, t } = useI18n()

// 국가별로 법률 문서 전문이 달라 컴포넌트 자체를 분기한다 (i18n 키 조각화 대신).
const effectiveDate = formatFullDate(2026, 7, 8)
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 640px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="font-weight-bold">{{ t('privacyPolicy.title') }}</div>
        <div class="text-medium-emphasis">{{ t('privacyPolicy.effectiveDate', { date: effectiveDate }) }}</div>
      </div>
    </div>

    <div class="glass-card pa-4 policy-body">
      <PrivacyPolicyContentEn v-if="locale === 'en'" />
      <PrivacyPolicyContentKo v-else />
    </div>
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

<!-- 본문은 로케일별 자식 컴포넌트(PrivacyPolicyContentKo/En)에서 렌더링되므로
     scoped 대신 전역 스타일로 둬야 h3/p/ul/li에 적용된다 -->
<style>
.policy-body h3 {
  font-size: 0.9375rem;
  font-weight: 700;
  margin-top: 20px;
  margin-bottom: 8px;
}
.policy-body h3:first-of-type {
  margin-top: 0;
}
.policy-body p {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
  line-height: 1.6;
  margin: 0 0 8px;
}
.policy-body ul {
  padding-left: 18px;
  margin: 0 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.policy-body li {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
  line-height: 1.5;
}
</style>
