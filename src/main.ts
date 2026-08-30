import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import { i18n } from './plugins/i18n'
import { isNativeApp } from '@/services/nativeApp'
import { isTossApp } from '@/services/tossApp'
import '@/assets/theme.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)

app.mount('#app')

// 앱인토스 미니앱 여부를 문서 루트에 표시한다. 토스 웹뷰는 상단 네비게이션 바에 뒤로가기를
// 항상 제공해서 화면 안의 자체 뒤로가기 버튼과 겹치면 안 되는데(검수 요건), 그 숨김 처리를
// theme.css의 .toss-app 규칙 하나로 끝내기 위한 표식이다.
// 마운트 뒤에 두는 이유: isTossApp()은 첫 호출 결과를 캐시하는데, 브리지 상수가 주입되기 전에
// 먼저 불리면 false로 굳어 미니앱 전용 분기가 전부 죽는다. 지금까지의 최초 호출 시점(컴포넌트
// setup)보다 앞서지 않도록 순서를 유지한다. 페인트 전 같은 태스크라 버튼이 깜빡이지도 않는다.
if (isTossApp()) document.documentElement.classList.add('toss-app')

// 안드로이드 앱은 SNS 인증을 시스템 브라우저로 띄우므로, 딥링크로 돌아온 인증 코드를 받아야 한다.
// 웹·앱인토스에는 필요 없는 코드라 앱에서만 내려받도록 동적 import 한다.
if (isNativeApp()) {
  import('@/services/nativeAuth').then(({ initNativeAuthListener }) => initNativeAuthListener())
}

// 안드로이드 Chrome은 iOS와 달리 -webkit-touch-callout이 먹지 않고 롱프레스 시
// contextmenu 이벤트로 이미지 확대/복사/공유/저장 메뉴가 뜨므로 별도로 차단
document.addEventListener('contextmenu', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'IMG') e.preventDefault()
})
