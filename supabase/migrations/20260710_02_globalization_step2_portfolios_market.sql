-- GLOBALIZATION.md 사용자 단계 2 — portfolios에 asset_class/market 추가 + 백필 (2026-07-10 Supabase에서 실행 완료)

-- 2-1. 컬럼 추가 (CHECK로 값 제한, 국가 추가 시 CHECK만 수정)
ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS asset_class text
    CHECK (asset_class IN ('stock', 'etf', 'crypto', 'cash')),
  ADD COLUMN IF NOT EXISTS market text
    CHECK (market IN ('KR', 'US', 'JP', 'CN'));

-- 2-2. 기존 데이터 백필 (기존 유저는 전원 한국인 전제)
UPDATE portfolios SET
  asset_class = CASE asset_type
    WHEN '국내주식' THEN 'stock'
    WHEN '해외주식' THEN 'stock'
    WHEN 'ETF'      THEN 'etf'
    WHEN '암호화폐' THEN 'crypto'
    WHEN '현금'     THEN 'cash'
  END,
  market = CASE
    WHEN asset_type = '국내주식' THEN 'KR'
    WHEN asset_type = '해외주식' THEN 'US'
    WHEN asset_type = 'ETF' AND currency = 'KRW' THEN 'KR'
    WHEN asset_type = 'ETF' AND currency = 'USD' THEN 'US'
    ELSE NULL  -- 암호화폐/현금
  END
WHERE asset_class IS NULL;

-- 2-3. 백필 검증 (0이어야 정상) — 실행 결과 0 확인됨
-- SELECT count(*) FROM portfolios WHERE asset_class IS NULL;

-- 2-4. NOT NULL 제약
ALTER TABLE portfolios ALTER COLUMN asset_class SET NOT NULL;
