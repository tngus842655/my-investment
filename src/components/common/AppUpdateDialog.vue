<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { App } from '@capacitor/app'
import { getAppUpdateBuild, snoozeAppUpdate, openAppStore } from '@/services/appUpdate'

// 안드로이드 앱에서만 렌더된다 (App.vue에서 isNativeApp()으로 감싼다).
const dialog = ref(false)
const build = ref('')

const check = async () => {
  if (dialog.value) return
  const available = await getAppUpdateBuild()
  if (!available) return
  build.value = available
  dialog.value = true
}

// 닫는 방법이 "업데이트"든 "나중에"든 스누즈를 남긴다. 스토어로 보낸 뒤 업데이트하지 않고
// 그냥 돌아오면 아래 resume 검사가 곧바로 다시 띄우게 되기 때문이다.
const dismiss = () => {
  snoozeAppUpdate(build.value)
  dialog.value = false
}

const later = () => dismiss()

const update = async () => {
  dismiss()
  await openAppStore()
}

onMounted(() => {
  check()
  // 앱을 완전히 종료하지 않고 백그라운드에만 두는 사용자에게도 24시간 뒤 안내가 닿아야 하므로
  // 화면으로 돌아올 때도 검사한다. App.vue는 앱이 살아 있는 동안 언마운트되지 않아 해제하지 않는다.
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) check()
  })
})
</script>

<template>
  <v-dialog v-model="dialog" max-width="360" persistent>
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="d-flex align-center ga-2 pt-5 px-5 update-title">
        <v-icon color="primary" size="20">mdi-cellphone-arrow-down</v-icon>
        <span class="font-weight-bold">{{ $t('appUpdate.title') }}</span>
      </v-card-title>
      <v-card-text class="px-5">{{ $t('appUpdate.message') }}</v-card-text>
      <v-card-actions class="px-5 pb-4 ga-2">
        <v-btn variant="text" rounded="lg" class="flex-1-1" @click="later">
          {{ $t('appUpdate.later') }}
        </v-btn>
        <v-btn color="primary" variant="flat" rounded="lg" class="flex-1-1" @click="update">
          {{ $t('appUpdate.update') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* v-card-title은 기본이 한 줄 고정(white-space: nowrap + text-overflow: ellipsis)이라
   영문 제목이 "A new version is availab…"으로 잘린다. 두 줄로 넘어가게 푼다. */
.update-title {
  white-space: normal;
  line-height: 1.35;
}

.glass-dialog {
  background: rgb(var(--v-theme-surface)) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
}
</style>
