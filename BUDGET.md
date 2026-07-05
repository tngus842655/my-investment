# BUDGET.md

가계부(budget) 모듈 관련 문서. CLAUDE.md의 가계부 버전 — 새 세션 시작 시 함께 읽을 것.

## 개요

Fire Path의 서브 기능으로 추가하는 가계부. 자산관리(기존 메인 기능)와 로그인 세션은 공유하지만, 기능·데이터·화면은 완전히 독립된 별개 모듈이다.

- FIRE 목표 설정(`investment_goals`, `requiresGoal` 가드)과 무관하게 동작한다.
- 진입은 `HubView`(`/hub`)에서 "자산관리"/"가계부" 중 선택하는 방식. 최초 로그인 시에만 자동 진입시키고, 이후엔 마지막 사용 모듈로 바로 이동 + 허브로 가는 버튼 상시 노출 예정 (아직 미구현, 아래 "현재 상태" 참고).

## 네이밍 규칙

기존 자산관리 코드/테이블과 섞이지 않도록 `budget` 접두사로 통일한다.

| 구분 | 규칙 | 예시 |
| --- | --- | --- |
| 화면 폴더 | `src/views/budget/` | `src/views/budget/BudgetDashboardView.vue` |
| 라우터 | `src/router/budget.routes.ts`에 모아서 `index.ts`에 merge | `/budget`, `/budget/entries` |
| DB 테이블 | `budget_` 접두사 | `budget_categories`, `budget_entries` |
| 상태관리/서비스/타입 | 기존 프로젝트 관례(폴더 분리 없이 파일명 접두사)를 따름 | `src/stores/budgetData.ts` |

기존 `transactions`(매수/매도) 테이블과 이름이 겹치지 않도록 가계부 거래 내역은 `budget_entries`로 명명한다.

## 현재 상태 (구조만 정의된 단계)

- [x] `src/views/asset/`, `src/views/shared/` 분리 — 자산관리 전용 화면과 여러 모듈에서 재사용 가능한 공용 화면(계정설정/피드백/공지사항 등) 구분
- [x] `src/views/HubView.vue` — 자산관리/가계부 선택 화면, `/hub` 라우트로 등록 (`requiresAuth`만 적용, `requiresGoal` 없음)
- [x] `src/views/budget/`, `src/router/budget.routes.ts` — 빈 스텁만 생성
- [x] `src/layouts/AppLayout.vue` → `AssetLayout.vue` 리네이밍 + `src/layouts/BudgetLayout.vue` 뼈대 생성 (탭 구성은 화면 확정 후 채울 것)
- [x] 기능 범위 확정: 캘린더(메인)/일일/월별/통계 유지, 메모·예산관리·복잡한 리포트는 제외. 결제수단 필드 포함, 카테고리 사용자 커스텀 가능, 즐겨찾기(수동)+최근사용(자동) 구분
- [x] `budget_categories`/`budget_entries`/`budget_favorites` 테이블 생성 (`supabase/migrations/20260705_01_budget_tables.sql`) — 상세는 **BUDGET_TABLE.md**
- [x] 카테고리 관리 화면(`BudgetCategoryView.vue`, `/budget/categories`) + 기본 카테고리 자동 시딩
- [x] 내역 추가/수정 다이얼로그(`BudgetEntryAddDialog.vue`) — 수입/지출 토글, 카테고리/금액/결제수단/메모/날짜, 즐겨찾기·최근사용 칩 원클릭 채우기, "즐겨찾기로 저장" 체크박스. 삭제는 다이얼로그가 아니라 목록 화면(스와이프 카드 등, 캘린더/일일 화면 구현 시)에서 처리 예정 — 자산관리 거래내역과 동일한 패턴
- [ ] 로그인 후 허브로 자동 진입시키는 흐름 (최초 1회 vs 마지막 사용 모듈 기억) — 미구현
- [ ] 캘린더/통계 화면
- [ ] 더보기 화면 + 검색

## 관련 문서

- **BUDGET_TABLE.md**: 가계부 테이블 스키마
- **TABLE.md**: 자산관리 테이블 스키마 (참고용, 가계부와는 무관)
