# PERFORMANCE.md

성능 개선 작업 기록. 2026-07-28 1차 작업.

## 1. 배경

두 가지 증상이 보고됐다.

- 로그인 직후 화면 로딩이 특히 느리다
- 자산 화면이 예전보다 느려진 것 같다

## 2. 진단

### 저장소 용량은 문제가 아니었다

처음엔 "프로젝트 용량이 1GB가 넘는다"는 관찰에서 출발했는데, 실측해 보니 저장소 자체는 **8.4MB**였다. git 히스토리에도 대용량 blob이 없다(최대가 `package-lock.json` 1.1MB).

1GB는 전부 `node_modules`다. lockfile의 패키지 2,338개를 npm 레지스트리에 조회해 합산한 결과 **약 1,030MB**(macOS Apple Silicon 기준. Linux x64 1,145MB / Windows 1,004MB).

| 원인 | 크기 |
| --- | --- |
| `@apps-in-toss/web-framework` | 577MB (56%) |
| Cloudflare (`wrangler` + `@cloudflare/vite-plugin`) | 178MB (그중 `workerd` 바이너리 109MB) |
| `vuetify` | 64MB |

토스 프레임워크가 의존성 1,911개를 끌고 오고 그중 1,574개가 전용이다. 내부에 React Native 런타임 281MB, esbuild 중복본 4벌 39MB, Sentry CLI 35MB, typescript 중복본 5벌 25MB가 들어있다. 앱이 실제로 쓰는 건 `appLogin`·`getAnonymousKey`·`grantPromotionReward`·`getOperationalEnvironment`·`defineConfig` 다섯 개뿐인데, 프레임워크가 RN 기반 `@granite-js/*`를 물고 있어서 생기는 벤더 패키징 문제다. **미니앱을 포기하지 않는 한 우리 쪽에서 줄일 방법이 없다.**

→ 결론: 디스크 용량은 손댈 게 없고, 실제 체감 문제는 별개였다.

### 실제 원인

**로그인 직후**

1. **코드 스플리팅 전무** — 라우터가 뷰 43개(`index.ts` 36 + `budget.routes.ts` 7)를 전부 정적 import. 프로젝트에 동적 import가 하나도 없었다. 로그인 화면에서 관리자 화면 11개, ETF 백테스트, 가계부 모듈까지 통째로 받아 파싱했다
2. **Vuetify 전체 번들링** — `import * as components from 'vuetify/components'`로 전역 등록해 트리셰이킹이 무력화. 실사용 34종인데 전 컴포넌트의 JS와 CSS가 들어갔다
3. **MDI 폰트 전체 로드** — 7,460개 아이콘 중 122개만 쓰는데 전부 받는다
4. **티커 테이블 153KB** — `tickerNames.ts` 배럴이 KR 테이블을 흡수해, 스플리팅이 없으니 첫 진입 번들에 포함
5. **렌더 전 직렬 워터폴** — `DashboardView`가 `recomputeAssetSummary`(보유종목 수만큼 시세 API)를 `await`한 뒤에야 화면을 그렸다

**자산 화면**

6. **N+1 패턴** — `PortfolioView`가 종목마다 `stock-price` Edge Function을 1회씩 호출. 병렬이지만 각각 독립 서버리스 인보케이션 + 외부 API 왕복이라 **종목 수에 정비례해 느려진다**. "예전보다 느려졌다"는 체감의 정체
7. **캐시 우회** — `market.ts`에 60초 TTL `getCachedStockQuote`가 있는데 자산 화면은 `getStockQuote`, 대시보드는 `getStockPrice`(둘 다 캐시 없음)를 썼다. 수동 새로고침 즉시성을 위한 의도적 선택이었으나, 로그인 → 대시보드 N회 → 자산 탭 N회 = 2N회가 됐다
8. **Edge Function에 서버 캐시 없음** — 호출마다 Yahoo/Finnhub 라이브 호출. 사용자수 × 종목수만큼 외부 API가 나가 Finnhub 무료 티어(분당 60회) 한도 위험
9. **국내 종목 왕복 2배** — `stock-price.ts`가 서픽스를 순차 시도해 코스닥 종목은 `.KS` 실패 후 `.KQ` 재시도
10. **배치 엔드포인트 없음** — 티커 1개 = 인보케이션 1회

## 3. 처리한 것

### 라우터 코드 스플리팅 (`ee9dcca`)

공개 진입점 `LoginView`만 정적으로 두고 나머지 43개를 라우트 단위 동적 import로 전환.

### `price_cache` 서버 캐시 (`400244e`)

`stock-price` Edge Function이 외부 API를 타기 전에 조회하는 전역 캐시 테이블. TTL 60초(`CACHE_TTL_MS`). 같은 티커를 여러 사용자·여러 화면이 공유하므로 적중률이 높다.

캐시 조회/저장 실패는 응답에 영향을 주지 않고 그대로 외부 API로 폴백한다 → 테이블 생성 전에 함수만 먼저 배포돼도 깨지지 않는다.

스키마는 **TABLE.md**, 동작은 **EDGE_FUNCTIONS.md** 참고.

**트레이드오프**: `market.ts` 주석의 "수동 새로고침 즉시성"이 깨진다. 새로고침해도 60초 내 재조회는 캐시값을 받는다.

### Vuetify 트리셰이킹 (`7182b40`, 수정 `c9c9aa2`)

`vite-plugin-vuetify`의 `autoImport`로 실사용 컴포넌트만 import. 전역 등록이 사라지면서 중복 포함되던 컴포넌트 CSS도 함께 빠졌다.

