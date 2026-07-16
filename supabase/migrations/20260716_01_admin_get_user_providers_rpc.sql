-- 관리자 전용: 회원별 로그인 수단(provider) 목록 조회 RPC
-- auth.identities는 일반 클라이언트가 조회 불가능하므로 SECURITY DEFINER로 우회
-- 반환: 이메일별 provider 배열 (예: {email}, {google}, {kakao}, {email,kakao})
CREATE OR REPLACE FUNCTION admin_get_user_providers()
RETURNS TABLE(email text, providers text[])
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()) IS DISTINCT FROM 'tngus842655@gmail.com' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT u.email::text, array_agg(DISTINCT i.provider ORDER BY i.provider)
  FROM auth.users u
  JOIN auth.identities i ON i.user_id = u.id
  GROUP BY u.email;
END;
$$;
