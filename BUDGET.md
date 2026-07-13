# BUDGET.md

가계부(budget) 모듈 관련 문서. CLAUDE.md의 가계부 버전 — 새 세션 시작 시 함께 읽을 것.

## 개요

Fire Path의 서브 기능으로 추가하는 가계부. 자산관리(기존 메인 기능)와 로그인 세션은 공유하지만, 기능·데이터·화면은 완전히 독립된 별개 모듈이다.

- FIRE 목표 설정(`investment_goals`, `requiresGoal` 가드)과 무관하게 동작한다.
- 진입은 `HubView`(`/hub`)에서 "자산관리"/"가계부" 중 선택하는 방식. 최초 로그인 시에만 자동 진입시키고, 이후엔 마지막 사용 모듈로 바로 이동 + 허브로 가는 버튼 상시 노출.
- 가계부는 정식 오픈되어 로그인한 모든 사용자가 접근 가능하다 (이전엔 `BUDGET_PREVIEW_EMAILS`로 일부 계정만 미리보기 허용했으나 해당 제한은 제거됨).

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
- [x] 캘린더 화면(`BudgetCalendarView.vue`, `/budget`) — 캘린더/일일/월별 서브탭(내부 `v-btn-toggle`), 월·연도 이동, 수입/지출/합계 요약, FAB로 내역 추가, 항목 클릭 시 수정 다이얼로그. 삭제 UI는 아직 없음(추후 스와이프 등으로 추가 예정)
- [x] 통계 화면(`BudgetStatsView.vue`, `/budget/stats`) — 카테고리별 도넛 차트 + 범례(자산관리 `PortfolioAnalysisView`와 동일한 SVG 방식 재사용), 수입/지출 토글, 월 이동
- [x] `BudgetLayout` 하단 탭 실연결: 캘린더/통계/더보기(더보기는 임시로 `/budget/categories`를 가리킴 — 6단계에서 실제 더보기 화면으로 교체 예정). `HubView`의 "가계부" 카드도 `/budget`로 연결(더 이상 "준비 중" 아님)
- [x] 로그인 후 허브 자동 진입 흐름 — `src/utils/lastModule.ts`(localStorage `fp-last-module`)에 마지막으로 방문한 모듈을 라우터 `afterEach`에서 자동 기록(`AssetLayout`/`BudgetLayout` 부모 라우트에 `meta: { module: 'asset' | 'budget' }` 부여). 로그인 시 기록이 없으면 `/hub`, `asset`/`budget`이면 해당 모듈로 바로 이동. 허브 접근 버튼은 `MoreView`("다른 서비스" 섹션 "서비스 홈")와 `BudgetCalendarView` 헤더에 상시 노출
- [x] 결제수단을 카테고리와 동일한 방식(FK)으로 전환: `budget_payment_methods` 테이블 신설, `budget_entries`/`budget_favorites.payment_method`(text) → `payment_method_id`(FK, `SET NULL`)로 변경. 기본값(현금/카드) 자동 시딩, 다이얼로그에서 칩 선택 + "+ 추가"로 즉석 등록 (`supabase/migrations/20260705_02_budget_payment_methods.sql`)
- [x] 더보기 화면(`BudgetMoreView.vue`, `/budget/more`) + 검색(`BudgetSearchView.vue`, `/budget/search`) — 더보기에서 카테고리 관리/검색/공용 화면(공지사항·피드백·개발자노트·비밀번호변경·화면설정)·서비스 홈·로그아웃 제공. 공용 화면들은 `src/views/shared/`의 동일 컴포넌트를 `/budget/*` 경로로 재라우팅(뒤로가기가 `router.back()`이라 별도 수정 없이 재사용 가능했음). `BudgetLayout` 더보기 탭을 `/budget/more`로 정식 연결. 검색은 최근 500건 내에서 메모/카테고리명/결제수단명 클라이언트 필터링
- [x] 목록에서 내역 삭제 UI — `BudgetCalendarView`(일일 목록)와 `BudgetSearchView`(검색 결과)에 자산관리 거래내역과 동일한 좌측 스와이프(수정/삭제 버튼 노출) 방식 적용, 삭제 시 확인 다이얼로그 표시. 스와이프 로직은 프로젝트 관례대로 화면마다 복제(공용 컴포저블화 안 함)
- [x] 캘린더에서 날짜 선택 시 해당 날짜 내역 인라인 표시 + 그 날짜로 내역 추가 시 날짜 기본값 자동 설정 (`BudgetEntryAddDialog`의 `defaultDate` prop)
- [x] 관리 화면 통합(`BudgetManageView.vue`, `/budget/manage`) — 더보기 메뉴 하나("관리")에서 카테고리/결제수단/즐겨찾기를 탭으로 전환. `BudgetCategoryView`/`BudgetPaymentMethodView`는 자체 헤더 없는 탭 콘텐츠로 전환, `BudgetFavoriteView` 신규 추가(즐겨찾기 목록 조회/추가/수정/삭제, 유형·카테고리·금액·결제수단·메모 입력). 기존 `/budget/categories`, `/budget/payment-methods` 개별 라우트는 제거
- [x] 하단 탭·헤더 아이콘을 커스텀 PNG로 통일 — 캘린더(`icon-calendar.png`)/통계(`icon-stats.png`)/더보기(`icon-more.png`), 각 화면 우측 상단에 허브 이동 아이콘(`icon-hub.png`) 추가. 자산관리 대시보드도 동일 패턴으로 `icon-dashboard.png` + "대시보드" 제목/설명으로 교체(기존 `icon-home.png`·와이드 로고 방식 제거)
- [x] **가계부 접근 제한**: `BUDGET_PREVIEW_EMAILS`/`isBudgetPreviewAllowed`(`src/config/admin.ts`) 신설, `HubView` 가계부 카드 비활성화 처리 + `/budget` 라우트에 `requiresBudgetPreview` 가드 추가. 별도로 관리자 판별도 `ADMIN_EMAIL` 단일 상수 → `ADMIN_EMAILS` 배열 + `isAdminEmail()` 헬퍼로 리팩터링(관리자 화면 전체 반영). 겸사겸사 관리자 비밀번호 재확인 로직이 하드코딩된 이메일로 로그인 시도하던 버그(`AdminSignupLogView`)도 수정
- [x] 내역추가 다이얼로그(`BudgetEntryAddDialog.vue`) 개선
  - "최근" 빠른입력 섹션 제거, 필드 순서를 날짜 → 카테고리 → 금액 → 결제수단 → 내용(메모 명칭 변경) 순으로 재배치
  - 날짜 입력을 직접 타이핑 불가한 readonly 필드로 바꾸고, 클릭 시 커스텀 캘린더 팝업(`BudgetDateCalendarCard.vue`) 오픈 — 상단 "날짜/오늘/닫기" 바 + 요일 그리드, 상단 "YYYY년 M월" 클릭 시 년/월 전용 선택 오버레이(`BudgetMonthYearCard.vue`)로 전환. `BudgetMonthYearCard`는 `BudgetCalendarView`/`BudgetStatsView` 상단의 "YYYY년 M월" 클릭 팝업에도 그대로 재사용(달만 선택, 일자 없음)
  - "즐겨찾기로 저장" 체크박스 제거 → 즐겨찾기 별 아이콘 메뉴 하단에 "즐겨찾기 관리" 항목 추가, 클릭 시 `BudgetFavoriteView`를 팝업으로 띄워 즐겨찾기 추가/수정/삭제
  - 금액 최대 100억 제한(`amountRules`), 내용(메모) 30자 제한 + 카운터 추가
