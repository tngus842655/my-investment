<script setup lang="ts">
import { useBaseCurrency } from '@/composables/useBaseCurrency'

const { displayCurrency, setDisplayCurrency } = useBaseCurrency()
</script>

<template>
  <div class="currency-toggle-row">
    <button
      type="button"
      class="currency-toggle-btn"
      :class="{ 'currency-toggle-btn-active': displayCurrency === 'KRW' }"
      @click="setDisplayCurrency('KRW')"
    >
      ₩
    </button>
    <button
      type="button"
      class="currency-toggle-btn"
      :class="{ 'currency-toggle-btn-active': displayCurrency === 'USD' }"
      @click="setDisplayCurrency('USD')"
    >
      $
    </button>
  </div>
</template>

<style scoped>
.currency-toggle-row {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  padding: 2px;
}
.currency-toggle-btn {
  background: none;
  border: none;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.45);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.currency-toggle-btn-active {
  background: rgb(var(--v-theme-primary));
  color: #fff;
}
</style>
