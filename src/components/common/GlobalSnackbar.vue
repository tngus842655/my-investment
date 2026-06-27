<script setup lang="ts">
import { snackbar, snackbarText, snackbarColor } from '@/composables/useSnackbar'
</script>

<template>
  <v-snackbar
    v-model="snackbar"
    :color="snackbarColor"
    timeout="3000"
    location="top"
    rounded="lg"
    elevation="10"
    class="safe-area-snackbar"
  >
    {{ snackbarText }}
  </v-snackbar>
</template>

<style>
/* v-snackbar는 내부 .v-snackbar__wrapper가 실제 위치를 잡으므로 그 요소에 적용 */
.safe-area-snackbar .v-snackbar__wrapper {
  margin-top: calc(env(safe-area-inset-top) + 64px) !important;
}
</style>
