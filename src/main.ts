import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import { i18n } from './plugins/i18n'
import { restoreSessionFromSchemeUri } from '@/services/tossApp'
import '@/assets/theme.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)

// 토스 미니앱에서 SNS 로그인 후 딥링크로 돌아온 경우, 라우터 첫 진입 전에 세션을 복원해야
// 로그인 화면으로 튕기지 않는다. 토스 앱이 아니면 즉시 끝나므로 웹·PWA·안드로이드는 영향 없다.
restoreSessionFromSchemeUri()
  .catch(() => {})
  .finally(() => app.mount('#app'))

// 안드로이드 Chrome은 iOS와 달리 -webkit-touch-callout이 먹지 않고 롱프레스 시
// contextmenu 이벤트로 이미지 확대/복사/공유/저장 메뉴가 뜨므로 별도로 차단
document.addEventListener('contextmenu', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'IMG') e.preventDefault()
})
