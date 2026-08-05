import { TossAds } from '@apps-in-toss/web-framework'
import { isTossApp } from '@/services/tossApp'

// 앱인토스 콘솔에서 발급받은 배너 광고 그룹 ID.
// 브리지 호출 인자로 그대로 실려 번들에 노출되는 값이라 비밀값은 아니다.
// 개발 중에는 반드시 테스트용 ID(리스트형 `ait-ad-test-banner-id`)를 쓴다 — 운영 ID로 테스트하면 제재 대상이다.
export const AD_GROUP_ID = import.meta.env.VITE_TOSS_AD_GROUP_ID ?? ''

/** 배너를 띄울 수 있는 환경인지 (토스 앱 + 광고 그룹 ID 설정 + 지원 버전) */
export const isBannerAvailable = () => {
  // isSupported는 브리지 상수라 토스 앱이 아니면 호출 자체가 throw한다
  if (AD_GROUP_ID === '' || !isTossApp()) return false
  try {
    return TossAds.attachBanner.isSupported()
  } catch {
    return false
  }
}
