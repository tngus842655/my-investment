import { getOperationalEnvironment } from '@apps-in-toss/web-framework'

// 브리지 상수는 토스 앱(및 샌드박스) 웹뷰만 주입한다.
// 일반 브라우저·PWA·안드로이드 TWA에서는 호출 자체가 throw하므로 이걸로 환경을 판별한다.
let tossApp: boolean | null = null

export const isTossApp = () => {
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
