<script setup lang="ts">
import { snackbar, snackbarText, snackbarColor } from '@/composables/useSnackbar'
</script>

<template>
  <v-snackbar
    v-model="snackbar"
    :color="snackbarColor"
    timeout="1500"
    location="top"
    rounded="lg"
    elevation="10"
  >
    {{ snackbarText }}
  </v-snackbar>
</template>
