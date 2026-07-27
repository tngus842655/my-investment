import { appLogin } from '@apps-in-toss/web-framework'
import { supabase } from '@/services/supabase'

// 토스 로그인. 미니앱에서만 동작한다.
//
// 인가 코드 교환과 사용자 정보 조회는 mTLS가 필요해 전부 Edge Function(toss-login)에서 하고,
// 여기서는 인가 코드를 받아 넘기고 돌아온 hashed_token으로 세션만 세운다.

export type TossLoginResult =
  | 'OK' // 로그인 완료
  | 'NEEDS_EMAIL' // 토스 계정에 이메일이 없어 직접 입력받아야 함
  | 'EMAIL_CONFLICT' // 입력한 이메일이 이미 다른 계정에서 사용 중
  | 'FAILED'

/**
 * @param email 토스가 이메일을 주지 않아 유저가 직접 입력한 경우에만 전달한다.
 *              (인가 코드는 일회성이라 이때 appLogin을 다시 호출하는데, 이미 동의한
 *               유저에게는 창 없이 즉시 반환되므로 추가 마찰이 없다)
 */
export const signInWithToss = async (email?: string): Promise<TossLoginResult> => {
  const login = await appLogin().catch(() => null)
  if (!login) return 'FAILED'

  const { data, error } = await supabase.functions.invoke('toss-login', {
    body: { authorizationCode: login.authorizationCode, referrer: login.referrer, email },
  })
  if (error) {
    // Edge Function이 4xx/5xx를 주면 supabase-js는 error로 넘기고 본문은 파싱하지 않는다.
    // 이메일 충돌만 사용자에게 다르게 안내해야 해서 본문을 직접 읽는다.
    const body = await error.context?.json?.().catch(() => null)
    return body?.error === 'email_conflict' ? 'EMAIL_CONFLICT' : 'FAILED'
  }
  if (data?.needsEmail) return 'NEEDS_EMAIL'
  if (!data?.tokenHash) return 'FAILED'

  const { error: sessionError } = await supabase.auth.verifyOtp({
    token_hash: data.tokenHash,
    type: 'magiclink',
  })
  return sessionError ? 'FAILED' : 'OK'
}

/** 회원탈퇴 시 토스 쪽 로그인 연결도 해제. 실패해도 탈퇴는 계속 진행한다. */
export const disconnectToss = async () => {
  await supabase.functions.invoke('toss-disconnect').catch(() => {})
}
