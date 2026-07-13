-- BUDGET_GLOBALIZATION.md 사용자 단계 1 — 가계부에 통화 컬럼 추가
-- 내역/즐겨찾기 1건 = 통화 1개. 저장 시점의 기준통화(investment_goals.base_currency)를 기록하고,
-- 표시 시점에 현재 기준통화로 환산한다 (자산관리 asset_history와 동일한 방식).

ALTER TABLE budget_entries
  ADD COLUMN IF NOT EXISTS currency currency_enum NOT NULL DEFAULT 'KRW';

ALTER TABLE budget_favorites
  ADD COLUMN IF NOT EXISTS currency currency_enum NOT NULL DEFAULT 'KRW';

-- 기존 데이터는 전부 원화로 입력돼 있었으므로 DEFAULT 'KRW' 백필로 의미가 정확히 일치.

-- 검증: 두 쿼리 모두 0이어야 함
-- SELECT count(*) FROM budget_entries WHERE currency IS NULL;
-- SELECT count(*) FROM budget_favorites WHERE currency IS NULL;
