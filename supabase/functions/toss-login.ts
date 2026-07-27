import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 토스 로그인 — 미니앱에서 받은 인가 코드를 세션으로 바꿔준다.
//
// 인가 코드 교환·사용자 조회는 반드시 서버에서 해야 하고(문서 요구사항), 앱인토스 API는
// mTLS 클라이언트 인증서를 요구한다. 인증서는 앱인토스 콘솔 > mTLS 인증서에서 발급받아
// PEM 내용을 그대로 시크릿에 넣는다.
//
// 세션은 Supabase OAuth 경로를 쓰지 않는다. service_role로 계정을 만들거나 찾은 뒤
// magiclink의 hashed_token만 발급해 클라이언트가 verifyOtp로 세션을 세운다.
// 이 경로는 메일을 한 통도 보내지 않는다.

const TOSS_API = 'https://apps-in-toss-api.toss.im'
const ADMIN_EMAIL = 'tngus842655@gmail.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// mTLS 클라이언트. 요청마다 만들면 TLS 핸드셰이크가 반복되므로 인스턴스 단위로 재사용한다.
let httpClient: ReturnType<typeof Deno.createHttpClient> | null = null
const mtlsClient = () => {
  if (httpClient === null) {
    httpClient = Deno.createHttpClient({
      cert: Deno.env.get('TOSS_MTLS_CERT')!,
      key: Deno.env.get('TOSS_MTLS_KEY')!,
    })
  }
  return httpClient
}

const tossPost = async (path: string, body: unknown) => {
  const res = await fetch(`${TOSS_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    client: mtlsClient(),
  })
  return await res.json()
}

const tossGet = async (path: string, accessToken: string) => {
  const res = await fetch(`${TOSS_API}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    client: mtlsClient(),
  })
  return await res.json()
}

// 앱인토스 공통 응답 규격: { resultType: 'SUCCESS', success: {...} } | { resultType: 'FAIL', error: {...} }
const successOf = (res: { resultType?: string; success?: unknown }) =>
  res?.resultType === 'SUCCESS' ? (res.success as Record<string, unknown>) : null

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

// 문서는 AAD를 복호화 키와 함께 메일로 준다고 하는데 실제로는 키만 온다.
// 문서의 PHP 예제가 AAD를 'TOSS'로 하드코딩해 둔 걸로 보아 고정값으로 보인다.
// 다른 값을 받게 되면 TOSS_DECRYPT_AAD 시크릿으로 덮어쓸 수 있게 열어둔다.
const AAD = Deno.env.get('TOSS_DECRYPT_AAD') ?? 'TOSS'

