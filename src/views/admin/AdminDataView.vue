<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

interface DataItem {
  id: string
  title: string
  description: string
  scriptKey: string
  icon: string
  targetFile: string
}

const items: DataItem[] = [
  {
    id: 'kr',
    title: '국내 주식 티커명 업데이트',
    description: '네이버 금융에서 KOSPI/KOSDAQ 전체 종목을 가져와 tickerNames.kr.ts를 갱신합니다.',
    scriptKey: 'generate-kr-tickers',
    icon: 'mdi-flag',
    targetFile: 'src/utils/tickerNames.kr.ts',
  },
]

const runningId = ref<string | null>(null)
const logs = ref<Record<string, string>>({})
const done = ref<Record<string, boolean>>({})

async function runScript(item: DataItem) {
  if (runningId.value) return
  runningId.value = item.id
  logs.value[item.id] = ''
  done.value[item.id] = false

  const res = await fetch('/api/admin/run-script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: item.scriptKey }),
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done: streamDone, value } = await reader.read()
    if (streamDone) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      if (part.startsWith('event: done')) {
        done.value[item.id] = true
        runningId.value = null
      } else if (part.startsWith('data: ')) {
        try {
          const text = JSON.parse(part.slice(6))
          logs.value[item.id] += text
        } catch {}
      }
    }
  }

  runningId.value = null
  done.value[item.id] = true
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 600px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="text-h5 font-weight-bold">데이터 관리</div>
        <div class="text-body-2 text-medium-emphasis">티커명 데이터 업데이트</div>
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
      로컬(localhost) 개발 환경에서만 실행 가능합니다.
    </v-alert>

    <!-- 미국 주식 티커 직접 관리 -->
    <div class="glass-card pa-4 mb-0">
      <div class="d-flex align-center ga-2 mb-1">
        <v-icon size="18" color="primary">mdi-flag-variant</v-icon>
        <div class="text-body-2 font-weight-bold">미국 주식 티커 관리</div>
      </div>
      <div class="text-caption text-medium-emphasis mb-3">한글명을 직접 추가·수정·삭제합니다. tickerNames.us.ts 파일에 저장됩니다.</div>
      <v-btn
        variant="tonal"
        color="primary"
        rounded="lg"
        block
        prepend-icon="mdi-table-edit"
        @click="router.push('/admin/tickers')"
      >
        티커 관리 페이지 열기
      </v-btn>
    </div>

    <div class="d-flex flex-column ga-3">
      <div v-for="item in items" :key="item.id" class="glass-card pa-4">
        <div class="d-flex align-center ga-2 mb-1">
          <v-icon size="18" color="primary">{{ item.icon }}</v-icon>
          <div class="text-body-2 font-weight-bold">{{ item.title }}</div>
        </div>
        <div class="text-caption text-medium-emphasis mb-1">{{ item.description }}</div>
        <div class="d-flex align-center ga-1 mb-3">
          <v-icon size="12" class="text-disabled">mdi-file-code-outline</v-icon>
          <span class="text-caption text-disabled">{{ item.targetFile }}</span>
        </div>

        <v-btn
          variant="tonal"
          :color="isLocal ? 'primary' : 'default'"
          rounded="lg"
          block
          :prepend-icon="done[item.id] ? 'mdi-check' : 'mdi-play'"
          :disabled="!isLocal || !!runningId"
          :loading="runningId === item.id"
          @click="runScript(item)"
        >
          {{ done[item.id] ? '완료! (다시 실행)' : '실행' }}
        </v-btn>

        <!-- 로그 출력 -->
        <div v-if="logs[item.id]" class="log-box mt-3">
          <pre class="log-text">{{ logs[item.id] }}</pre>
        </div>
      </div>
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

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}

.log-box {
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 10px;
  padding: 10px 14px;
  max-height: 200px;
  overflow-y: auto;
}
.log-text {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
</style>
