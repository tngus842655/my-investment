-- iOS 홈 화면 앱(standalone PWA)에서 SNS 로그인 시 인앱 브라우저(오버레이)와
-- 앱 본체 간 세션 전달용 일회성 티켓.
-- iOS는 standalone에서 외부 도메인(OAuth)으로 나가면 별도 인앱 브라우저를 띄우는데,
-- 이 브라우저와 홈 화면 앱은 저장소를 공유하지 않아 로그인 세션이 앱 본체로 전달되지 않는다.
-- 오버레이(로그인된 세션)가 nonce와 함께 토큰을 insert하고, 앱 본체가 오버레이가 닫힐 때
-- claim_oauth_handoff(nonce)로 회수(조회+삭제)하여 setSession으로 로그인을 복원한다.
-- nonce는 클라이언트에서 생성한 128비트 랜덤 hex, TTL 2분, 1회용.
CREATE TABLE oauth_handoff (
  nonce text PRIMARY KEY,
  refresh_token text NOT NULL,
  access_token text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE oauth_handoff ENABLE ROW LEVEL SECURITY;

-- 로그인된 사용자가 본인 세션의 티켓을 만드는 것만 허용. select/update/delete 정책은
-- 만들지 않는다 — 회수는 아래 SECURITY DEFINER RPC로만 가능.
CREATE POLICY "authenticated_insert_own_handoff"
  ON oauth_handoff FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 앱 본체(아직 비로그인 = anon)가 nonce로 티켓을 회수한다. 반환과 동시에 삭제(1회용).
-- 2분이 지난 티켓은 회수 불가하며, 호출 시마다 만료 티켓을 함께 정리한다.
CREATE OR REPLACE FUNCTION claim_oauth_handoff(p_nonce text)
RETURNS TABLE (refresh_token text, access_token text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM oauth_handoff WHERE created_at < now() - interval '2 minutes';

  RETURN QUERY
  DELETE FROM oauth_handoff o
  WHERE o.nonce = p_nonce
  RETURNING o.refresh_token, o.access_token;
END;
$$;