- [x] 캘린더 화면(`BudgetCalendarView.vue`) 버그 수정 및 다듬기 — "월별" 블록이 `v-else`로 연결돼 있어 캘린더 탭에서 날짜 미선택 시 월별 통계가 잘못 노출되던 버그 수정(`v-else-if`로 명시), 상단 탭(캘린더/일일/월별)·통계 탭(수입/지출) 좌우 꽉 차게, 수입/지출/합계 요약 카드 및 날짜별 내역 카드 여백 축소, 통계 탭 순서를 수입→지출로 변경(기본 선택은 지출 유지)
- [x] **카테고리 `icon` 컬럼 제거** (`supabase/migrations/20260705_03_budget_categories_drop_icon.sql`) — 카테고리는 `name` 하나로만 관리, 이모지 넣고 싶으면 이름에 직접 타이핑(예: "🍚 식비"). 기존 데이터는 `icon + name`을 합쳐서 마이그레이션. 카테고리 추가/수정 화면의 이모지 선택 그리드도 제거하고 순수 텍스트 입력으로 변경
- [x] 엑셀 일괄 가져오기(`BudgetImportView.vue`, `/budget/import`, 더보기 메뉴에서 진입) — 날짜·자산(결제수단)·카테고리·내용·금액(원)·수입/지출 열이 담긴 xlsx 파일을 업로드하면 파싱 미리보기(정상/오류 건수, 새로 생성될 카테고리·결제수단) 확인 후 일괄 등록. 없는 카테고리/결제수단은 자동 생성. 파싱 라이브러리는 처음 `exceljs`로 구현했으나 문서 속성(docProps/app.xml)에 특정 필드가 없는 파일(예: 구글 시트 내보내기)에서 파싱 자체가 죽는 버그가 있어 `read-excel-file`로 교체(번들 크기도 훨씬 작음, 동적 import 유지). 엑셀 날짜 셀은 UTC 자정 기준 Date로 오므로 반드시 UTC getter로 읽을 것(로컬 getter 쓰면 타임존에 따라 하루 밀리는 버그 발생했었음)
  - "엑셀 양식 다운로드" 버튼 추가 — `read-excel-file`과 같은 저자의 `write-excel-file`(동적 import, `/browser` 서브패스 필요)로 예시 2행이 담긴 xlsx를 브라우저에서 직접 생성해 다운로드
  - 열 순서는 고정이 아니라 **제목 행(1행) 텍스트로 열을 찾음** (`findColumnIndexes`) — 순서가 바뀌어도 정상 인식. 열 이름 별칭도 일부 허용(`COLUMN_ALIASES`: 예 "자산"/"결제수단", "금액(원)"/"금액"). 제목 행에서 6개 열 중 하나라도 못 찾으면 파싱 자체를 막고 어떤 열이 빠졌는지 에러로 안내
