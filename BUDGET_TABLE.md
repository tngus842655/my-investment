# BUDGET_TABLE.md

가계부(budget) 모듈 Supabase 테이블 스키마. 네이밍 규칙 등 전체 맥락은 **BUDGET.md** 참고.

마이그레이션: `supabase/migrations/20260705_01_budget_tables.sql`, `20260705_02_budget_payment_methods.sql`, `20260705_03_budget_categories_drop_icon.sql`. 모두 KRW 전용(통화 구분 없음), `type`은 Postgres enum 대신 `text + CHECK`로 단순화. `public` 스키마 관례대로 RLS 적용.

#### budget_categories

수입/지출 카테고리. 사용자가 직접 추가·수정·삭제 가능. 카테고리가 0개면 카테고리 관리 화면(`BudgetCategoryView.vue`)에 "기본 카테고리 추가" 버튼이 노출되어, 누르면 기본 세트가 시딩된다 (`src/utils/budgetDefaultCategories.ts`) — 삭제 직후 자동으로 되살아나면 혼란스러워서 자동 시딩 대신 수동 버튼 방식으로 변경. 아이콘은 별도 컬럼 없이 `name`에 이모지를 포함해서 자유 텍스트로 입력한다 (예: "🍚 식비").

| 컬럼명     | 타입        | 설명                    |
| ---------- | ----------- | ----------------------- |
| id         | uuid        | PK                      |
| user_id    | uuid        | FK → auth.users         |
| type       | text        | INCOME \| EXPENSE       |
| name       | text        | 카테고리명 (이모지 포함 가능) |
| sort_order | int8        | 정렬 순서               |
| created_at | timestamptz |                         |
| updated_at | timestamptz |                         |

**RLS 정책 (budget_categories 테이블):** 본인 데이터만 select/insert/update/delete (`auth.uid() = user_id`). 관리자 조회 정책은 아직 없음.

#### budget_payment_methods

결제수단(현금/카드 등). 카테고리와 동일한 방식 — 사용자가 직접 추가·수정·삭제 가능, 최초 진입 시(0개일 때) 기본 세트(현금/카드) 자동 시딩 (`src/utils/budgetDefaultPaymentMethods.ts`).

| 컬럼명     | 타입        | 설명       |
| ---------- | ----------- | ---------- |
| id         | uuid        | PK         |
| user_id    | uuid        | FK → auth.users |
| name       | text        | 결제수단명 |
| sort_order | int8        | 정렬 순서  |
| created_at | timestamptz |            |

**RLS 정책 (budget_payment_methods 테이블):** 본인 데이터만 select/insert/update/delete.

#### budget_entries

개별 수입/지출 내역.

| 컬럼명            | 타입        | 설명                                              |
| ----------------- | ----------- | -------------------------------------------------- |
| id                | uuid        | PK                                                  |
| user_id           | uuid        | FK → auth.users                                    |
| category_id       | uuid        | FK → budget_categories (`ON DELETE RESTRICT`)      |
| type              | text        | INCOME \| EXPENSE (조회 편의상 카테고리에서 비정규화) |
| amount            | numeric     | 금액                                                |
| payment_method_id | uuid (nullable) | FK → budget_payment_methods (`ON DELETE SET NULL`) |
| memo              | text (nullable) | 메모                                              |
| entry_date        | date        | 날짜                                                |
| created_at        | timestamptz |                                                     |
| updated_at        | timestamptz |                                                     |

`category_id`가 `RESTRICT`라서 내역이 하나라도 걸린 카테고리는 삭제할 수 없다 (삭제 시 Postgres 에러 코드 `23503`로 확인, `BudgetCategoryView.vue`에서 사용자에게 안내 메시지 표시). `payment_method_id`는 `SET NULL`이라 결제수단을 삭제해도 기존 내역은 유지되고 결제수단만 비워진다.

**RLS 정책 (budget_entries 테이블):** 본인 데이터만 select/insert/update/delete.

#### budget_favorites

즐겨찾기 (자주 쓰는 내역을 템플릿으로 저장, 수동 등록). "최근 사용 항목"은 별도 테이블 없이 `budget_entries`를 최신순 distinct 조회해서 처리.

| 컬럼명            | 타입        | 설명                                    |
| ----------------- | ----------- | ---------------------------------------- |
| id                | uuid        | PK                                       |
| user_id           | uuid        | FK → auth.users                         |
| category_id       | uuid        | FK → budget_categories (`ON DELETE CASCADE`) |
| type              | text        | INCOME \| EXPENSE                       |
| amount            | numeric     | 금액                                     |
| payment_method_id | uuid (nullable) | FK → budget_payment_methods (`ON DELETE SET NULL`) |
| memo              | text (nullable) |                                       |
| sort_order        | int8        | 정렬 순서                                |
| created_at        | timestamptz |                                          |

**RLS 정책 (budget_favorites 테이블):** 본인 데이터만 select/insert/update/delete.
