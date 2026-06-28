-- investment_goals에 사용자 환경설정 컬럼 추가
ALTER TABLE investment_goals
  ADD COLUMN IF NOT EXISTS theme           text DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS portfolio_sort  text DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS hide_asset      boolean DEFAULT false;
