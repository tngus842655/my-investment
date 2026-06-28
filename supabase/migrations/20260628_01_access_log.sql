-- access_log 테이블 생성
CREATE TABLE IF NOT EXISTS access_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  page        text NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE access_log ENABLE ROW LEVEL SECURITY;

-- 본인 INSERT만 허용
CREATE POLICY "access_log: 본인 insert" ON access_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 관리자만 SELECT 허용
CREATE POLICY "access_log: 관리자 select" ON access_log
  FOR SELECT TO authenticated
  USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'tngus842655@gmail.com'
  );

-- 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS access_log_accessed_at_idx ON access_log (accessed_at DESC);
CREATE INDEX IF NOT EXISTS access_log_user_id_idx ON access_log (user_id, accessed_at DESC);
