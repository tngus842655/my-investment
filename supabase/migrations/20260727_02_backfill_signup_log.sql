-- 토스 가입자 signup_log 백필 (1회성)
--
-- 토스 로그인은 afterLogin()에서 record_signup을 부르지 않았고, 리다이렉트가 없어
-- App.vue의 OAuth 경로도 타지 않아 signup_log에만 기록이 빠져 있었다.
-- login_log에는 정상적으로 쌓였으므로, 최초 로그인 시각을 가입 시각으로 삼아 채운다.
--
-- 탈퇴 회원은 auth.users CASCADE로 login_log가 함께 지워지므로 여기서 되살아나지 않는다.
-- NOT EXISTS로 걸러내므로 재실행해도 안전하다.
INSERT INTO signup_log (email, signed_up_at)
SELECT l.email, MIN(l.login_at)
FROM login_log l
WHERE l.email <> 'tngus842655@gmail.com' -- 관리자는 가입 이력·통계 대상이 아니다
  AND NOT EXISTS (SELECT 1 FROM signup_log s WHERE s.email = l.email)
GROUP BY l.email;
