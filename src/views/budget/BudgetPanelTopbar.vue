<script setup lang="ts">
defineProps<{
  title: string
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div class="panel-topbar">
    <span class="topbar-title">{{ title }}</span>
    <div class="d-flex align-center ga-1">
      <slot />
      <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')" />
    </div>
  </div>
</template>

<style scoped>
.panel-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 6px 6px 14px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  flex-shrink: 0;
}
.topbar-title {
  font-weight: 700;
  font-size: 1.0625rem;
  line-height: 1.375rem;
}
.panel-topbar .v-btn {
  color: inherit;
}
.panel-topbar :deep(.v-btn) {
  width: 28px !important;
  height: 28px !important;
}
.panel-topbar :deep(.v-icon) {
  font-size: 1.375rem;
}
</style>
