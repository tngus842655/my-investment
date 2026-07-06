<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const notes = [
  {
    version: 'v1.0.5',
    date: '2026.7.4',
    description: [],
    items: [
      '앱 전체 로딩 속도 개선 — 탭을 이동해도 목표/자산/보유종목 정보를 다시 불러오지 않도록 개선',
      '홈·자산·기록·예측 화면에서 아래로 당겨서 새로고침 기능 추가',
      '보유자산 화면 상단 새로고침 버튼 제거 (당겨서 새로고침으로 대체)',
      '스와이프로 연 수정/삭제 버튼이 아무 곳이나 눌러도 닫히도록 개선',
      '보유자산·거래내역 화면 스와이프 카드 모서리에 버튼 색이 비쳐 보이던 문제 수정',
      '보유자산 화면 카드 폰트와 하단 안내문구를 거래내역 화면과 통일',
      '더보기 > 화면 설정 메뉴 신설 — 글자 크기를 75%~150%까지 조절 가능',
      '당겨서 새로고침 시 짧은 진동 피드백 추가 (Android만 지원)',
      '예측 화면 "연도별 예상자산 추이"에서 올해 목표를 퍼센트 대신 금액으로 표시',
      '자산성장리포트 차트에 올해 목표 금액 표시, 안내 문구 개선',
      '보유자산 요약 카드 레이아웃 개선 — 글자를 크게 설정해도 깨지지 않도록 보강',
    ],
  },
  {
    version: 'v1.0.4',
    date: '2026.7.3',
    description: [],
    items: [
      '포트폴리오 분석에 "종목 비교" 기능 추가 — 보유 종목 최대 4개를 선택해 평가금액 비중과 수익률을 한눈에 비교',
      '보유자산 화면에 자산군별 시세 갱신(지연/실시간) 안내와 적용환율 표시 추가',
      '보유자산 화면에서 미국주식 한글표기명 등록을 요청할 수 있는 링크 추가',
      '자산성장리포트 차트 기준선을 올해 목표로 변경, 목표 달성률이 낮을 때 막대가 눌려 보이던 문제 수정',
      '자산성장리포트 일별 상세에서 매월 1일 증감이 항상 "-"로 표시되던 문제 수정',
      '배당캘린더에서 여러 계좌에 나눠 보유한 종목의 배당 일정이 중복 표시되던 문제 수정',
      '배당캘린더, 거래내역 등에서 긴 종목명이 화면을 벗어나지 않도록 말줄임 처리',
    ],
  },
  {
    version: 'v1.0.3',
    date: '2026.7.2',
    description: [],
    items: ['로그인 화면에 홈 화면 추가 안내 배너 추가 (iOS/Android — 한 번 닫으면 다시 표시되지 않음)', '거래내역 카드에 달러 거래 금액과 함께 원화 환산액 표기', '거래내역 화면 진입 시 최근 거래가 있는 월을 기본 필터로 자동 선택해 가독성 개선', '거래내역 카드에서 누락됐던 계좌명 배지 복원'],
  },
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
        <div class="font-weight-bold">개발자 노트</div>
        <div class="text-medium-emphasis">업데이트 내역</div>
      </div>
    </div>

    <div v-for="note in notes" :key="note.version" class="release-card glass-card pa-4 mb-3">
      <div class="d-flex align-center ga-2 mb-3">
        <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold">{{ note.version }}</v-chip>
        <span class="release-date">{{ note.date }}</span>
      </div>
      <div v-if="note.description?.length" class="note-desc mb-2">
        <p v-for="(line, i) in note.description" :key="i" :class="i === 0 ? 'note-desc-title' : ''">{{ line }}</p>
      </div>
      <ul v-if="note.items.length" class="note-list">
        <li v-for="(item, i) in note.items" :key="i">{{ item }}</li>
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
  font-size: 0.9375rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  margin-bottom: 4px;
}

.note-desc p {
  margin: 0;
  font-size: 0.875rem;
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
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
  line-height: 1.5;
}

.release-date {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
}
</style>
