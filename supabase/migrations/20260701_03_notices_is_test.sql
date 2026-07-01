-- 공지사항 테스트 모드: 체크 시 실제 사용자에게는 안 보이고 관리자만 확인 가능
ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- SELECT 정책을 테스트 공지 필터링 포함하도록 교체
DROP POLICY IF EXISTS "notices: 로그인 유저 select" ON notices;

CREATE POLICY "notices: 로그인 유저 select" ON notices
  FOR SELECT TO authenticated
  USING (
    is_test = false
    OR (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'tngus842655@gmail.com'
  );
