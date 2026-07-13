<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BudgetCategoryView from './BudgetCategoryView.vue'
import BudgetPaymentMethodView from './BudgetPaymentMethodView.vue'
import BudgetFavoriteView from './BudgetFavoriteView.vue'

const router = useRouter()
const tab = ref<'category' | 'paymentMethod' | 'favorite'>('category')
</script>

<template>
  <v-container class="pa-4 pa-sm-6 d-flex flex-column" style="max-width: 640px; height: 100%">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="font-weight-bold">{{ $t('budget.common.manage') }}</div>
        <div class="text-medium-emphasis">{{ $t('budget.manage.subtitle') }}</div>
      </div>
    </div>

    <v-btn-toggle v-model="tab" mandatory rounded="lg" density="comfortable" class="mb-4 w-100">
      <v-btn value="category" variant="tonal" class="flex-grow-1">{{ $t('budget.common.category') }}</v-btn>
      <v-btn value="paymentMethod" variant="tonal" class="flex-grow-1">{{ $t('budget.common.paymentMethod') }}</v-btn>
      <v-btn value="favorite" variant="tonal" class="flex-grow-1">{{ $t('budget.common.favorites') }}</v-btn>
    </v-btn-toggle>

    <div class="flex-grow-1" style="min-height: 0">
      <BudgetCategoryView v-if="tab === 'category'" />
      <BudgetPaymentMethodView v-else-if="tab === 'paymentMethod'" />
      <BudgetFavoriteView v-else />
    </div>
  </v-container>
</template>

<style scoped>
.back-btn {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.back-btn:active { opacity: 0.6; }
</style>
