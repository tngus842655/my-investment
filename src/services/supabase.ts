import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// SNS(OAuth) 로그인 시작 표식 — 리다이렉트 복귀 후 App.vue에서 login_log 기록에 사용
export const OAUTH_LOGIN_PENDING_KEY = 'fp-oauth-login-pending'

// iOS 홈 화면 앱(standalone)의 SNS 로그인 세션 이어받기용 일회성 nonce (sessionStorage).
// iOS는 standalone에서 외부 도메인(OAuth)으로 나가면 별도 인앱 브라우저(오버레이)를 띄우는데,
// 오버레이와 홈 화면 앱은 저장소를 공유하지 않아 세션이 본체로 전달되지 않는다.
// 그래서 본체가 nonce를 복귀 URL에 실어 보내면, 오버레이가 로그인 완료 후 세션 토큰을
// oauth_handoff 티켓(DB, 2분 TTL·1회용)으로 남기고, 본체는 오버레이가 닫힐 때
// nonce로 티켓을 회수해 setSession으로 로그인을 복원한다 (LoginView → App.vue).
export const OAUTH_HANDOFF_NONCE_KEY = 'fp-oauth-handoff-nonce'
// 복귀 URL에 nonce를 실어 보내는 쿼리 파라미터 이름
export const OAUTH_HANDOFF_PARAM = 'oauth_handoff'
