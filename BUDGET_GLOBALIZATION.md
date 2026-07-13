# BUDGET_GLOBALIZATION.md — 가계부 다국가 지원(영어 + 기준통화) 계획

가계부(budget) 모듈에 영어(en)와 기준통화를 함께 도입하기 위한 작업 계획. 자산관리 다국가 지원
(**GLOBALIZATION.md**)과 동일한 진행 방식 — 사용자 단계와 Claude 단계를 나누고, 실행 시 이 문서의
단계 번호로 지시한다.

작성일: 2026-07-13. 사전 조사: 가계부 파일 16개(뷰 15개 + `BudgetLayout.vue`) 전부 i18n 미적용,
한글 포함 줄 합계 약 320줄. i18n 인프라(vue-i18n, `useLocale`, `dateFormat.ts`, `date.weekdays`)와
통화 인프라(`useBaseCurrency`, `formatMoneyIn`, `convertMoney`, `getCachedRate`)는 자산관리 때 완성된
것을 그대로 재사용 — 새 인프라 작업 없음.

**진행 상태** (완료 시 여기에 기록):

- ✅ 사용자 단계 0 (범위 확정) — 2026-07-13 **2안(기준통화 포함) 확정**. "문구만 번역하면 반쪽"이라는
  보류 사유를 해소하는 방향으로 진행.
- ✅ Claude 단계 1 (통화 컬럼 + 저장 경로) — 2026-07-13 완료.
  마이그레이션 `20260713_01_budget_currency.sql` 작성(두 테이블에 currency 추가 + KRW 백필, → 사용자 1 실행 대기).
  insert 경로 3곳(내역추가 다이얼로그/즐겨찾기 추가/엑셀 가져오기)에 `currency: baseCurrency` 기록 —
  각 경로에서 `ensureGoals()`를 await해 기준통화 미동기화 상태(가계부는 goals를 안 읽음)에서의 오기록 방지.
  **수정(update) 시에는 통화를 보존**(기준통화 변경 후 옛 내역 편집 시 통화 오염 방지).
  select 4곳(캘린더 2/검색/통계) 컬럼 목록과 로컬 EntryRow/FavoriteRow 타입에 currency 추가.
  `BudgetLayout` 진입 시 `ensureGoals()` 호출 추가(표시·환산이 기준통화를 따르도록 동기화 진입점).
  검증: vue-tsc --build 통과. ⚠️ 이 커밋의 main 배포는 **사용자 1(SQL 실행) 이후**에 할 것 —
  currency 컬럼이 없는 DB에 insert하면 에러남.

---

## 통화 설계 (확정 전제)

자산관리와 달리 가계부는 시세 조회·다중 통화 보유 개념이 없어 통화 도입이 훨씬 단순하다.
핵심 원칙: **내역 1건 = 통화 1개, 저장 시점의 기준통화로 기록, 표시 시점에 현재 기준통화로 환산.**

1. **저장**: `budget_entries`/`budget_favorites`에 `currency currency_enum NOT NULL DEFAULT 'KRW'` 추가.
   insert 시 현재 기준통화(`investment_goals.base_currency`, 없으면 KRW)를 기록. 기존 행은 DEFAULT로
   KRW 백필 — 현재 데이터가 전부 원화라 의미 그대로.
2. **내역별 통화 선택 UI는 넣지 않는다** (가정 — 필요해지면 추후). 사용자는 자기 기준통화로만 입력하므로
   금액 필드는 지금과 동일하게 숫자 하나. UI 변화 없음.
3. **표시·집계**: 캘린더/일일/월별 요약, 통계 도넛, 검색 합계는 행별 `currency`를 표시 시점 환율
   (`getCachedRate`, USD 허브·1시간 캐시)로 현재 기준통화로 환산 후 합산 — 자산관리 `asset_history`
   표시 방식과 동일. 전 행이 기준통화와 같으면(대부분의 사용자) 환산은 항등이라 **기존 한국 사용자
   화면은 숫자 하나 안 바뀐다.**
4. **기준통화 변경 시**: 자산관리 목표 금액처럼 일괄 환산하지 않는다. 행별 `currency`가 보존되므로
   원본 그대로 두고 표시만 환산 — 확인 다이얼로그(2-4 정책) 불필요, 데이터 원본 훼손 없음.
5. **포맷**: 금액 표기를 `formatMoneyIn(value, currency)` 계열로 통일 (KRW ₩/원, USD $).
   금액 입력 상한(현 100억)은 통화별 상수로 분리 (KRW 100억 / USD 1,000만 등).
6. **엑셀 가져오기**: 가져온 행의 통화 = 가져오기 시점의 기준통화. 열 이름 "금액(원)"은 "금액"/"Amount"로
   일반화(기존 별칭에 이미 "금액" 있음).

---

