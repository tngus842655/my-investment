# BUDGET_TABLE.md

가계부(budget) 모듈 Supabase 테이블 스키마. 아직 생성된 테이블이 없다 — 기능 설계 확정 후 이 문서에 기록한다.

네이밍 규칙 등 전체 맥락은 **BUDGET.md** 참고.

## 예정 테이블 (미생성)

- `budget_categories` — 수입/지출 카테고리
- `budget_entries` — 개별 수입/지출 내역 (자산관리의 `transactions`와 이름 충돌 방지)

컬럼 설계는 가계부 기능 목록이 확정되는 대로 이어서 작성한다.
