# BUDGET_GLOBALIZATION.md — 가계부 다국가 지원(영어 버전) 계획

가계부(budget) 모듈에 영어(en) 지원을 도입하기 위한 작업 계획. 자산관리 다국가 지원(**GLOBALIZATION.md**)과
동일한 진행 방식 — 사용자 단계와 Claude 단계를 나누고, 실행 시 이 문서의 단계 번호로 지시한다.

작성일: 2026-07-13. 사전 조사 결과: 가계부 파일 16개(뷰 15개 + `BudgetLayout.vue`) 전부 i18n 미적용,
한글 포함 줄 합계 약 320줄. 인프라(vue-i18n, `useLocale`, `dateFormat.ts`, `date.weekdays` 키)는
자산관리 때 완성된 것을 그대로 재사용하므로 추가 인프라 작업 없음.

**진행 상태** (완료 시 여기에 기록):

- (아직 시작 전)

---

## 범위 결정 (사용자 단계 0) — ⚠️ 착수 전 확정 필요

TODO.md에 기록했던 보류 사유: 가계부는 **KRW 완전 고정 구조**(테이블에 통화 컬럼 없음, `amount`는 원 단위
숫자)라 문구만 번역하면 미국 사용자에게는 "입력은 원화인데 화면은 영어"인 반쪽이 된다.

선택지:

- **1안 (권장, 이 문서의 기본 전제)**: 이번 작업은 **문구 번역까지만**. 금액은 지금처럼 통화 표기 없는
  숫자(`toLocaleString`)로 유지 — 현재도 화면에 '원'/'₩' 하드코딩이 거의 없어서 번역만으로도 화면은
  자연스럽게 성립한다. 통화 개념 도입(기준통화/통화 컬럼)은 필요해지면 별도 프로젝트로 진행.
- **2안**: 자산관리처럼 기준통화 개념까지 도입. `budget_entries`/`budget_favorites`에 통화 컬럼 추가 +
  마이그레이션 + 집계/통계 환산 로직 — 범위가 수 배로 커지고 DB 변경(사용자 SQL 실행)이 생긴다.

→ **사용자 확정 결과**: (기록 대기)

아래 Claude 단계들은 전부 1안 기준. 2안으로 확정되면 단계 재설계 필요.

---

## 사용자가 할 일

DB 변경이 없는 작업이라(시딩은 클라이언트 코드, 엑셀 가져오기도 프론트 전용) 자산관리 때와 달리
**SQL 실행이나 Edge Function 재배포는 없다.** 사용자 몫은 결정과 검증뿐.

| 단계 | 내용 | 시점 |
| --- | --- | --- |
| 사용자 0 | 위 범위 결정(1안/2안) 확정 | 착수 전 |
| 사용자 1 | 용어 감수 — Claude가 단계 1에서 영어 용어표(가계부/내역/즐겨찾기/결제수단 등) 초안을 제시하면 확인. 이상 없으면 그대로 진행 | Claude 단계 1 직후 |
| 사용자 2 | 중간 검증 — 메인 화면(캘린더/일일/월별/통계) English 전환 상태로 실기기 확인 | Claude 단계 2 완료 후 |
| 사용자 3 | 시딩 검증 — 새 테스트 계정(또는 가계부 전체 초기화 후)으로 English 상태에서 최초 진입, 기본 카테고리/결제수단이 영어로 시딩되는지 확인 | Claude 단계 4 완료 후 |
| 사용자 4 | 엑셀 검증 — English 상태에서 양식 다운로드 → 영문 헤더 확인 → 그 파일로 가져오기 성공 확인. 기존 한글 엑셀 파일도 여전히 가져와지는지 확인 | Claude 단계 5 완료 후 |
| 사용자 5 | 최종 통합 검증 후 main 배포(직접) | 전체 완료 후 |

CLAUDE.md 지침상 Claude는 스크린샷 검증을 하지 않으므로(`vue-tsc` + 코드 리뷰까지만),
화면 확인은 전부 사용자 몫이다.

---

## Claude가 할 일

각 단계 공통 검증: `./node_modules/.bin/vue-tsc --build` 통과 후 커밋(한글 커밋 메시지).
마지막 단계에서 `npm run build`까지 확인.

### Claude 단계 1 — 로케일 키 골격 + 공용 소형 컴포넌트

- `ko.json`/`en.json`에 `budget.*` 네임스페이스 신설. 하위 구조는 화면 단위
  (`budget.nav`, `budget.calendar`, `budget.stats`, `budget.entry`, `budget.manage`,
  `budget.more`, `budget.search`, `budget.import`, `budget.common`) — 자산관리 관례와 동일.
- 영어 용어표 확정 제안(→ 사용자 1에서 감수): 가계부=Budget, 내역=Entry, 수입/지출=Income/Expense,
  결제수단=Payment Method, 즐겨찾기=Favorites, 관리=Manage 등.
