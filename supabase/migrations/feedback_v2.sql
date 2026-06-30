-- feedback 테이블 v2 마이그레이션
-- Supabase SQL Editor에서 실행

-- 1. 새 컬럼 추가
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS admin_comment text,
  ADD COLUMN IF NOT EXISTS is_read_by_user boolean NOT NULL DEFAULT true;

-- 2. 기존 status 값 마이그레이션
UPDATE feedback SET status = 'RECEIVED' WHERE status = 'NEW';
UPDATE feedback SET status = 'REVIEWING' WHERE status = 'CHECKED';

-- 3. status 기본값 변경
ALTER TABLE feedback ALTER COLUMN status SET DEFAULT 'RECEIVED';

-- 4. 사용자가 자신의 의견을 조회할 수 있는 RLS 정책 추가
-- (기존에 관리자 전용 SELECT 정책만 있는 경우)
CREATE POLICY "Users can read own feedback"
ON feedback FOR SELECT
USING (
  email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
);

-- 5. 사용자가 자신의 의견의 is_read_by_user를 업데이트할 수 있는 정책
CREATE POLICY "Users can update read status on own feedback"
ON feedback FOR UPDATE
USING (
  email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
)
WITH CHECK (
  email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
);
