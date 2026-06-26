-- login_log 테이블 생성
CREATE TABLE IF NOT EXISTS login_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  login_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE login_log ENABLE ROW LEVEL SECURITY;

-- 본인 INSERT만 허용
CREATE POLICY "login_log: 본인 insert" ON login_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 관리자만 SELECT 허용
CREATE POLICY "login_log: 관리자 select" ON login_log
  FOR SELECT TO authenticated
  USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'tngus842655@gmail.com'
  );

-- 최신 접속 이력 인덱스
CREATE INDEX IF NOT EXISTS login_log_login_at_idx ON login_log (login_at DESC);