### 대시보드 논블로킹 (`e1bfe7a`)

저장된 `asset_summary` 값으로 화면을 먼저 그리고, 시세 재계산은 백그라운드로 돌린 뒤 현재자산만 갱신한다. 보유수량·평균단가는 시세와 무관하므로 현금 합계·상위 종목은 재계산하지 않는다.

저장된 값은 지난번 시세 기준이라 그대로 노출하면 틀린 금액을 잠깐 보여주게 되므로, 재계산 중에는 금액 자리에 플레이스홀더(`.hero-amount-pending`)를 둔다. 높이를 `.hero-amount`(1.75rem × 1.2 = 2.1rem)와 맞춰 레이아웃이 밀리지 않는다.

새로고침 연타 시 재계산이 겹쳐 시세 API 호출이 배가 되지 않도록 진행 중이면 건너뛴다.

## 4. 측정 결과

빌드 산출물에서 `index.html`이 초기 로드하는 파일의 gzip 합계.

| 시점 | 초기 전송량(gzip) |
| --- | --- |
| 원본 | 655 kB |
| 라우터 분할 후 | 458 kB |
| Vuetify 트리셰이킹 후 | **308 kB** |

누적 53% 감소. 티커명 테이블 147 kB도 초기 로드에서 빠져 해당 화면 진입 시에만 받는다.

## 5. ⚠️ 함정 — `vite-plugin-vuetify`의 `styles` 옵션

`styles: 'none'`은 **컴포넌트별 CSS 주입만 끄는 게 아니라 `import 'vuetify/styles'` 자체를 제거한다.** 이걸 모르고 설정했다가 빌드된 CSS에서 컴포넌트 스타일(`.v-btn`, `.v-card`)과 유틸리티 클래스(`.mx-auto`, `.d-flex`, `.pt-6`)가 전부 사라졌다. 타입 체크와 빌드는 멀쩡히 통과하므로 **빌드 산출물을 직접 확인하지 않으면 못 잡는다.**

기본값(`styles: true`)을 쓸 것. Vuetify 4는 `main.css`가 core+utilities+base만 담고 컴포넌트 스타일은 컴포넌트별 CSS 파일로 분리돼 있어, 자동 import된 컴포넌트만 자기 CSS를 가져오므로 중복이 생기지 않는다.

검증 방법:

```bash
vite build
grep -c '\.mx-auto\|\.v-btn' dist/assets/index-*.css   # 0이면 스타일이 빠진 것
```

## 6. 참고 — 개발 서버의 재최적화 메시지

`npm run dev` 중 아래 메시지가 뜨는 건 정상이다.

```
[vite] new dependencies optimized: vuetify/components/VTooltip, vuetify/components/transitions
[vite] optimized dependencies changed. reloading
```

플러그인이 컴포넌트별 경로로 import를 주입하는데 이게 Vite 초기 스캔에 안 잡혀서, 해당 컴포넌트를 처음 쓰는 화면에 들어갈 때 그때 최적화하며 리로드한다. 라우터 지연 로딩과 겹쳐 더 자주 보인다.

- **dev 전용**이다. `optimizeDeps`는 개발 서버(esbuild 사전 번들링) 개념이라 프로덕션 빌드에는 이 단계가 없다
- 결과가 `node_modules/.vite`에 캐시돼 화면을 한 바퀴 돌면 더 안 뜬다
- 거슬리면 `vite.config.ts`에 `optimizeDeps.include`로 컴포넌트 경로를 미리 등록하면 된다. 단 경로가 컴포넌트명과 1:1이 아니다 (`VCardTitle` → `vuetify/components/VCard`, `VExpandTransition` → `vuetify/components/transitions`)

## 7. 남은 것

| 항목 | 효과 | 비용 |
| --- | --- | --- |
| MDI 폰트 축소 | ~450 kB (CSS 55.7 kB gzip + woff2 393.8 kB) | 122곳 전부 수정. 큰 diff, 누락 시 아이콘이 조용히 사라짐 |
| 시세 배치 조회 | 인보케이션 N회 → 1회 | Edge Function + `market.ts` + 호출부 변경 |

**MDI** — 7,460개 중 122개만 쓴다. 아이콘 이름을 문자열로 조립하는 코드나 locale JSON에 박힌 아이콘명이 없어 122개를 정적으로 확정할 수 있다. `@mdi/js` SVG 전환(효과 최대, 큰 diff) 또는 폰트 서브셋팅(빌드 스크립트 필요) 중 선택.

**배치 조회** — `price_cache` 적용으로 캐시 적중 시 호출당 300ms → 20~50ms가 됐으므로 **가치가 불확실해졌다.** 자산 화면 체감을 먼저 확인하고 여전히 느릴 때만 진행할 것.

## 8. 손대지 않은 것

- **죽은 아이콘 311KB** — `public/icons/icon-512-v2.png`, `icon-192-v2.png`. `vite.config.ts`·`index.html` 모두 v3만 참조하는데 v2가 남아 있고, PWA `includeAssets: ['icons/*.png']`가 서비스워커 프리캐시에 포함시킨다
- **과대 로고 ~800KB** — `logo-main-light.png`·`logo-main-nature.png`가 1254×1254 / 각 430~456KB. 같은 세트인 dark·gold·space는 205~217px / 48~52KB이고 `.brand-logo`는 180px로 표시한다. 형제 파일 수준으로 리사이즈하면 ~100KB
