<script setup lang="ts">
const emit = defineEmits<{
  digit: [string]
  backspace: []
  done: []
}>()

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']
</script>

<template>
  <div class="amount-keypad">
    <div class="keypad-grid">
      <button
        v-for="(key, i) in keys"
        :key="i"
        class="keypad-key"
        :class="{ 'keypad-key--back': key === 'back', 'keypad-key--empty': key === '' }"
        :disabled="key === ''"
        @click="key === 'back' ? emit('backspace') : key && emit('digit', key)"
      >
        <v-icon v-if="key === 'back'" size="20">mdi-backspace-outline</v-icon>
        <span v-else>{{ key }}</span>
      </button>
    </div>
    <button class="keypad-done" @click="emit('done')">완료</button>
  </div>
</template>

<style scoped>
.amount-keypad {
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.keypad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.keypad-key {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  border: none;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  background: none;
  font-size: 1.125rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}
.keypad-key:nth-child(3n) {
  border-right: none;
}
.keypad-key:active {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.keypad-key--back {
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.keypad-key--empty {
  cursor: default;
}
.keypad-key--empty:active {
  background: none;
}

.keypad-done {
  height: 44px;
  border: none;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-weight: 700;
  font-size: 0.9375rem;
  cursor: pointer;
}
.keypad-done:active {
  opacity: 0.85;
}
</style>
