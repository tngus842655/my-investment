import { Capacitor } from '@capacitor/core'

/** 안드로이드 네이티브 앱(Capacitor) 안에서 실행 중인지 여부. 브라우저·PWA·앱인토스에서는 false. */
export const isNativeApp = () => Capacitor.isNativePlatform()

/**
 * 네이티브 앱에서 SNS 로그인 복귀에 쓰는 딥링크.
 *
 * 구글은 2023-07-24부터 임베디드 웹뷰에서 오는 OAuth 요청을 `disallowed_useragent`로 차단한다.
 * 그래서 인증 페이지는 웹뷰가 아니라 시스템 브라우저(크롬 커스텀 탭)로 띄우고, 인증이 끝나면
 * 이 스킴으로 앱에 돌아온다. Supabase 대시보드의 Redirect URLs에도 등록돼 있어야 한다.
 */
export const NATIVE_AUTH_REDIRECT = 'com.firepath.app://auth-callback'
