<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

interface TickerItem {
  ticker: string
  name: string
}

const tickers = ref<TickerItem[]>([])
const loading = ref(false)
const search = ref('')

const newTicker = ref('')
const newName = ref('')
const adding = ref(false)

const editingTicker = ref<string | null>(null)
const editName = ref('')
const saving = ref(false)

const filteredTickers = computed(() => {
  const q = search.value.trim().toUpperCase()
  if (!q) return tickers.value
  return tickers.value.filter(
    (t) => t.ticker.includes(q) || t.name.includes(search.value.trim()),
  )
})

async function fetchTickers() {
  loading.value = true
  try {
    const res = await fetch('/api/admin/tickers')
    tickers.value = await res.json()
  } finally {
    loading.value = false
  }
}

async function addTicker() {
  const ticker = newTicker.value.trim().toUpperCase()
  const name = newName.value.trim()
  if (!ticker || !name) return
  adding.value = true
  try {
    await fetch('/api/admin/tickers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, name }),
    })
    newTicker.value = ''
    newName.value = ''
    await fetchTickers()
  } finally {
    adding.value = false
  }
}

async function deleteTicker(ticker: string) {
  await fetch('/api/admin/tickers', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker }),
  })
  await fetchTickers()
}

function startEdit(item: TickerItem) {
  editingTicker.value = item.ticker
  editName.value = item.name
}

async function saveEdit() {
  if (!editingTicker.value || !editName.value.trim()) return
  saving.value = true
  try {
    await fetch('/api/admin/tickers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: editingTicker.value, name: editName.value.trim() }),
    })
    editingTicker.value = null
    await fetchTickers()
  } finally {
    saving.value = false
  }
}

function cancelEdit() {
  editingTicker.value = null
}

onMounted(() => {
  if (isLocal) fetchTickers()
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 640px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="text-h5 font-weight-bold">미국 주식 티커 관리</div>
        <div class="text-body-2 text-medium-emphasis">한글명 직접 추가·수정·삭제</div>
      </div>
    </div>

    <v-alert
      v-if="!isLocal"
      type="warning"
      variant="tonal"
      rounded="lg"
      class="mb-4"
      density="compact"
    >
      로컬(localhost) 개발 환경에서만 사용 가능합니다.
    </v-alert>

    <template v-if="isLocal">
      <!-- 추가 폼 -->
      <div class="glass-card pa-4 mb-3">
        <div class="section-label mb-3">티커 추가</div>
        <div class="d-flex ga-2">
          <v-text-field
            v-model="newTicker"
            label="티커 (예: AAPL)"
            density="compact"
            variant="outlined"
            rounded="lg"
            hide-details
            style="max-width: 140px; flex-shrink: 0"
            @keyup.enter="addTicker"
          />
          <v-text-field
            v-model="newName"
            label="한글명 (예: 애플)"
            density="compact"
            variant="outlined"
            rounded="lg"
            hide-details
            style="flex: 1"
            @keyup.enter="addTicker"
          />
          <v-btn
            color="primary"
            variant="tonal"
            rounded="lg"
            :loading="adding"
            :disabled="!newTicker.trim() || !newName.trim()"
            icon="mdi-plus"
            @click="addTicker"
          />
        </div>
      </div>

      <!-- 검색 + 목록 -->
      <div class="glass-card pa-4">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="section-label">목록 ({{ tickers.length }}개)</div>
        </div>
        <v-text-field
          v-model="search"
          placeholder="티커 또는 한글명 검색"
          density="compact"
          variant="outlined"
          rounded="lg"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          class="mb-3"
        />

        <div v-if="loading" class="d-flex justify-center py-6">
          <v-progress-circular indeterminate color="primary" size="28" />
        </div>

        <div v-else class="ticker-list">
          <div
            v-for="item in filteredTickers"
            :key="item.ticker"
            class="ticker-row"
          >
            <template v-if="editingTicker === item.ticker">
              <span class="ticker-code">{{ item.ticker }}</span>
              <v-text-field
                v-model="editName"
                density="compact"
                variant="outlined"
                rounded="lg"
                hide-details
                autofocus
                style="flex: 1"
                @keyup.enter="saveEdit"
                @keyup.escape="cancelEdit"
              />
              <v-btn icon="mdi-check" size="small" variant="text" color="primary" :loading="saving" @click="saveEdit" />
              <v-btn icon="mdi-close" size="small" variant="text" @click="cancelEdit" />
            </template>
            <template v-else>
              <span class="ticker-code">{{ item.ticker }}</span>
              <span class="ticker-name">{{ item.name }}</span>
              <v-btn icon="mdi-pencil-outline" size="small" variant="text" class="action-btn" @click="startEdit(item)" />
              <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" class="action-btn" @click="deleteTicker(item.ticker)" />
            </template>
          </div>
          <div v-if="filteredTickers.length === 0" class="text-center text-medium-emphasis text-caption py-4">
            검색 결과가 없습니다.
          </div>
        </div>
      </div>
    </template>
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

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.ticker-list {
  max-height: 480px;
  overflow-y: auto;
}

.ticker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.ticker-row:last-child { border-bottom: none; }

.ticker-code {
  font-size: 12px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  color: rgb(var(--v-theme-primary));
  min-width: 64px;
  flex-shrink: 0;
}

.ticker-name {
  font-size: 13px;
  flex: 1;
  color: rgb(var(--v-theme-on-surface));
}

.action-btn {
  opacity: 0;
  flex-shrink: 0;
}
.ticker-row:hover .action-btn {
  opacity: 1;
}
</style>
