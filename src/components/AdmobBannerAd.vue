<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { isNativeApp } from '@/services/nativeApp'

// 애드몹 배너 광고 — 구글플레이 앱(Capacitor)에서만 노출. 웹·PWA·앱인토스에서는 아무것도 하지 않는다.
// 배너는 네이티브 SDK가 화면 하단에 겹쳐 그리므로 이 컴포넌트는 DOM을 만들지 않고,
// 마운트/언마운트로 노출 여부만 제어한다. 플러그인 청크는 동적 import라 앱에서만 내려받는다.
const native = isNativeApp()

onMounted(async () => {
  if (!native) return
  const { showAdmobBanner } = await import('@/services/admobAds')
  await showAdmobBanner()
})

onUnmounted(async () => {
  if (!native) return
  const { removeAdmobBanner } = await import('@/services/admobAds')
  await removeAdmobBanner()
})
</script>

<template>
  <!-- 네이티브 배너는 화면 하단 오버레이로 그려진다 — 여기엔 아무것도 없다 -->
</template>
