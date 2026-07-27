import { appLogin } from '@apps-in-toss/web-framework'
import { supabase } from '@/services/supabase'
import { clearLastModule } from '@/utils/lastModule'

// 토스 로그인. 미니앱에서만 동작한다.
//
// 인가 코드 교환과 사용자 정보 조회는 mTLS가 필요해 전부 Edge Function(toss-login)에서 하고,
// 여기서는 인가 코드를 받아 넘기고 돌아온 hashed_token으로 세션만 세운다.

export type TossLoginResult =
  | 'OK' // 로그인 완료
  | 'NEEDS_EMAIL' // 토스 계정에 이메일이 없어 직접 입력받아야 함
  | 'EMAIL_CONFLICT' // 입력한 이메일이 이미 다른 계정에서 사용 중
  | 'FAILED'

// 세션 확립까지 실패한 경우만 재시도 대상이라 내부에서만 쓰는 값
type AttemptResult = TossLoginResult | 'SESSION_FAILED'

const attempt = async (email?: string): Promise<AttemptResult> => {
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
  if (sessionError) {
    console.error('verifyOtp 실패', sessionError.code, sessionError.message)
    return 'SESSION_FAILED'
  }

  // 신규 계정이면 기기에 남은 '마지막 사용 모듈'을 지운다. 이 기록은 기기 단위라,
  // 같은 기기에서 전에 가계부를 썼으면 새 계정이 곧바로 가계부로 들어가 버린다.
  if (data.isNew) clearLastModule()

  return 'OK'
}

/**
 * @param email 토스가 이메일을 주지 않아 유저가 직접 입력한 경우에만 전달한다.
 *
 * 최초 가입(계정이 막 생성된 직후)에서 첫 verifyOtp가 실패하는 경우가 관측돼(2026-07-27)
 * 세션 확립 실패에 한해 한 번만 다시 시도한다. 인가 코드는 일회성이라 appLogin부터 다시 부르는데,
 * 이미 동의한 유저에게는 창 없이 즉시 반환되므로 유저가 체감하는 마찰은 없다.
 * 원인을 특정하면 이 재시도는 걷어낼 것.
 */
export const signInWithToss = async (email?: string): Promise<TossLoginResult> => {
  const first = await attempt(email)
  if (first !== 'SESSION_FAILED') return first

  const second = await attempt(email)
  return second === 'SESSION_FAILED' ? 'FAILED' : second
}

/** 회원탈퇴 시 토스 쪽 로그인 연결도 해제. 실패해도 탈퇴는 계속 진행한다. */
export const disconnectToss = async () => {
  await supabase.functions.invoke('toss-disconnect').catch(() => {})
}
