<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const notes = [
  {
    version: 'v1.0.2',
    date: '2026.7.1',
    description: [],
    items: [
      '보유자산 화면에서 현금 자산 추가 가능 — 원화/달러 각각 계좌별로 관리',
      '현금 표시명 간소화 (원화현금 → 원화, 달러현금 → 달러)',
      '대시보드 현재 자산에 "투자자산만 / 현금 포함" 보기 전환 기능 추가 및 UI수정',
      'ETF 백테스트 비교 카드에서 MDD(최대낙폭) 승리 표시 오류 수정',
      '공지사항 메뉴 신규 추가 — 더보기에서 서비스 안내/공지 확인 가능',
      '새 공지 등록 시 대시보드 접속 화면에 안내 팝업 노출',
    ],
  },
  {
    version: 'v1.0.1',
    date: '2026.6.30',
    description: [],
    items: [
      '자산 추가/수정 다이얼로그 UI 개선 — 입력 간격 축소, 한 화면에 모두 표시',
      '자산 카드 레이아웃 간소화 — 수량·평가금액·손익 2줄 구성으로 더 많은 종목 표시',
      '종목명·티커·계좌 배지 한 줄 인라인 배치, 국내주식 종목코드 숨김',
      '자산 수정 화면에 현재 총 보유수량 표시',
      '거래 추가 다이얼로그 UI 개선 — 공백 최소화',
      '거래내역 무한스크롤 오작동 버그 수정',
      "'의견관리' UI 개선 - 관리자 답변 기능 구현",
      '자산, 기록 페이지 하단 수정/삭제기능 안내문구 추가',
      '더보기 개발자 노트 추가',
      '자산 추가시 계좌 구분 추가',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026.6.22',
    description: [
      'FIREPATH Beta',
      '현재 FIREPATH는 베타 테스트 기간입니다.',
      '기능 개선과 안정성 향상을 위해 지속적으로 업데이트를 진행하고 있습니다.',
      "사용 중 불편한 점이나 버그, 개선 아이디어가 있다면 '의견 관리'를 통해 언제든 알려주세요.",
      '보내주신 소중한 의견은 검토 후 적극적으로 반영하겠습니다.',
      '감사합니다.',
    ],
    items: [],
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
      <div v-if="note.description?.length" class="note-desc mb-2">
        <p v-for="(line, i) in note.description" :key="i" :class="i === 0 ? 'note-desc-title' : 'text-body-2'">{{ line }}</p>
      </div>
      <ul v-if="note.items.length" class="note-list">
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

.note-desc {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.note-desc-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  margin-bottom: 4px;
}

.note-desc p {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.75);
  line-height: 1.6;
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
