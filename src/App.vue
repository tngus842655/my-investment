<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useTheme } from 'vuetify'
import GlobalSnackbar from '@/components/common/GlobalSnackbar.vue'

const theme = useTheme()
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
  background: linear-gradient(175deg, #4fc8c2 0%, #8ed4cc 42%, #f0ceba 100%);
  background-attachment: fixed;
}

.app-bg.dark {
  background: linear-gradient(175deg, #0d3d3b 0%, #133a38 50%, #1f2a30 100%);
  background-attachment: fixed;
}
</style>
