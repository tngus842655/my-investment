<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { TossAds } from '@apps-in-toss/web-framework'
import { useAppTheme } from '@/composables/useAppTheme'
import { AD_GROUP_ID, isBannerAvailable } from '@/services/tossAds'

// 앱인토스 배너 광고 — 토스 앱에서만 노출.
// 컨테이너 안은 SDK가 직접 그린다. 정책상 광고 UI(색·글꼴·문구)는 건드리지 않는다.
// 화면 진입 때 한 번 붙이고 떠날 때 정리한다 — 주기적 갱신은 정책 위반이다.
const visible = ref(isBannerAvailable())
const el = ref<HTMLElement | null>(null)
const { currentTheme } = useAppTheme()

let banner: { destroy: () => void } | null = null
let disposed = false

onMounted(() => {
  if (!visible.value) return
  // 광고 SDK 스크립트를 비동기로 받아오므로 초기화가 끝난 뒤에 붙인다
  TossAds.initialize({
    callbacks: {
      onInitialized: () => {
        if (disposed || !el.value) return
        banner = TossAds.attachBanner(AD_GROUP_ID, el.value, {
          // 기기 화면모드를 따르는 'auto' 대신 앱 테마를 넘긴다 —
          // 테마가 5개라 기기 설정과 어긋나면 배너만 반대 색으로 뜬다.
          // (사용 중 테마를 바꾸면 다음 화면 진입 때 반영된다. 그 자리에서 다시 붙이면 광고 재요청이라 하지 않는다)
          theme: currentTheme.value.dark ? 'dark' : 'light',
          variant: 'card',
          callbacks: {
            // 채울 광고가 없거나 렌더에 실패하면 빈 자리를 남기지 않는다
            onNoFill: () => { visible.value = false },
            onAdFailedToRender: () => { visible.value = false },
          },
        })
      },
      onInitializationFailed: () => { visible.value = false },
    },
  })
})

onUnmounted(() => {
  disposed = true
  banner?.destroy()
  banner = null
})
</script>

<template>
  <!-- 붙이는 시점이 비동기라 ref가 살아 있어야 한다 — v-if가 아니라 v-show -->
  <div v-show="visible" ref="el" class="toss-banner-ad" />
</template>

<style scoped>
/* 위아래 버튼·링크와 붙지 않게 띄운다 (오클릭 유발 배치 금지) */
.toss-banner-ad {
  margin: 12px 0;
}
</style>
