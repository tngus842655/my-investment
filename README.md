# my-investment

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```

### App in Toss (앱인토스) 빌드/개발

일반 웹사이트용 `dev`/`build`/`deploy`와는 별개로, 앱인토스 미니앱용 스크립트가 `:toss` 접미사로 분리되어 있습니다.

```sh
npm run dev:toss     # 앱인토스 개발 서버 실행 (granite dev)
npm run build:toss   # 앱인토스 미니앱 빌드 (ait build)
```

#### 프로모션 (토스포인트 지급)

콘솔에서 발급받은 프로모션 코드를 **로컬 `.env`** 의 `VITE_TOSS_PROMOTION_CODE`에 넣으면, 토스 앱에서 접속한 유저에게만 허브 화면에 프로모션 카드가 노출됩니다. 코드가 비어 있거나 일반 브라우저·PWA·안드로이드 앱(TWA)에서는 카드가 노출되지 않습니다.

`VITE_*` 값은 Vite가 빌드 시점에 번들에 박아넣습니다. `ait deploy`가 로컬에서 `vite build`를 돌려 그 결과물을 토스 서버에 업로드하는 구조이므로, **프로모션 코드를 바꾸면 `npm run deploy:toss`로 재배포해야** 반영됩니다. Vercel 등 웹 배포 환경변수에는 넣지 않아도 됩니다.

- 달성 조건: 로그인 후 서비스 카테고리(자산관리 또는 가계부) 진입
- 지급: 허브 화면의 "받기" 버튼 → `grantPromotionReward` 브리지 호출
- 중복 방지: `toss_promotion_rewards` 테이블 (자세한 내용은 **TABLE.md** 참고)
