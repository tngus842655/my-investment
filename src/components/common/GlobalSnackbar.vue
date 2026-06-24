<script setup lang="ts">
import { snackbar, snackbarText, snackbarColor } from '@/composables/useSnackbar'
</script>

<template>
  <v-snackbar
    v-model="snackbar"
    :color="snackbarColor"
    timeout="2000"
    location="top"
    rounded="lg"
    elevation="10"
  >
    {{ snackbarText }}
  </v-snackbar>
</template>