- 소형 파일 전환: `BudgetLayout.vue`(하단 탭 4개), `BudgetManageView.vue`(탭 라벨),
  `BudgetAmountKeypad.vue`, `BudgetCategoryGridPicker.vue`.
- 날짜 팝업 전환: `BudgetMonthYearCard.vue`/`BudgetDateCalendarCard.vue` — "YYYY년 M월" 표기를
  `dateFormat.ts`의 `formatYearMonth`로, 요일은 기존 `date.weekdays` 키로 교체.
  `BudgetMonthYearCard`는 캘린더/통계/내역추가 3곳에서 재사용되므로 여기서 먼저 처리.
- 참고: `budget.routes.ts`의 `meta.label`은 관리자 접속기록 화면(한국 운영자 전용) 표시용이라
  **번역하지 않고 한글 유지** (자산관리 라우트도 동일 정책).

### Claude 단계 2 — 메인 화면 (캘린더 + 통계)

- `BudgetCalendarView.vue`(한글 57줄, 최대 화면): 캘린더/일일/월별 서브탭, 수입/지출/합계 요약,
  "N년 M월"/"N요일" 날짜 표기, 삭제 확인 다이얼로그, 스와이프 수정/삭제 버튼, 빈 상태 문구, showMessage 문구.
- `BudgetStatsView.vue`(14줄): 수입/지출 토글, 도넛 범례, 월 표기.
- `BudgetPanelTopbar.vue`는 한글 0줄(props 기반)이라 호출부 문자열만 키로 교체.

### Claude 단계 3 — 입력·관리·더보기 화면

- `BudgetEntryAddDialog.vue`(31줄): 필드 라벨(날짜/카테고리/금액/결제수단/내용), 검증 문구
  (금액 100억 제한/내용 30자), 즐겨찾기 메뉴, 결제수단 "+ 추가" 등.
- `BudgetFavoriteView.vue`(31줄), `BudgetCategoryView.vue`(30줄), `BudgetPaymentMethodView.vue`(24줄):
  목록/추가/수정/삭제 문구, "기본 카테고리 채우기" 류 버튼, placeholder("예: 🍚 식비" → 로케일별 예시).
- `BudgetMoreView.vue`(27줄): 메뉴 라벨, 데이터 관리 3종(거래내역/즐겨찾기/전체 초기화) 확인·비밀번호
  재확인 문구. 공용 화면(공지/피드백 등) 라벨은 자산관리 때 만든 기존 키 재사용.
- `BudgetSearchView.vue`(19줄): 검색 placeholder, 결과 없음, 스와이프/삭제 문구.

### Claude 단계 4 — 기본 데이터 시딩 로케일 분기

- `budgetDefaultCategories.ts`/`budgetDefaultPaymentMethods.ts`를 로케일 인지로 전환 —
  시딩 시점 로케일이 ko면 기존 한글("🍚 식비", 현금/카드), 그 외는 영어("🍚 Food", Cash/Card)를 DB에 저장.
- **이미 시딩된 기존 사용자 데이터는 건드리지 않는다** — 카테고리/결제수단 이름은 사용자 소유 데이터라
  화면 번역 대상이 아님(자산관리의 계좌명 '미지정' 미번역 정책과 동일).
- 시딩 호출부 3곳(카테고리 화면 2종 + 최초 진입) 확인 후 일괄 적용.

### Claude 단계 5 — 엑셀 가져오기 (단일 화면 최고 난도)

`BudgetImportView.vue`(66줄) — UI 문구뿐 아니라 파싱 로직이 한글에 묶여 있음:

- `COLUMN_ALIASES`에 영문 별칭 추가(Date, Asset/Payment Method, Category, Memo/Description,
  Amount, Income/Expense 등). **한글 별칭은 유지** — 로케일과 무관하게 한글/영문 헤더 모두 인식
  (영어 사용자가 한글 양식을 받는 경우 등 교차 케이스 안전).
- '수입'/'지출' 셀 값 파싱에 'income'/'expense'(대소문자 무시) 추가 — 역시 양쪽 모두 인식.
- "엑셀 양식 다운로드"를 로케일별 생성 — 헤더·예시 2행(현금/식비 → Cash/Food)을 현재 로케일로.
- 누락 열 안내/파싱 에러 문구, 미리보기(정상/오류 건수, 새로 생성될 카테고리·결제수단) 문구 i18n 전환.
- 마무리로 `npm run build`까지 검증.

### Claude 단계 6 — 마무리 점검

- 가계부 전체 파일에 남은 하드코딩 한글 grep 스캔(주석 제외) — 잔여 0건 확인.
- BUDGET.md/TODO.md 진행 기록 갱신.

---

## 작업하지 않는 것 (스코프 밖)

- 통화 개념 도입(2안) — 사용자 0에서 2안 확정 시에만 재설계.
- DB 스키마 변경 — 없음. 기존 한글 카테고리/결제수단/메모 데이터 번역·마이그레이션도 하지 않음.
- 허브/공용 화면(`hub.*`, `more.*` 등) — 자산관리 때 이미 완료, 재사용만 함.
