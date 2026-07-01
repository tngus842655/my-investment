-- 공지사항 테이블 생성 (관리자만 작성, 로그인 유저 전체 조회)
CREATE TABLE IF NOT EXISTS notices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- 로그인한 모든 사용자 SELECT 허용
CREATE POLICY "notices: 로그인 유저 select" ON notices
  FOR SELECT TO authenticated
  USING (true);

-- 관리자만 INSERT 허용
CREATE POLICY "notices: 관리자 insert" ON notices
  FOR INSERT TO authenticated
  WITH CHECK (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'tngus842655@gmail.com'
  );

-- 관리자만 UPDATE 허용
CREATE POLICY "notices: 관리자 update" ON notices
  FOR UPDATE TO authenticated
  USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'tngus842655@gmail.com'
  );

-- 관리자만 DELETE 허용
CREATE POLICY "notices: 관리자 delete" ON notices
  FOR DELETE TO authenticated
  USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'tngus842655@gmail.com'
  );

-- 최신순 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS notices_created_at_idx ON notices (created_at DESC);
