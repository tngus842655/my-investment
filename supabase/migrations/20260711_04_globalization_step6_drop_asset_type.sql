-- GLOBALIZATION.md 사용자 단계 6 — (맨 마지막) portfolios.asset_type 컬럼 제거
--
-- ⚠️ 실행 대기(PENDING): 아래 순서를 지킬 것.
--   1. asset_type 참조를 걷어낸 프론트 변경(dual-write 제거 등)이 main에 배포·안정화됐는지 확인
--      (2026-07-11 프론트에서 asset_type 참조 전면 제거 완료 — insert/select/타입 모두).
--   2. 확인 후 이 SQL을 Supabase에서 실행.
-- 지금(배포 전) 실행하면 구버전 프론트의 insert가 asset_type을 참조해 신규 등록이 깨진다.

ALTER TABLE portfolios DROP COLUMN asset_type;
