import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
} from '@capacitor-community/admob'

/**
 * 구글플레이 앱(Capacitor) 전용 애드몹 배너.
 *
 * 앱인토스 배너(tossAds.ts)와 달리 DOM 안에 그려지지 않는다 — 네이티브 SDK가
 * 웹뷰 **위에** 화면 하단 고정으로 겹쳐 그린다. 그래서 배너가 뜨면 그 높이만큼
 * body 아래 여백을 줘서 페이지 내용이 가려지지 않게 한다(SizeChanged 리스너).
 *
 * 이 모듈은 @capacitor-community/admob을 정적 import하므로 반드시 동적 import로만
 * 불러올 것 (AdmobBannerAd.vue 참고) — 웹·앱인토스 번들에 플러그인이 섞이지 않게 하기 위함.
 */

// 애드몹 콘솔에서 발급받은 배너 광고 단위 ID. 번들에 노출되는 값이라 비밀값은 아니다.
// 개발 빌드에서는 구글 공식 테스트 ID를 쓴다 — 운영 ID 광고를 직접 클릭하면 계정 제재 대상이다.
const BANNER_AD_UNIT_ID = import.meta.env.DEV
  ? 'ca-app-pub-3940256099942544/6300978111' // 구글 공식 테스트 배너 ID
  : 'ca-app-pub-9942492825878908/7070697969'

// 배너를 원하는 화면 수. 화면 전환 시 새 화면의 mount가 이전 화면의 unmount보다
// 먼저 도는 경우가 있어, boolean이 아니라 카운터로 관리한다 (둘 다 배너 화면이면 유지).
let claims = 0
let initialized = false

const ensureInit = async () => {
  if (initialized) return
  initialized = true
  AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => {
    document.body.style.paddingBottom = height > 0 ? `${height}px` : ''
  })
  await AdMob.initialize()
}

/** 화면 하단에 배너를 띄운다. 광고 로드 실패는 조용히 넘긴다(빈 자리도 안 생긴다). */
export const showAdmobBanner = async () => {
  claims++
  try {
    await ensureInit()
    if (claims <= 0) return // 초기화를 기다리는 사이 화면을 떠났으면 띄우지 않는다
    // 배너를 쓰는 두 화면(대시보드·가계부 캘린더)은 하단 고정 탭바 레이아웃 안에 있다.
    // margin 없이 띄우면 배너가 탭바를 덮어 네비게이션이 막히므로, 탭바가 차지하는
    // 높이(safe-area 포함)를 재서 그만큼 위에 띄운다. CSS px == dp라 그대로 넘기면 된다.
    const nav = document.querySelector('.bottom-nav')
    const margin = nav
      ? Math.max(0, Math.round(window.innerHeight - nav.getBoundingClientRect().top))
      : 0
    await AdMob.showBanner({
      adId: BANNER_AD_UNIT_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin,
    })
  } catch {
    // 광고 초기화·로드 실패가 앱 동작을 막으면 안 된다
  }
}

/** 배너를 내린다. 아직 다른 화면이 배너를 원하면(카운터 > 0) 유지한다. */
export const removeAdmobBanner = async () => {
  claims--
  if (claims > 0) return
  try {
    await AdMob.removeBanner()
  } catch {
    // 떠 있지 않은 배너 제거는 무시
  }
  document.body.style.paddingBottom = ''
}
