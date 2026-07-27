-- 토스 로그인 계정 매핑
-- 토스가 주는 userKey(앱 단위 고유 식별자)와 앱 계정을 1:1로 연결한다.
-- 이메일만으로 매칭하면 유저가 토스 프로필 이메일을 바꿨을 때 같은 사람에게 계정이
-- 하나 더 생기므로, userKey를 1순위 식별자로 둔다.
CREATE TABLE IF NOT EXISTS toss_identities (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  toss_user_key text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE toss_identities ENABLE ROW LEVEL SECURITY;

-- 본인 매핑 SELECT만 허용. INSERT/UPDATE 정책을 두지 않아 Edge Function(service_role)
-- 경로로만 기록된다.
CREATE POLICY "toss_identities: 본인 select" ON toss_identities
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "toss_identities: 관리자 select" ON toss_identities
  FOR SELECT TO authenticated
  USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'tngus842655@gmail.com'
  );
