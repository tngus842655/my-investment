import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// SNS(OAuth) 로그인 시작 표식 — 리다이렉트 복귀 후 App.vue에서 login_log 기록에 사용
export const OAUTH_LOGIN_PENDING_KEY = 'fp-oauth-login-pending'
