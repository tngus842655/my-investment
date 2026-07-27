-- 관리자 provider 배지에 토스 추가
--
-- 토스 계정은 Edge Function(toss-login)이 admin.createUser로 만들기 때문에
-- auth.identities에는 provider가 'email'로만 남아 이메일 가입자와 구분되지 않는다.
-- toss_identities 매핑을 UNION으로 붙여 'toss'를 함께 반환한다.
-- (기존 토스 가입자도 매핑이 이미 쌓여 있어 백필 없이 바로 반영된다.)
CREATE OR REPLACE FUNCTION admin_get_user_providers()
RETURNS TABLE(email text, providers text[])
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()) IS DISTINCT FROM 'tngus842655@gmail.com' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT u.email::text, array_agg(DISTINCT p.provider ORDER BY p.provider)
  FROM auth.users u
  JOIN (
    SELECT i.user_id, i.provider FROM auth.identities i
    UNION ALL
    SELECT t.user_id, 'toss'::text FROM toss_identities t
  ) p ON p.user_id = u.id
  GROUP BY u.email;
END;
$$;
