-- 앱인토스 프로모션(토스포인트) 지급 이력
-- 지급 자체는 미니앱 클라이언트의 브리지 호출(grantPromotionReward)로만 가능하므로,
-- 중복 지급은 "예약(PENDING) → 지급 → 결과 확정" 순서와 유니크 인덱스로 막는다.
CREATE TABLE IF NOT EXISTS toss_promotion_rewards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promotion_code text NOT NULL,
  toss_user_key  text,
  amount         integer NOT NULL,
  status         text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'GRANTED', 'FAILED')),
  reward_key     text,
  error_code     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 계정당 프로모션 1회
CREATE UNIQUE INDEX IF NOT EXISTS toss_promotion_rewards_user_idx
  ON toss_promotion_rewards (user_id, promotion_code);

-- 같은 토스 계정으로 앱 계정을 여러 개 만들어 중복 수령하는 것 차단
CREATE UNIQUE INDEX IF NOT EXISTS toss_promotion_rewards_toss_user_idx
  ON toss_promotion_rewards (toss_user_key, promotion_code)
  WHERE toss_user_key IS NOT NULL;

-- RLS 활성화
ALTER TABLE toss_promotion_rewards ENABLE ROW LEVEL SECURITY;

-- 본인 이력 SELECT만 허용. INSERT/UPDATE 정책은 두지 않아 아래 RPC 경로로만 기록된다.
CREATE POLICY "toss_promotion_rewards: 본인 select" ON toss_promotion_rewards
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 관리자 SELECT 허용
CREATE POLICY "toss_promotion_rewards: 관리자 select" ON toss_promotion_rewards
  FOR SELECT TO authenticated
  USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'tngus842655@gmail.com'
  );

-- 지급 예약 RPC — 포인트를 지급하기 전에 먼저 호출해서 중복 참여를 걸러낸다.
-- 'OK'  : 예약 성공, 이어서 grantPromotionReward를 호출해도 된다
-- 'ALREADY' : 이미 참여한 계정(또는 같은 토스 계정)이라 지급 불가
CREATE OR REPLACE FUNCTION claim_toss_promotion(
  p_promotion_code text,
  p_amount integer,
  p_toss_user_key text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  reserved_id uuid;
BEGIN
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

-- 지급 결과 확정 RPC — 예약(PENDING) 상태에서만 전이되므로,
-- 이미 GRANTED된 이력을 FAILED로 되돌려 재수령하는 것이 불가능하다.
CREATE OR REPLACE FUNCTION complete_toss_promotion(
  p_promotion_code text,
  p_reward_key text,
  p_error_code text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE toss_promotion_rewards
  SET status     = CASE WHEN p_reward_key IS NOT NULL THEN 'GRANTED' ELSE 'FAILED' END,
      reward_key = COALESCE(p_reward_key, reward_key),
      error_code = p_error_code,
      updated_at = now()
  WHERE user_id = auth.uid()
    AND promotion_code = p_promotion_code
    AND status = 'PENDING';
END;
$$;
