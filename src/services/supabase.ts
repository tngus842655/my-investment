import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// SNS(OAuth) 로그인 시작 표식 — 리다이렉트 복귀 후 App.vue에서 login_log 기록에 사용
export const OAUTH_LOGIN_PENDING_KEY = 'fp-oauth-login-pending'

// iOS 홈 화면 앱(standalone)에서 SNS 로그인을 시작한 표식 (값: 시작 시각 timestamp).
// iOS는 standalone에서 외부 도메인(OAuth)으로 나가면 별도 인앱 브라우저(오버레이)를 띄우는데,
// 오버레이와 홈 화면 앱은 localStorage를 공유하므로 이 표식으로 오버레이 쪽에서
// "✕를 눌러 앱으로 돌아가기" 안내를 띄운다 (App.vue).
export const OAUTH_PWA_RETURN_KEY = 'fp-oauth-pwa-return'
