-- 종목 시세 서버 캐시.
-- stock-price Edge Function이 Yahoo/Finnhub를 호출하기 전에 여기를 먼저 본다.
-- 기존에는 보유종목 수 × 사용자 수만큼 외부 API를 그대로 호출해서
-- 자산 화면 로딩이 종목 수에 비례해 느려지고 Finnhub 무료 티어 한도에도 걸렸다.
-- 사용자별 데이터가 아니라 전역 캐시라 다른 테이블과 달리 user_id FK가 없다.
-- 행은 티커 단위로 upsert되므로 보유 종목 종류만큼만 쌓이고 계속 덮어써진다(별도 정리 불필요).
CREATE TABLE IF NOT EXISTS price_cache (
  cache_key      text PRIMARY KEY,
  price          numeric NOT NULL,
  previous_close numeric,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;

-- 정책을 두지 않는다 — stock-price Edge Function(service_role)만 읽고 쓴다.
-- service_role은 RLS를 우회하므로 정책 없이도 동작하고, 클라이언트(anon/authenticated)는 접근할 수 없다.
