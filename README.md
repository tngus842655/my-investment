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

`VITE_*` 값은 Vite가 빌드 시점에 번들에 박아넣고, 그 번들이 토스 서버로 올라갑니다. 그래서 **프로모션 코드를 바꾸면 반드시 다시 빌드하고 배포해야** 반영됩니다. Vercel 등 웹 배포 환경변수에는 넣지 않아도 됩니다(미니앱은 Vercel을 거치지 않습니다).

```sh
# Windows(cmd)는 rmdir /s /q dist
rm -rf dist && npm run build:toss
```

빌드가 끝나면 프로젝트 루트에 **`firepath.ait`** 가 생깁니다. 이 파일을 **앱인토스 콘솔에 직접 업로드**하면 배포됩니다.

`dist`를 먼저 지우는 이유: `ait build`는 `dist/web/index.html`이 이미 있으면 **`vite build`를 건너뛰고 기존 번들을 그대로 재사용**합니다. 지우지 않으면 `.env`를 바꿔도 예전 번들이 그대로 패키징됩니다.

`npm run deploy:toss`(=`ait deploy`)는 콘솔 업로드 대신 CLI로 올리는 방법인데, **앱인토스 배포 API 키가 필요**합니다(`ait token add`로 등록하거나 실행 시 프롬프트 입력). 키를 쓰지 않는다면 콘솔 업로드 방식만 쓰면 됩니다. 참고로 `ait deploy`는 빌드를 하지 않고 루트의 `*.ait`만 업로드합니다.

- 달성 조건: 로그인 후 서비스 카테고리(자산관리 또는 가계부) 진입
  - 조건을 처음 충족한 순간 "허브에서 받아가세요" 스낵바를 한 번 띄웁니다. 카테고리 화면에 들어온 유저가 허브로 돌아가야 받을 수 있다는 걸 알 방법이 없기 때문입니다.
- 지급: 허브 화면의 "받기" 버튼 → `grantPromotionReward` 브리지 호출
- 중복 방지: `toss_promotion_rewards` 테이블 (자세한 내용은 **TABLE.md** 참고)

#### 배너 광고 (인앱 광고)

콘솔에서 발급받은 배너 광고 그룹 ID를 **로컬 `.env`** 의 `VITE_TOSS_AD_GROUP_ID`에 넣으면, 토스 앱에서 접속한 유저에게만 배너가 노출됩니다. 값이 비어 있거나 일반 브라우저·PWA·안드로이드 앱(TWA)에서는 노출되지 않습니다. 프로모션 코드와 마찬가지로 빌드 시점에 번들에 박히는 값이라, **ID를 바꾸면 반드시 다시 빌드·배포해야** 반영됩니다.

- 구현: `src/services/tossAds.ts`(환경 판별) + `src/components/TossBannerAd.vue`(`TossAds.attachBanner`)
- 배치: 대시보드(스탯 카드 ↔ 투자 현황 카드 사이), 가계부 캘린더(요약 카드 ↔ 캘린더 사이). 화면당 1개.

**테스트는 실제 토스 앱에서만 가능합니다.** 샌드박스는 인앱 광고를 지원하지 않아, `npm run dev:toss`로 띄운 로컬·샌드박스에서는 배너가 뜨지 않습니다. `rm -rf dist && npm run build:toss`로 만든 `firepath.ait`를 콘솔에 올린 뒤 콘솔의 QR로 열어서 확인해야 합니다.

개발·테스트 중에는 반드시 테스트용 ID를 씁니다. 운영 ID로 테스트하거나 본인이 반복 노출·클릭을 만들면 비정상 트래픽으로 보아 광고 제한·정산 보류 대상이 됩니다.

- 리스트형(문구 강조): `ait-ad-test-banner-id`
- 피드형(이미지 강조): `ait-ad-test-native-image-id`

광고 UI(색·글꼴·문구·"Ad" 표기)는 SDK가 그리는 그대로 두어야 하고, 광고 영역을 주기적으로 새로고침해서도 안 됩니다. `TossBannerAd`는 화면 진입 때 한 번 붙이고 떠날 때 `destroy()`만 합니다. 전체 정책은 **`toss-docs/in-app-ad.md`** 참고.
