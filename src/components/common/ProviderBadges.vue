<script setup lang="ts">
// 로그인 수단(provider) 아이콘 배지 — 관리자 화면에서 회원이 쓸 수 있는 로그인 수단 표시용.
// 'password'는 admin_get_user_providers()가 판정해서 넣어준다 (토스가 만든 계정은 auth상
// email identity를 갖지만 유저가 비밀번호를 모르므로 제외된다).
defineProps<{ providers?: string[] }>()

const META: Record<string, { icon: string; color: string; title: string }> = {
  google: { icon: 'mdi-google', color: '#EA4335', title: 'Google' },
  kakao: { icon: 'mdi-chat', color: '#E6A800', title: '카카오' },
  toss: { icon: 'mdi-alpha-t-circle', color: '#3182F6', title: '토스' },
  password: { icon: 'mdi-key-outline', color: '', title: '비밀번호' },
}
// google → kakao → toss → password 순으로 노출
const ORDER = ['google', 'kakao', 'toss', 'password']
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
