-- 회원가입 시 signup_log 기록 RPC
-- SECURITY DEFINER로 RLS 우회하여 탈퇴 이력 재활성화 또는 신규 insert 처리
CREATE OR REPLACE FUNCTION record_signup(user_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  existing_id uuid;
  existing_deleted_at timestamptz;
BEGIN
  SELECT id, deleted_at INTO existing_id, existing_deleted_at
  FROM signup_log
  WHERE email = user_email
  ORDER BY signed_up_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    IF existing_deleted_at IS NOT NULL THEN
      -- 탈퇴 이력 재활성화
      UPDATE signup_log
      SET deleted_at = NULL, signed_up_at = now()
      WHERE id = existing_id;
    END IF;
    -- deleted_at IS NULL이면 이미 활성 회원 → 아무것도 안 함
  ELSE
    -- 신규 가입
    INSERT INTO signup_log (email) VALUES (user_email);
  END IF;
END;
$$;
