import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import { i18n } from './plugins/i18n'
import { isNativeApp } from '@/services/nativeApp'
import '@/assets/theme.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)

app.mount('#app')

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
