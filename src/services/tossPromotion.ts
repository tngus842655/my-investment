import {
  getAnonymousKey,
  getOperationalEnvironment,
  grantPromotionReward,
} from '@apps-in-toss/web-framework'
import { supabase } from '@/services/supabase'

// 앱인토스 콘솔에서 발급받은 프로모션 코드.
// 브리지 호출 인자로 그대로 실려 번들에 노출되는 값이라 비밀값은 아니다.
const PROMOTION_CODE = import.meta.env.VITE_TOSS_PROMOTION_CODE ?? ''

// 지급할 토스포인트 금액. 콘솔에 등록한 1회 지급 금액과 같아야 한다.
export const PROMOTION_AMOUNT = 10

// 브리지 상수는 토스 앱(및 샌드박스) 웹뷰만 주입한다.
// 일반 브라우저·PWA·안드로이드 TWA에서는 호출 자체가 throw하므로 이걸로 환경을 판별한다.
let tossApp: boolean | null = null

const isTossApp = () => {
  if (tossApp === null) {
    try {
      getOperationalEnvironment()
      tossApp = true
    } catch {
      tossApp = false
    }
  }
  return tossApp
}

/** 프로모션을 진행할 수 있는 환경인지 (토스 앱 + 프로모션 코드 설정됨) */
export const isPromotionAvailable = () => PROMOTION_CODE !== '' && isTossApp()

// "서비스 카테고리 둘러보기" 달성 여부 — 계정별로 기기에 기록한다.
const visitedKey = (userId: string) => `fp-toss-promo-visited:${userId}`

export const hasVisitedCategory = (userId: string) =>
  localStorage.getItem(visitedKey(userId)) === '1'

/**
 * 서비스 카테고리(자산관리/가계부) 진입 기록.
 * 이번 진입으로 조건이 처음 충족됐으면 true를 반환한다(수령 안내를 한 번만 띄우기 위함).
 */
export const markCategoryVisited = (userId: string) => {
  if (!isPromotionAvailable() || hasVisitedCategory(userId)) return false
  localStorage.setItem(visitedKey(userId), '1')
  return true
}

/** 이 계정의 프로모션 지급 상태. 이력이 없으면 null */
export const fetchRewardStatus = async (userId: string) => {
  const { data } = await supabase
    .from('toss_promotion_rewards')
    .select('status')
    .eq('user_id', userId)
    .eq('promotion_code', PROMOTION_CODE)
    .maybeSingle()
  return (data?.status as 'PENDING' | 'GRANTED' | 'FAILED' | undefined) ?? null
}

export type ClaimResult =
  | 'GRANTED' // 지급 성공
  | 'ALREADY' // 이미 참여한 계정
  | 'FAILED' // 지급 실패 (재시도 가능)
  | 'UNKNOWN' // 지급 여부를 알 수 없음 (재시도 불가)

// 브리지 호출 자체가 실패한 경우까지 포함한 지급 결과
type GrantResult = Awaited<ReturnType<typeof grantPromotionReward>> | 'BRIDGE_ERROR'

// 성공 응답이면 리워드 키, 아니면 null.
// SDK 타입은 성공을 `{ key }`로 정의하지만 콘솔 가이드는 `resultType === 'SUCCESS'`로 판별하라고
// 안내한다(서버 지급 API 응답일 가능성). 어느 쪽이 와도 성공으로 인정한다.
const successKeyOf = (result: GrantResult) => {
  if (typeof result !== 'object' || 'errorCode' in result) return null
  if ('key' in result) return String(result.key)
  if ('resultType' in result && result.resultType === 'SUCCESS') return 'SUCCESS'
  return null
}

// 실패 원인 코드. null이면 지급됐는지 알 수 없다는 뜻이다.
const errorCodeOf = (result: GrantResult) => {
  if (result === 'BRIDGE_ERROR') return 'BRIDGE_ERROR' // 브리지에 닿지 못함 → 지급 안 됨
  if (result === undefined) return 'UNSUPPORTED_VERSION' // 토스 앱 버전이 최소 지원 버전보다 낮음
  if (result === 'ERROR') return null // 알 수 없는 오류
  if ('errorCode' in result) return String(result.errorCode)
  if ('code' in result) return String(result.code)
  return null
}

/** 프로모션 리워드(토스포인트) 지급 */
export const claimReward = async (): Promise<ClaimResult> => {
  // 토스 계정 식별키 — 같은 토스 계정이 앱 계정을 여러 개 만들어 중복 수령하는 것을 막는 데 쓴다.
  const keyResult = await getAnonymousKey().catch(() => undefined)
  const tossUserKey = typeof keyResult === 'object' ? keyResult.hash : null

  // 1) 지급 전에 서버에 예약한다. 중복 참여는 여기서 걸러진다.
  const { data: claim, error } = await supabase.rpc('claim_toss_promotion', {
    p_promotion_code: PROMOTION_CODE,
    p_amount: PROMOTION_AMOUNT,
    p_toss_user_key: tossUserKey,
  })
  if (error) return 'FAILED'
  if (claim === 'ALREADY') return 'ALREADY'

  // 2) 토스포인트 지급
  const result: GrantResult = await grantPromotionReward({
    params: { promotionCode: PROMOTION_CODE, amount: PROMOTION_AMOUNT },
  }).catch(() => 'BRIDGE_ERROR' as const)

  // 3) 결과 확정
  const rewardKey = successKeyOf(result)
  if (rewardKey !== null) {
    await supabase.rpc('complete_toss_promotion', {
      p_promotion_code: PROMOTION_CODE,
      p_reward_key: rewardKey,
      p_error_code: null,
    })
    return 'GRANTED'
  }

  // 지급 여부를 알 수 없으면 이력을 PENDING으로 남겨 재시도를 막는다 (이중 지급 방지)
  const errorCode = errorCodeOf(result)
  if (errorCode === null) return 'UNKNOWN'

  await supabase.rpc('complete_toss_promotion', {
    p_promotion_code: PROMOTION_CODE,
    p_reward_key: null,
    p_error_code: errorCode,
  })
  return 'FAILED'
}
