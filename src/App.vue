<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useTheme } from 'vuetify'
import GlobalSnackbar from '@/components/common/GlobalSnackbar.vue'
import { useAppTheme } from '@/composables/useAppTheme'

const theme = useTheme()
const { initTheme } = useAppTheme()

onMounted(() => {
  initTheme()
})
</script>

<template>
  <div class="app-bg" :class="theme.global.name.value">
    <RouterView />
    <GlobalSnackbar />
  </div>
</template>

<style>
.app-bg {
  min-height: 100vh;
}

.app-bg.light {
  background: #f0f7f6;
}

.app-bg.dark {
  background: #0f1e1d;
}
</style>
