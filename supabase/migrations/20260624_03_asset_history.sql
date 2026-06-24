-- 자산 히스토리 테이블
CREATE TABLE IF NOT EXISTS asset_history (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recorded_at   date NOT NULL DEFAULT CURRENT_DATE,
  current_asset bigint NOT NULL,
  progress_pct  float8 NOT NULL,
  UNIQUE (user_id, recorded_at)
);

ALTER TABLE asset_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 데이터만 접근" ON asset_history
  FOR ALL USING (auth.uid() = user_id);

-- 매일 자산 스냅샷 저장 함수
CREATE OR REPLACE FUNCTION save_daily_asset_snapshot()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO asset_history (user_id, recorded_at, current_asset, progress_pct)
  SELECT
    a.user_id,
    CURRENT_DATE,
    a.current_asset,
    ROUND((a.current_asset::float8 / g.target_asset * 100)::numeric, 2)
  FROM asset_summary a
  JOIN investment_goals g ON g.user_id = a.user_id
  WHERE a.current_asset > 0
  ON CONFLICT (user_id, recorded_at) DO UPDATE
    SET current_asset = EXCLUDED.current_asset,
        progress_pct  = EXCLUDED.progress_pct;
END;
$$;

-- 매일 자정 KST (UTC 15:00) Cron Job
SELECT cron.schedule(
  'daily-asset-snapshot',
  '0 15 * * *',
  'SELECT save_daily_asset_snapshot();'
);
