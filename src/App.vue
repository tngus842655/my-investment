<script setup lang="ts">
import { RouterView } from 'vue-router'
import GlobalSnackbar from '@/components/common/GlobalSnackbar.vue'
</script>

<template>
  <RouterView />

  <GlobalSnackbar />
</template>
