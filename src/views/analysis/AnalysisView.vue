<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="text-h5 font-weight-bold mb-1">분석</div>
    <div class="text-body-2 text-medium-emphasis mb-8">포트폴리오 분석</div>

    <div class="glass-card py-16 text-center">
      <v-icon size="48" color="primary" style="opacity: 0.4" class="mb-4">mdi-chart-pie</v-icon>
      <div class="text-h6 font-weight-medium text-medium-emphasis">준비 중입니다</div>
      <div class="text-body-2 text-disabled mt-1">자산 배분 분석 기능이 곧 추가됩니다.</div>
    </div>
  </v-container>
</template>

<style scoped>
.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}
.v-theme--dark .glass-card {
  border-color: rgba(93, 214, 207, 0.15);
}
</style>
