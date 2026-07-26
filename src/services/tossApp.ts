import { getOperationalEnvironment, getSchemeUri } from '@apps-in-toss/web-framework'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'

// granite.config.ts의 appName과 같아야 한다 — 딥링크 주소에 쓰인다.
const APP_NAME = 'firepath'

/**
 * 토스 미니앱에서 SNS 로그인 후 돌아올 주소.
 * Supabase URL Configuration의 Redirect URLs에 `intoss://firepath/**`를 등록해야 동작한다.
 */
export const TOSS_OAUTH_REDIRECT = `intoss://${APP_NAME}/`

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

// 딥링크로 세션을 복원하지 못했을 때 진입 스킴의 구조를 담아둔다.
// 토스가 어떤 형태로 파라미터를 전달하는지 확인하기 위한 임시 진단용 — 검증 끝나면 제거할 것.
export const schemeDiagnostic = ref('')

// 토큰 값은 남기지 않고 파라미터 이름만 남긴다 (스크린샷으로 유출되지 않도록).
const describeSchemeUri = (uri: string) => {
  const hashAt = uri.indexOf('#')
  const queryAt = uri.indexOf('?')
  const base = uri.split(/[?#]/)[0]
  const queryEnd = hashAt === -1 ? undefined : hashAt
  const queryKeys = queryAt === -1 ? [] : [...new URLSearchParams(uri.slice(queryAt + 1, queryEnd)).keys()]
  const hashKeys = hashAt === -1 ? [] : [...new URLSearchParams(uri.slice(hashAt + 1)).keys()]
  return `${base} ?(${queryKeys.join(',')}) #(${hashKeys.join(',')})`
}

/**
 * 토스 미니앱 진입 스킴에 SNS 로그인 결과가 실려 있으면 세션으로 복원한다.
 *
 * 미니앱은 웹과 다른 컨텍스트라 OAuth 리다이렉트가 웹뷰로 그대로 돌아오지 못한다.
 * 토스가 별도 브라우저로 인증을 진행한 뒤 `intoss://` 딥링크로 미니앱을 다시 열어주므로,
 * 그때 스킴에 실려 온 토큰을 꺼내 세션을 세팅해야 미니앱에 로그인 상태가 남는다.
 * (implicit 플로우라 토큰은 fragment에 담겨 온다)
 *
 * 토스 앱이 아니면 아무것도 하지 않고 즉시 끝난다 — 웹·PWA·안드로이드 앱에는 영향이 없다.
 */
export const restoreSessionFromSchemeUri = async () => {
  if (!isTossApp()) return

  let uri = ''
  try {
    uri = getSchemeUri()
  } catch {
    schemeDiagnostic.value = 'getSchemeUri() 호출 실패'
    return
  }

  const params = new URLSearchParams(uri.includes('#') ? uri.slice(uri.indexOf('#') + 1) : '')
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  // 토큰을 못 받았으면 토스가 진입 스킴을 어떤 형태로 넘겼는지 무조건 남긴다.
  // (fragment를 통째로 버리는 경우까지 잡으려면 조건 없이 기록해야 한다)
  if (!accessToken || !refreshToken) {
    schemeDiagnostic.value = uri ? describeSchemeUri(uri) : '진입 스킴 없음'
    return
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (error) schemeDiagnostic.value = describeSchemeUri(uri)
}
