# BUDGET_TABLE.md

가계부(budget) 모듈 Supabase 테이블 스키마. 네이밍 규칙 등 전체 맥락은 **BUDGET.md** 참고.

마이그레이션: `supabase/migrations/20260705_01_budget_tables.sql`. 모두 KRW 전용(통화 구분 없음), `type`은 Postgres enum 대신 `text + CHECK`로 단순화. `public` 스키마 관례대로 RLS 적용.

#### budget_categories

수입/지출 카테고리. 사용자가 직접 추가·수정·삭제 가능. 최초 가계부 진입 시(카테고리 0개일 때) 기본 세트가 자동 시딩된다 (`src/utils/budgetDefaultCategories.ts`).

| 컬럼명     | 타입        | 설명                    |
| ---------- | ----------- | ----------------------- |
| id         | uuid        | PK                      |
| user_id    | uuid        | FK → auth.users         |
| type       | text        | INCOME \| EXPENSE       |
| name       | text        | 카테고리명              |
| icon       | text        | 이모지                  |
| sort_order | int8        | 정렬 순서               |
| created_at | timestamptz |                         |
| updated_at | timestamptz |                         |

**RLS 정책 (budget_categories 테이블):** 본인 데이터만 select/insert/update/delete (`auth.uid() = user_id`). 관리자 조회 정책은 아직 없음.

#### budget_entries

개별 수입/지출 내역.

| 컬럼명         | 타입        | 설명                                              |
| -------------- | ----------- | -------------------------------------------------- |
| id             | uuid        | PK                                                  |
| user_id        | uuid        | FK → auth.users                                    |
| category_id    | uuid        | FK → budget_categories (`ON DELETE RESTRICT`)      |
| type           | text        | INCOME \| EXPENSE (조회 편의상 카테고리에서 비정규화) |
| amount         | numeric     | 금액                                                |
| payment_method | text (nullable) | 결제수단 (자유 텍스트, 별도 테이블 없이 최근 입력값 자동완성으로 처리 예정) |
| memo           | text (nullable) | 메모                                              |
| entry_date     | date        | 날짜                                                |
| created_at     | timestamptz |                                                     |
| updated_at     | timestamptz |                                                     |

`category_id`가 `RESTRICT`라서 내역이 하나라도 걸린 카테고리는 삭제할 수 없다 (삭제 시 Postgres 에러 코드 `23503`로 확인, `BudgetCategoryView.vue`에서 사용자에게 안내 메시지 표시).

**RLS 정책 (budget_entries 테이블):** 본인 데이터만 select/insert/update/delete.

#### budget_favorites

즐겨찾기 (자주 쓰는 내역을 템플릿으로 저장, 수동 등록). "최근 사용 항목"은 별도 테이블 없이 `budget_entries`를 최신순 distinct 조회해서 처리.

| 컬럼명         | 타입        | 설명                                    |
| -------------- | ----------- | ---------------------------------------- |
| id             | uuid        | PK                                       |
| user_id        | uuid        | FK → auth.users                         |
| category_id    | uuid        | FK → budget_categories (`ON DELETE CASCADE`) |
| type           | text        | INCOME \| EXPENSE                       |
| amount         | numeric     | 금액                                     |
| payment_method | text (nullable) |                                       |
| memo           | text (nullable) |                                       |
| sort_order     | int8        | 정렬 순서                                |
| created_at     | timestamptz |                                          |

**RLS 정책 (budget_favorites 테이블):** 본인 데이터만 select/insert/update/delete.