## 사용자가 할 일

| 단계 | 내용 | 시점 |
| --- | --- | --- |
| ~~사용자 0~~ | ~~범위 확정~~ — ✅ 2안 확정 | 완료 |
| 사용자 1 | **SQL 실행** — Claude 단계 1에서 작성하는 마이그레이션(`budget_entries`/`budget_favorites`에 `currency` 추가 + KRW 백필)을 Supabase SQL Editor에서 실행, 검증 쿼리 확인 | Claude 단계 1 직후, 단계 2 착수 전 |
| 사용자 2 | 통화 검증 — 기존 한국 계정으로 캘린더/통계/검색 금액이 기존과 동일한지 확인 (환산 항등 확인) | Claude 단계 2 완료 후 |
| 사용자 3 | 용어 감수 — 영어 용어표(가계부/내역/즐겨찾기/결제수단 등) 초안 확인. 이상 없으면 그대로 진행 | Claude 단계 3 직후 |
| 사용자 4 | 중간 검증 — 메인 화면(캘린더/일일/월별/통계) English 전환 상태로 실기기 확인 | Claude 단계 4 완료 후 |
| 사용자 5 | 시딩 검증 — 새 테스트 계정(또는 가계부 전체 초기화 후) + English + 기준통화 USD 상태로 최초 진입: 기본 카테고리/결제수단이 영어로 시딩되고 입력 금액이 $로 표기되는지 확인 | Claude 단계 6 완료 후 |
| 사용자 6 | 엑셀 검증 — English 상태에서 양식 다운로드 → 영문 헤더 확인 → 가져오기 성공 확인. 기존 한글 엑셀 파일도 여전히 가져와지는지 확인 | Claude 단계 7 완료 후 |
| 사용자 7 | 최종 통합 검증 후 main 배포(직접) | 전체 완료 후 |

CLAUDE.md 지침상 Claude는 스크린샷 검증을 하지 않으므로(`vue-tsc` + 코드 리뷰까지만), 화면 확인은 전부
사용자 몫. Edge Function 변경은 없음(환율은 기존 `exchange-rate` 함수·캐시 재사용).

---

## Claude가 할 일

각 단계 공통 검증: `./node_modules/.bin/vue-tsc --build` 통과 후 커밋(한글 커밋 메시지).
마지막 단계에서 `npm run build`까지 확인.

### Claude 단계 1 — 통화 컬럼 + 저장 경로 (마이그레이션 파일 작성 포함)

- `supabase/migrations/20260713_01_budget_currency.sql` 작성: 두 테이블에
  `currency currency_enum NOT NULL DEFAULT 'KRW'` 추가 (+ 검증 쿼리 주석). → **사용자 1이 실행.**
- 프론트 타입(`BudgetEntry` 등)에 `currency` 추가, 모든 insert 경로에 현재 기준통화 기록:
  내역추가 다이얼로그, 즐겨찾기 추가/수정, 엑셀 가져오기. select 경로에 `currency` 컬럼 추가.
- 이 단계까지는 표시 변화 없음(저장만). 사용자 1 실행 전 배포되어도 안전하도록 컬럼 부재 시를
  고려할 필요는 없음 — 단계 1 커밋은 사용자 1 실행 후 배포가 전제(main 배포는 어차피 사용자 몫).

### Claude 단계 2 — 표시·집계 환산 + 통화 포맷

- 캘린더/일일/월별 요약, 날짜별 그룹 합계, 통계 도넛·범례, 검색 결과 합계를 행별 `currency` →
  현재 기준통화 환산 후 합산으로 교체 (`convertMoney` + `getCachedRate`).
- 금액 표기를 `formatMoneyIn` 계열로 통일. 금액 입력 상한을 통화별 상수로 분리(`amountRules`),
  키패드(`BudgetAmountKeypad`) 표기 확인.
- 기준통화가 KRW인 계정에서 기존과 문자열 단위로 동일한 출력이 나오는지 코드 레벨로 대조.

### Claude 단계 3 — 로케일 키 골격 + 공용 소형 컴포넌트

- `ko.json`/`en.json`에 `budget.*` 네임스페이스 신설(`budget.nav`/`calendar`/`stats`/`entry`/
  `manage`/`more`/`search`/`import`/`common`) — 자산관리 관례와 동일.
- 영어 용어표 확정 제안(→ 사용자 3 감수): 가계부=Budget, 내역=Entry, 수입/지출=Income/Expense,
  결제수단=Payment Method, 즐겨찾기=Favorites, 관리=Manage 등.
- 소형 파일 전환: `BudgetLayout.vue`(하단 탭), `BudgetManageView.vue`(탭 라벨),
  `BudgetAmountKeypad.vue`, `BudgetCategoryGridPicker.vue`.
