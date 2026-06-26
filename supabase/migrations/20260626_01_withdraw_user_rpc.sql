-- 회원탈퇴: signup_log 탈퇴일 기록 후 계정 삭제
-- SECURITY DEFINER로 실행되어 RLS 우회
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

  -- signup_log 탈퇴일 업데이트
  UPDATE signup_log
  SET deleted_at = now()
  WHERE email = user_email
    AND deleted_at IS NULL;

  -- Auth 계정 삭제 (CASCADE로 관련 데이터 전부 삭제)
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
