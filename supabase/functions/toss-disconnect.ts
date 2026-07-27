import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 회원탈퇴 시 토스 쪽 로그인 연결도 끊는다.
// 이걸 호출하지 않으면 탈퇴 후에도 토스 앱의 '토스로 로그인한 서비스' 목록에 남는다.
// 서비스가 직접 이 API를 호출한 경우 연결 끊기 콜백은 오지 않는다(문서 명시).

const TOSS_API = 'https://apps-in-toss-api.toss.im'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: identity } = await admin
    .from('toss_identities')
    .select('toss_user_key')
    .eq('user_id', user.id)
    .maybeSingle()

  // 토스로 가입하지 않은 계정이면 끊을 연결이 없다
  if (!identity) {
    return json({ success: true })
  }

  const res = await fetch(
    `${TOSS_API}/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey: Number(identity.toss_user_key) }),
      client: Deno.createHttpClient({
        cert: Deno.env.get('TOSS_MTLS_CERT')!,
        key: Deno.env.get('TOSS_MTLS_KEY')!,
      }),
    },
  )
  const body = await res.json()

  return json({ success: body?.resultType === 'SUCCESS' })
})
