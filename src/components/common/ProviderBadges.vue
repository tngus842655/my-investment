<script setup lang="ts">
// 로그인 수단(provider) 아이콘 배지 — 관리자 화면에서 소셜/이메일 가입 구분 표시용
defineProps<{ providers?: string[] }>()

const META: Record<string, { icon: string; color: string; title: string }> = {
  google: { icon: 'mdi-google', color: '#EA4335', title: 'Google' },
  kakao: { icon: 'mdi-chat', color: '#E6A800', title: '카카오' },
  email: { icon: 'mdi-email-outline', color: '', title: '이메일' },
}
// google → kakao → email 순으로 노출
const ORDER = ['google', 'kakao', 'email']
</script>

<template>
  <span v-if="providers && providers.length" class="d-inline-flex align-center ga-1">
    <v-icon
      v-for="p in ORDER.filter((x) => providers!.includes(x) && META[x])"
      :key="p"
      size="13"
      :color="META[p]!.color || undefined"
      :title="META[p]!.title"
    >{{ META[p]!.icon }}</v-icon>
  </span>
</template>
