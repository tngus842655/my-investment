-- GLOBALIZATION.md 사용자 단계 3 — transactions에 base_currency 추가 (2026-07-11 Supabase에서 실행 완료)

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS base_currency currency_enum NOT NULL DEFAULT 'KRW';
-- 기존 데이터는 전부 KRW 기준으로 저장돼 있었으므로 DEFAULT 'KRW' 백필로 의미가 정확히 일치.
-- (exchange_rate는 USD 거래에만 USD→KRW 환율로 저장돼 있음 → 그대로 유효)
