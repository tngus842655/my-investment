-- investment_goals에 대시보드 현금자산 포함 토글 설정 컬럼 추가
ALTER TABLE investment_goals
  ADD COLUMN IF NOT EXISTS include_cash boolean DEFAULT false;
