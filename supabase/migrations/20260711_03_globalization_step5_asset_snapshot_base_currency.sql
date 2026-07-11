-- GLOBALIZATION.md 사용자 단계 5 — asset_summary / asset_history에 base_currency 추가
-- + 일별 스냅샷 함수 교체 (2026-07-11 Supabase에서 실행 완료)

-- 5-1. 컬럼 추가
ALTER TABLE asset_summary
  ADD COLUMN IF NOT EXISTS base_currency currency_enum NOT NULL DEFAULT 'KRW';

ALTER TABLE asset_history
  ADD COLUMN IF NOT EXISTS base_currency currency_enum NOT NULL DEFAULT 'KRW';

-- 5-2. 일별 스냅샷 함수 교체 (asset_summary의 base_currency를 스냅샷에 복사)
CREATE OR REPLACE FUNCTION save_daily_asset_snapshot()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO asset_history (user_id, recorded_at, current_asset, progress_pct, base_currency)
  SELECT
    a.user_id,
    CURRENT_DATE,
    a.current_asset,
    ROUND((a.current_asset::float8 / g.target_asset * 100)::numeric, 2),
    a.base_currency
  FROM asset_summary a
  JOIN investment_goals g ON g.user_id = a.user_id
  WHERE a.current_asset > 0
  ON CONFLICT (user_id, recorded_at) DO UPDATE
    SET current_asset = EXCLUDED.current_asset,
        progress_pct  = EXCLUDED.progress_pct,
        base_currency = EXCLUDED.base_currency;
END;
$$;
