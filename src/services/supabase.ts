import { createClient } from '@supabase/supabase-js'
import { isNativeApp } from './nativeApp'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      // 네이티브 앱은 OAuth를 시스템 브라우저로 띄우고 딥링크로 돌아오는데, implicit 방식은
      // 토큰이 URL 프래그먼트(#)에 실려 딥링크로 안정적으로 전달되지 않는다. PKCE는 쿼리
      // 파라미터(?code=)로 오므로 딥링크에서 그대로 읽어 교환할 수 있다.
      // 웹·앱인토스는 기존 동작(implicit, auth-js 기본값)을 그대로 유지한다.
      flowType: isNativeApp() ? 'pkce' : 'implicit',
    },
  },
)

// SNS(OAuth) 로그인 시작 표식 — 리다이렉트 복귀 후 App.vue에서 login_log 기록에 사용
export const OAUTH_LOGIN_PENDING_KEY = 'fp-oauth-login-pending'
