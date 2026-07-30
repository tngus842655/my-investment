import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import type { AuthError, Provider } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { NATIVE_AUTH_REDIRECT } from './nativeApp'
import router from '@/router'

/**
 * 네이티브 앱에서 SNS 인증 페이지를 시스템 브라우저(크롬 커스텀 탭)로 연다.
 *
 * 앱 웹뷰 안에서 그대로 이동시키면 구글이 `disallowed_useragent`로 차단하므로,
 * `skipBrowserRedirect`로 이동은 막고 인증 URL만 받아 브라우저에 넘긴다.
 * 인증이 끝나면 `NATIVE_AUTH_REDIRECT` 딥링크로 앱에 돌아오고, 아래 리스너가 처리한다.
 */
export const openNativeOAuth = async (provider: Provider): Promise<AuthError | null> => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true },
  })
  if (error) return error
  if (data.url) await Browser.open({ url: data.url })
  return null
}

/** 소셜 계정 연결(linkIdentity)도 같은 이유로 시스템 브라우저를 거쳐야 한다. */
export const openNativeLinkIdentity = async (provider: Provider): Promise<AuthError | null> => {
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true },
  })
  if (error) return error
  if (data.url) await Browser.open({ url: data.url })
  return null
}

/**
 * 인증 후 딥링크로 돌아왔을 때 코드를 세션으로 교환한다. 네이티브에서만 등록한다.
 *
 * 웹은 리다이렉트 복귀가 곧 페이지 재진입이라 라우터 가드가 알아서 목적지로 보내지만,
 * 네이티브는 로그인 화면이 그대로 남아 있으므로 교환 후 직접 이동시켜야 한다.
 * `/`는 세션이 있으면 가드가 마지막 사용 모듈로 보낸다(LoginView 로그인 성공 후와 동일).
 */
export const initNativeAuthListener = () => {
  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return

    const code = new URLSearchParams(url.split('?')[1] ?? '').get('code')
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      // 계정 연결은 이미 연결 화면에 머물러 있으므로 이동시키지 않는다.
      if (!error && router.currentRoute.value.name !== 'linkedAccounts') {
        await router.replace('/')
      }
    }

    // 커스텀 탭 정리는 마지막에 한다. 딥링크가 이미 앱을 앞으로 불러낸 뒤라 화면상 차이는 없고,
    // 여기서 실패하더라도 위의 세션 교환이 영향을 받지 않아야 한다.
    await Browser.close()
  })
}
