-- 관리자 provider 배지: 토스 추가 + 'email' → 'password'
--
-- 반환값의 의미를 "가입 경로"에서 **"쓸 수 있는 로그인 수단"** 으로 바꾼다.
--   google / kakao : auth.identities 그대로
--   toss           : toss_identities 매핑이 있으면
--   password       : email identity가 있고, 토스가 만든 계정이 아닐 때
--
-- 왜 이렇게까지 하냐면 — 토스 계정은 Edge Function(toss-login)이 admin.createUser로 만든다.
-- auth 입장에서는 평범한 이메일 계정이라 provider가 'email'로 남고, encrypted_password도
-- 유저가 모르는 값으로 채워진다. 아래는 2026-07-28에 실제 DB에서 확인한 값이다.
--
--   가입 경로    | identities        | encrypted_password
--   이메일       | email             | 있음
--   구글/카카오  | google / kakao    | 비어 있음        ← OAuth는 email identity 자체가 없다
--   토스         | email             | 있음 (랜덤값으로 보인다. 빈 문자열의 해시도 아니다)
--
-- 즉 토스와 이메일 가입자는 auth 데이터만으로 구분이 불가능하다. 유일한 구분점은
-- toss_identities이고, "토스가 만든 계정"인지는 Edge Function이 계정 생성과 매핑 저장을
-- 같은 요청에서 처리한다는 점을 이용해 두 created_at 간격으로 판정한다.
-- (실측: 토스가 만든 계정 0.2초 / 기존 이메일 계정에 나중 연결 31일 — 겹칠 여지가 없다)
--
-- 한계: 토스 가입자가 웹에서 비밀번호를 재설정하면 실제로는 비밀번호 로그인이 가능해지는데
-- 그건 감지하지 못한다(배지에 password가 안 뜬다). 미니앱은 tossOnly라 비밀번호 찾기 버튼이
-- 없어서 웹까지 찾아가야 하는 드문 경로라 그대로 둔다.
CREATE OR REPLACE FUNCTION admin_get_user_providers()
RETURNS TABLE(email text, providers text[])
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()) IS DISTINCT FROM 'tngus842655@gmail.com' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.email::text,
    coalesce(
      (SELECT array_agg(DISTINCT i.provider ORDER BY i.provider)
       FROM auth.identities i
       WHERE i.user_id = u.id AND i.provider <> 'email'),
      ARRAY[]::text[]
    )
    || CASE
         WHEN EXISTS (SELECT 1 FROM toss_identities t WHERE t.user_id = u.id)
         THEN ARRAY['toss']::text[] ELSE ARRAY[]::text[]
       END
    || CASE
         WHEN EXISTS (
                SELECT 1 FROM auth.identities i
                WHERE i.user_id = u.id AND i.provider = 'email'
              )
          AND NOT EXISTS (
                SELECT 1 FROM toss_identities t
                WHERE t.user_id = u.id
                  AND t.created_at - u.created_at < interval '1 minute'
              )
         THEN ARRAY['password']::text[] ELSE ARRAY[]::text[]
       END
  FROM auth.users u;
END;
$$;