- 날짜 팝업 전환: `BudgetMonthYearCard.vue`/`BudgetDateCalendarCard.vue` — "YYYY년 M월"을
  `formatYearMonth`로, 요일은 `date.weekdays` 키로. `BudgetMonthYearCard`는 캘린더/통계/내역추가
  3곳에서 재사용되므로 먼저 처리.
- 참고: `budget.routes.ts`의 `meta.label`은 관리자 접속기록 화면(한국 운영자 전용) 표시용이라
  **번역하지 않고 한글 유지** (자산관리 라우트와 동일 정책).

### Claude 단계 4 — 메인 화면 (캘린더 + 통계)

- `BudgetCalendarView.vue`(한글 57줄, 최대 화면): 서브탭, 수입/지출/합계 라벨, "N년 M월"/"N요일",
  삭제 확인 다이얼로그, 스와이프 버튼, 빈 상태 문구, showMessage 문구.
- `BudgetStatsView.vue`(14줄): 수입/지출 토글, 도넛 범례, 월 표기.
- `BudgetPanelTopbar.vue`는 props 기반(한글 0줄)이라 호출부 문자열만 키로 교체.

### Claude 단계 5 — 입력·관리·더보기 화면

- `BudgetEntryAddDialog.vue`(31줄): 필드 라벨, 검증 문구(통화별 금액 상한/내용 30자), 즐겨찾기 메뉴,
  결제수단 "+ 추가".
- `BudgetFavoriteView.vue`(31줄), `BudgetCategoryView.vue`(30줄), `BudgetPaymentMethodView.vue`(24줄):
  목록/추가/수정/삭제 문구, 기본값 채우기 버튼, placeholder("예: 🍚 식비" → 로케일별 예시).
- `BudgetMoreView.vue`(27줄): 메뉴 라벨, 데이터 관리 3종 확인·비밀번호 재확인 문구.
  공용 화면 라벨은 기존 키 재사용.
- `BudgetSearchView.vue`(19줄): 검색 placeholder, 결과 없음, 스와이프/삭제 문구.

### Claude 단계 6 — 기본 데이터 시딩 로케일 분기

- `budgetDefaultCategories.ts`/`budgetDefaultPaymentMethods.ts`를 로케일 인지로 전환 —
  시딩 시점 로케일이 ko면 기존 한글("🍚 식비", 현금/카드), 그 외는 영어("🍚 Food", Cash/Card)를 DB에 저장.
- **이미 시딩된 기존 사용자 데이터는 건드리지 않는다** — 카테고리/결제수단 이름은 사용자 소유 데이터라
  번역 대상이 아님(자산관리 계좌명 '미지정' 미번역 정책과 동일).
- 시딩 호출부 전체 확인 후 일괄 적용.

### Claude 단계 7 — 엑셀 가져오기 (단일 화면 최고 난도)

`BudgetImportView.vue`(66줄) — UI 문구뿐 아니라 파싱 로직이 한글에 묶여 있음:

- `COLUMN_ALIASES`에 영문 별칭 추가(Date, Asset/Payment Method, Category, Memo/Description,
  Amount, Income/Expense 등). **한글 별칭은 유지** — 로케일 무관 한글/영문 헤더 모두 인식.
- '수입'/'지출' 셀 값 파싱에 'income'/'expense'(대소문자 무시) 추가 — 역시 양쪽 모두 인식.
- 가져온 행에 `currency` = 현재 기준통화 기록 (단계 1의 insert 경로에 이미 포함되어 있는지 재확인).
- "엑셀 양식 다운로드"를 로케일별 생성 — 헤더·예시 2행(현금/식비 → Cash/Food)을 현재 로케일로.
  금액 열 헤더는 "금액(원)" → 로케일·통화 중립 표기("금액"/"Amount")로.
- 누락 열 안내/파싱 에러/미리보기(정상·오류 건수, 신규 생성 목록) 문구 i18n 전환.
- 마무리로 `npm run build`까지 검증.

### Claude 단계 8 — 마무리 점검

- 가계부 전체 파일에 남은 하드코딩 한글 grep 스캔(주석 제외) — 잔여 0건 확인.
- BUDGET_TABLE.md에 `currency` 컬럼 반영, BUDGET.md/TODO.md 진행 기록 갱신.

---

## 작업하지 않는 것 (스코프 밖)

- 내역별 통화 선택 UI — 내역 통화는 저장 시점 기준통화로 자동 기록. 필요해지면 추후 논의.
- 기준통화 변경 시 기존 내역 금액 일괄 환산 — 행별 `currency` 보존 + 표시 시점 환산으로 대체(설계 4항).
- 기존 한글 카테고리/결제수단/메모 데이터의 번역·마이그레이션.
- 허브/공용 화면(`hub.*`, `more.*` 등) — 자산관리 때 이미 완료, 재사용만 함.
