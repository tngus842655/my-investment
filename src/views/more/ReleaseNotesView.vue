<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const notes = [
  {
    version: 'v1.0.0 베타',
    date: '2026.6.22',
    items: [
      '계좌 구분 기능 추가 — 동일 종목을 여러 계좌로 나눠 관리 가능',
      '자산·거래내역 화면에 계좌 필터 칩 추가',
      '자산 카드 레이아웃 개선 — 더 많은 종목을 한 화면에',
      '자산·거래 추가 다이얼로그 공백 최소화',
      '좁은 화면(Galaxy Fold 등)에서 금액 한글 축약 표기',
      '의견 보내기 → 의견 관리 화면으로 개편 (답변 확인 가능)',
      '개발자 노트 추가',
    ],
  },
]
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="d-flex align-center ga-3 mb-6">
      <v-btn icon variant="text" size="small" @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div>
        <div class="text-h5 font-weight-bold">개발자 노트</div>
        <div class="text-body-2 text-medium-emphasis">업데이트 내역</div>
      </div>
    </div>

    <div v-for="note in notes" :key="note.version" class="release-card glass-card pa-4 mb-3">
      <div class="d-flex align-center ga-2 mb-3">
        <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold">{{ note.version }}</v-chip>
        <span class="text-caption text-medium-emphasis">{{ note.date }}</span>
      </div>
      <ul class="note-list">
        <li v-for="(item, i) in note.items" :key="i" class="text-body-2">{{ item }}</li>
      </ul>
    </div>
  </v-container>
</template>

<style scoped>
.glass-card {
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
  border-radius: 20px;
}

.note-list {
  padding-left: 18px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.note-list li {
  color: rgba(var(--v-theme-on-surface), 0.75);
  line-height: 1.5;
}
</style>
