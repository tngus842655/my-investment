-- GLOBALIZATION.md 사용자 단계 4 — investment_goals에 base_currency / locale 추가 (2026-07-11 Supabase에서 실행 완료)

ALTER TABLE investment_goals
  ADD COLUMN IF NOT EXISTS base_currency currency_enum NOT NULL DEFAULT 'KRW',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'ko'
    CHECK (locale IN ('ko', 'en', 'ja', 'zh'));
