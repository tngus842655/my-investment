import type { CapacitorConfig } from '@capacitor/cli'

/**
 * 안드로이드 앱 껍데기 설정.
 *
 * TWA를 대체하는 목적이라 화면 내용은 그대로 배포된 웹(`firepath.me`)을 띄운다.
 * 달라지는 건 웹뷰가 크롬 프로세스가 아니라 **앱 자신의 프로세스**에서 돈다는 점이고,
 * 그래야 플레이 콘솔이 테스터 실사용을 이 앱의 사용 시간으로 집계한다.
 * (TWA는 크롬 CustomTabActivity가 화면을 점유해 사용 시간이 크롬에 붙었고,
 *  이 때문에 "테스터가 앱에 참여하지 않았습니다"로 프로덕션 액세스가 거절됐다.)
 *
 * ⚠️ `appId`는 기존 TWA와 반드시 동일해야 한다. 패키지명이 바뀌면 별도 앱이 되어
 * 비공개 테스트 14일 카운트가 처음부터 다시 시작된다.
 */
const config: CapacitorConfig = {
  appId: 'com.firepath.app',
  appName: 'FirePath',
  // server.url을 쓰므로 실제로 로드되진 않지만 CLI가 요구하는 필수 값이다.
  webDir: 'dist',
  server: {
    url: 'https://firepath.me',
  },
}

export default config
