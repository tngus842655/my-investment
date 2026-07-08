-- 관리자 전용: 회원별 이메일 인증 여부 조회 RPC
-- auth.users는 일반 클라이언트가 조회 불가능하므로 SECURITY DEFINER로 우회
CREATE OR REPLACE FUNCTION admin_get_email_confirmations()
RETURNS TABLE(email text, confirmed boolean)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()) IS DISTINCT FROM 'tngus842655@gmail.com' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT u.email::text, (u.email_confirmed_at IS NOT NULL)
  FROM auth.users u;
END;
$$;