- [x] **다국어(영어) + 기준통화 지원** (2026-07-13) — 전 화면 i18n 전환(`budget.*` 네임스페이스),
  `budget_entries`/`budget_favorites`에 `currency` 컬럼(저장 시점 기준통화 기록, 집계는 표시 시점 환산),
  기본 카테고리/결제수단 시딩 로케일 분기, 엑셀 가져오기 한/영 이중언어 인식 + 로케일별 양식.
  단계별 상세 기록은 **BUDGET_GLOBALIZATION.md** 참고
- [x] 더보기 > "데이터 관리" 섹션 — 거래내역 초기화/즐겨찾기 초기화/전체 초기화(카테고리·결제수단 포함) 3개 메뉴, 각각 비밀번호 재확인 성공 시에만 삭제 진행. 전체 초기화는 `budget_entries.category_id`가 `ON DELETE RESTRICT`라 반드시 거래내역 → 즐겨찾기 → 카테고리 → 결제수단 순서로 삭제해야 함

### `budget_entries` vs `budget_favorites` 개념 정리 (헷갈리기 쉬움)

- `budget_entries`: 실제로 있었던 수입/지출 "기록"(`entry_date` 있음). 내역추가 저장, 엑셀 가져오기 모두 최종적으로 여기 저장됨. 캘린더/통계/검색은 전부 이 테이블만 조회.
- `budget_favorites`: 거래 기록이 아니라 내역추가를 빠르게 채우기 위한 **입력 템플릿**(`entry_date` 없음). 클릭하면 폼에 값만 채워줄 뿐, 실제 저장은 사용자가 "저장" 버튼을 눌러야 `budget_entries`에 생성됨. 날짜가 없고 집계에 포함되면 안 되는 데이터라 의도적으로 테이블을 분리했다 — 합치면 "이건 기록/이건 템플릿" 구분용 플래그를 모든 조회 쿼리에 추가해야 해서 오히려 더 복잡해짐.

## 관련 문서

- **BUDGET_TABLE.md**: 가계부 테이블 스키마
- **BUDGET_GLOBALIZATION.md**: 가계부 다국가 지원(영어 버전) 작업 계획 — 사용자/Claude 단계 구분
- **TABLE.md**: 자산관리 테이블 스키마 (참고용, 가계부와는 무관)
