-- GLOBALIZATION.md 사용자 단계 1 — currency_enum 확장 (2026-07-10 Supabase에서 실행 완료)
-- ⚠️ ALTER TYPE ... ADD VALUE는 트랜잭션 안에서 실행 불가. 한 줄씩 실행할 것.
ALTER TYPE currency_enum ADD VALUE IF NOT EXISTS 'JPY';
ALTER TYPE currency_enum ADD VALUE IF NOT EXISTS 'CNY';
