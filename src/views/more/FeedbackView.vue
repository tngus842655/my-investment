<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
const CONTACT_EMAIL = 'tngus842655@naver.com'
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 600px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="text-h5 font-weight-bold">개선사항 보내기</div>
        <div class="text-body-2 text-medium-emphasis">의견을 보내주세요</div>
      </div>
    </div>

    <div class="glass-card pa-6 text-center">
      <v-icon size="48" color="primary" class="mb-4" style="opacity: 0.8">mdi-message-text-outline</v-icon>
      <div class="text-body-1 font-weight-bold mb-2">개선사항이나 버그를 발견하셨나요?</div>
      <div class="text-body-2 text-medium-emphasis mb-1" style="line-height: 1.7">
        불편한 점, 개선 아이디어, 오류 제보 등<br>
        어떤 의견이든 환영합니다.
      </div>
      <div class="text-body-2 text-medium-emphasis mb-6" style="line-height: 1.7">
        아래 이메일로 내용을 보내주시면<br>
        검토 후 반영하겠습니다.
      </div>
      <a :href="`mailto:${CONTACT_EMAIL}?subject=[FIREPATH 개선사항]`" class="contact-email-btn">
        <v-icon size="18" class="mr-2">mdi-email-outline</v-icon>
        {{ CONTACT_EMAIL }}
      </a>
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


.contact-email-btn {
  display: inline-flex;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  border: 1px solid rgba(0, 212, 184, 0.3);
  border-radius: 12px;
  padding: 12px 24px;
  transition: background 0.2s;
}
.contact-email-btn:active {
  background: rgba(0, 212, 184, 0.08);
}
</style>
