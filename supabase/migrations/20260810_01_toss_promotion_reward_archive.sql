-- 탈퇴 후 재가입으로 프로모션을 다시 받는 구멍 차단
--
-- toss_promotion_rewards.user_id는 auth.users를 ON DELETE CASCADE로 참조한다.
-- 탈퇴(delete_user_account)가 auth.users 행을 지우면 지급 이력이 통째로 사라지는데,
-- 여기엔 중복 수령 차단의 근거인 toss_user_key도 들어 있다. 재가입하면 user_id가 새로
-- 발급되므로 유니크 인덱스 두 개((user_id, promotion_code) / (toss_user_key, promotion_code))가
-- 모두 무력화돼 같은 토스 계정이 몇 번이든 다시 받을 수 있었다.
--
-- getAnonymousKey()의 해시는 같은 미니앱·같은 사용자에게 항상 같은 값이라(앱 계정 삭제와
-- 무관하다) 재수령을 막을 수 있는 유일한 안정 식별자다. 그 키를 담은 이력을 계정 수명에서
-- 떼어내 보관하고, 지급 예약이 보관 이력을 먼저 확인하게 한다.

-- 탈퇴한 계정의 프로모션 지급 이력. auth.users FK를 두지 않아 계정이 사라져도 남는다.
CREATE TABLE IF NOT EXISTS toss_promotion_reward_archive (
  toss_user_key  text NOT NULL,
  promotion_code text NOT NULL,
  amount         integer NOT NULL,
  status         text NOT NULL,
  reward_key     text,
  archived_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (toss_user_key, promotion_code)
);

-- RLS는 켜되 정책은 두지 않는다. 탈퇴한 사용자의 이력이라 조회할 본인이 없고, 기록·판정은
-- 전부 아래 SECURITY DEFINER 함수 안에서만 일어난다. 정책이 없으면 PostgREST 경로로는
-- 아무도 읽을 수 없고, 관리자는 대시보드(service_role)로 조회한다.
ALTER TABLE toss_promotion_reward_archive ENABLE ROW LEVEL SECURITY;

-- 지급 예약 RPC — 보관 이력 확인을 추가한다. 나머지 동작은 그대로다.
CREATE OR REPLACE FUNCTION claim_toss_promotion(
  p_promotion_code text,
  p_amount integer,
  p_toss_user_key text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  reserved_id uuid;
BEGIN
  -- 탈퇴한 계정이 남긴 이력. 계정이 사라져도 토스 식별키는 그대로라 여기서 걸린다.
  -- FAILED는 지급된 적이 없으므로 재시도를 막지 않는다(살아있는 이력과 같은 기준).
  IF p_toss_user_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM toss_promotion_reward_archive
    WHERE toss_user_key = p_toss_user_key
      AND promotion_code = p_promotion_code
      AND status <> 'FAILED'
  ) THEN
    RETURN 'ALREADY';
  END IF;

  -- 지급 실패(FAILED)로 끝난 이력만 재시도를 허용한다.
  -- PENDING은 지급 여부를 알 수 없는 상태라 재시도하지 않는다(이중 지급 방지).
  INSERT INTO toss_promotion_rewards (user_id, promotion_code, amount, toss_user_key)
  VALUES (auth.uid(), p_promotion_code, p_amount, p_toss_user_key)
  ON CONFLICT (user_id, promotion_code) DO UPDATE
    SET status        = 'PENDING',
        amount        = EXCLUDED.amount,
        toss_user_key = COALESCE(EXCLUDED.toss_user_key, toss_promotion_rewards.toss_user_key),
        error_code    = NULL,
        updated_at    = now()
    WHERE toss_promotion_rewards.status = 'FAILED'
  RETURNING id INTO reserved_id;

  IF reserved_id IS NULL THEN
    RETURN 'ALREADY';
  END IF;

  RETURN 'OK';
EXCEPTION
  -- toss_user_key 유니크 위반 = 같은 토스 계정이 다른 앱 계정으로 이미 받아간 경우
  WHEN unique_violation THEN
    RETURN 'ALREADY';
END;
$$;

-- 회원탈퇴 RPC — 계정 삭제 전에 프로모션 이력을 보관 테이블로 옮긴다.
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

  -- 프로모션 지급 이력 보관 — CASCADE로 지워지기 전에 옮긴다.
  -- 토스 식별키가 없는 이력(SDK 2.4.5 미만에서 지급받은 경우)은 재가입을 식별할 방법이
  -- 없으므로 건너뛴다.
  -- 이미 보관 이력이 있는 경우는 FAILED로 보관됐다가 재가입해 다시 받은 경우뿐이라,
  -- 최신 결과로 덮어쓴다.
  INSERT INTO toss_promotion_reward_archive
    (toss_user_key, promotion_code, amount, status, reward_key)
  SELECT toss_user_key, promotion_code, amount, status, reward_key
  FROM toss_promotion_rewards
  WHERE user_id = auth.uid()
    AND toss_user_key IS NOT NULL
  ON CONFLICT (toss_user_key, promotion_code) DO UPDATE
    SET amount      = EXCLUDED.amount,
        status      = EXCLUDED.status,
        reward_key  = EXCLUDED.reward_key,
        archived_at = now();

  -- Auth 계정 삭제 (CASCADE로 관련 데이터 전부 삭제)
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- 살아있는 이력 백필.
-- 이관은 탈퇴 시점에 일어나므로, 백필이 없으면 이미 받아간 사람은 "다음 탈퇴" 때 비로소
-- 보관된다. 즉 반복 수령 중인 계정에 한 사이클을 더 내주게 된다. 지금 시점의 이력을 미리
-- 넣어두면 다음 재가입부터 바로 막힌다.
--
-- 살아있는 계정의 동작은 바뀌지 않는다. 이미 toss_promotion_rewards에 행이 있는 계정은
-- 원래도 (user_id, promotion_code) 유니크로 ALREADY였고, FAILED는 보관 이력이 있어도
-- 재시도가 허용되기 때문이다. 차이가 생기는 건 탈퇴 후 재가입 경로뿐이다.
INSERT INTO toss_promotion_reward_archive
  (toss_user_key, promotion_code, amount, status, reward_key)
SELECT toss_user_key, promotion_code, amount, status, reward_key
FROM toss_promotion_rewards
WHERE toss_user_key IS NOT NULL
ON CONFLICT (toss_user_key, promotion_code) DO UPDATE
  SET amount      = EXCLUDED.amount,
      status      = EXCLUDED.status,
      reward_key  = EXCLUDED.reward_key,
      archived_at = now();