// 사용자 정보는 AES-256-GCM으로 암호화되어 온다. 암호문 앞 12바이트가 IV이고 나머지는
// 암호문+태그(16바이트)라, WebCrypto가 기대하는 형태와 같아 IV만 떼어내면 된다.
// 복호화 키는 콘솔의 '이메일로 복호화 키 받기'로 발급받는다.
const decrypt = async (encrypted: string) => {
  const raw = b64(encrypted)
  const key = await crypto.subtle.importKey(
    'raw',
    b64(Deno.env.get('TOSS_DECRYPT_KEY')!),
    'AES-GCM',
    false,
    ['decrypt'],
  )
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: raw.slice(0, 12),
      additionalData: new TextEncoder().encode(AAD),
      tagLength: 128,
    },
    key,
    raw.slice(12),
  )
  return new TextDecoder().decode(plain)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // inputEmail: 토스가 이메일을 주지 않아(토스 가입 시 필수 항목이 아님) 유저가 직접 입력한 경우.
  // 이때 클라이언트는 appLogin을 다시 호출해 새 인가 코드를 함께 보낸다 — 인가 코드는
  // 일회성이고 10분만 유효한데, 이미 동의한 유저는 appLogin이 창 없이 즉시 반환한다.
  const { authorizationCode, referrer, email: inputEmail } = await req.json().catch(() => ({}))
  if (!authorizationCode || !referrer) {
    return json({ error: 'authorizationCode, referrer required' }, 400)
  }

  // 실패 원인을 대시보드 로그에서 바로 볼 수 있게 남긴다.
  // 인가 코드·토큰·이메일 같은 민감값은 찍지 않는다.
  const tokenRes = await tossPost('/api-partner/v1/apps-in-toss/user/oauth2/generate-token', {
    authorizationCode,
    referrer,
  })
  const token = successOf(tokenRes)
  if (!token?.accessToken) {
    console.error('generate-token 실패', JSON.stringify(tokenRes))
    return json({ error: 'toss_token_failed' }, 502)
  }

  const meRes = await tossGet(
    '/api-partner/v1/apps-in-toss/user/oauth2/login-me',
    String(token.accessToken),
  )
  const me = successOf(meRes)
  if (!me?.userKey) {
    console.error('login-me 실패', JSON.stringify(meRes))
    return json({ error: 'toss_user_failed' }, 502)
  }
  console.log('login-me 성공', JSON.stringify({ scope: me.scope, hasEmail: me.email !== null }))
  const tossUserKey = String(me.userKey)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1순위: 이미 연결된 토스 계정인가
  const { data: identity } = await admin
    .from('toss_identities')
    .select('user_id')
    .eq('toss_user_key', tossUserKey)
    .maybeSingle()

  let email: string | null = null

  if (identity) {
    const { data: known } = await admin.auth.admin.getUserById(identity.user_id)
    email = known.user?.email ?? null
  }

  // 2순위: 토스가 준 이메일로 매칭. 이메일은 앱 전반에서 준-key로 쓰이므로
  // 같은 이메일이면 같은 회원으로 본다.
  if (email === null && typeof me.email === 'string') {
    email = await decrypt(me.email).catch((e) => {
      // AAD가 'TOSS'가 아니거나 복호화 키가 틀리면 여기로 온다
      console.error('이메일 복호화 실패', String(e))
      return null
    })
  }

  // 토스 계정에 이메일이 없으면(토스 가입 시 필수 항목이 아니다) 유저에게 직접 받는다.
  const typedByUser = email === null
  if (email === null) {
    if (!inputEmail) return json({ needsEmail: true })
    email = String(inputEmail)
  }

  // 관리자 계정은 회원 삭제·비밀번호 초기화 권한을 갖고 있어 위험도가 다르다.
  // 토스 자동 연결 대상에서 제외한다.
  if (email === ADMIN_EMAIL) {
    return json({ error: 'admin_not_allowed' }, 403)
  }

  // 신규면 계정 생성. email_confirm으로 두면 확인 메일이 나가지 않는다.
  // 이미 있으면 email_exists로 실패하고, 그건 기존 회원이라는 뜻이다.
  // 이미 가입된 이메일인지 판별. supabase-js 버전에 따라 code가 안 실려 오는 경우가 있어
  // 메시지도 함께 본다 — 여기서 오판하면 기존 회원을 신규로 취급하게 된다.
  const { error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true })
  const isExisting =
    createError !== null &&
    (createError.code === 'email_exists' || /already been registered|already exists/i.test(createError.message))
  if (createError && !isExisting) {
    console.error('createUser 실패', createError.code, createError.message)
    return json({ error: 'signup_failed' }, 500)
  }

  // 유저가 타이핑한 이메일은 소유 확인이 전혀 없다. 기존 계정과 겹치면 그 계정을
  // 가로챌 수 있으므로 자동 연결하지 않고 기존 로그인 수단으로 돌려보낸다.
  // (토스가 준 이메일은 토스 계정에 등록된 값이라 이 제한을 두지 않는다.)
  if (typedByUser && isExisting) {
    return json({ error: 'email_conflict' }, 409)
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !link.properties?.hashed_token || !link.user) {
    console.error('generateLink 실패', linkError?.code, linkError?.message)
    return json({ error: 'session_failed' }, 500)
  }
  console.log('세션 발급 완료', JSON.stringify({ isExisting, hadIdentity: identity !== null }))

  // 매핑 저장(멱등). 이미 다른 계정에 연결된 userKey면 유니크 제약에 걸려 실패하는데,
  // 그 경우 세션은 정상 발급하고 매핑만 기존 것을 유지한다.
  const { error: mapError } = await admin
    .from('toss_identities')
    .upsert({ user_id: link.user.id, toss_user_key: tossUserKey }, { onConflict: 'user_id' })
  if (mapError) {
    // 매핑이 안 쌓이면 다음 로그인에서 userKey로 계정을 못 찾아 이메일 매칭에만 의존하게 된다
    console.error('toss_identities 저장 실패', mapError.code, mapError.message, mapError.details)
  }

  // isNew: 이번 호출에서 계정이 새로 만들어졌는지. 클라이언트가 기기에 남은
  // '마지막 사용 모듈' 기록을 지우는 데 쓴다(신규 계정은 이력이 없어야 한다).
  return json({ tokenHash: link.properties.hashed_token, email, isNew: !isExisting })
})
