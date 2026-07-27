<script setup lang="ts">
import { computed } from 'vue'
// 로그인 수단(provider) 아이콘 배지 — 관리자 화면에서 소셜/이메일 가입 구분 표시용
const props = defineProps<{ providers?: string[] }>()

const META: Record<string, { icon: string; color: string; title: string }> = {
  google: { icon: 'mdi-google', color: '#EA4335', title: 'Google' },
  kakao: { icon: 'mdi-chat', color: '#E6A800', title: '카카오' },
  toss: { icon: 'mdi-alpha-t-circle', color: '#3182F6', title: '토스' },
  email: { icon: 'mdi-email-outline', color: '', title: '이메일' },
}
// google → kakao → toss → email 순으로 노출
const ORDER = ['google', 'kakao', 'toss', 'email']

// 토스 계정은 Edge Function이 createUser로 만들어 auth.identities에 email이 함께 남는다.
// 가입 경로를 보여주는 배지이므로 토스가 있으면 email은 숨긴다.
const shown = computed(() => {
  const p = props.providers
  if (!p) return []
  return ORDER.filter((x) => p.includes(x) && META[x] && !(x === 'email' && p.includes('toss')))
})
</script>

<template>
  <span v-if="shown.length" class="d-inline-flex align-center ga-1">
    <v-icon
      v-for="p in shown"
      :key="p"
      size="13"
      :color="META[p]!.color || undefined"
      :title="META[p]!.title"
    >{{ META[p]!.icon }}</v-icon>
  </span>
</template>
