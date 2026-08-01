# CAPACITOR.md

안드로이드 앱(플레이스토어) 빌드·배포 가이드. **TWA를 대체한다.**

---

## 1. 왜 바꿨나

플레이 프로덕션 액세스가 "테스터가 앱에 참여하지 않았습니다"로 거절됐다. 콘솔상 테스터 12명·기간 조건은
이미 충족돼 있었고 실제 접속자도 있었다. 원인은 **TWA 구조상 사용 시간이 앱이 아니라 크롬에 집계되는 것**으로
판단했다. TWA는 앱의 `LauncherActivity`가 크롬 `CustomTabActivity`를 띄우고 스스로 종료하므로, 화면을 점유하는
액티비티가 크롬 소유다. 자세한 근거는 `RN_MIGRATION.md` 0절 참고.

Capacitor는 `WebView`를 **앱 자신의 `MainActivity`·프로세스 안에서** 띄운다. 사용 시간이 `com.firepath.app`에
집계되므로 이 문제가 해소된다.

**화면 내용은 그대로 배포된 웹(`https://firepath.me`)을 띄운다** (`capacitor.config.ts`의 `server.url`).
TWA와 동일하게 **웹만 배포하면 앱 재출시 없이 내용이 갱신된다.**

---

## 2. 바뀐 것 / 안 바뀐 것

| | 상태 |
| --- | --- |
| 패키지명 `com.firepath.app` | **동일 유지** — 바뀌면 별도 앱이 되어 14일 테스트 카운트가 초기화된다 |
| 서명키 | **기존 것 그대로 써야 함** (`C:\Workspace\FirePath-TWA` 의 keystore). 다른 키로 서명하면 업로드 거부 |
| 웹 코드 | 그대로. `server.url`이 배포된 웹을 가리킨다 |
| 웹·PWA·앱인토스 | 영향 없음 |
| `assetlinks.json` | 그대로 두면 된다 (App Links용, 유지해도 무해) |

---

## 3. ⚠️ 사전 준비 — Supabase 설정 (최초 1회, 필수)

SNS 로그인이 동작하려면 **Supabase 대시보드에 딥링크를 등록해야 한다.**

> Authentication → URL Configuration → **Redirect URLs** 에 추가:
>
> ```
> com.firepath.app://auth-callback
> ```

등록하지 않으면 구글·카카오 로그인이 인증 후 앱으로 돌아오지 못한다.

### 왜 딥링크가 필요한가

구글은 2023-07-24부터 임베디드 웹뷰에서 오는 OAuth 요청을 `disallowed_useragent`로 차단한다. TWA는 크롬
자체라 통과했지만 Capacitor의 `WebView`는 차단 대상이다. 그래서 인증 페이지만 시스템 브라우저로 띄우고
(`@capacitor/browser`), 끝나면 위 딥링크로 앱에 복귀시킨다.

관련 코드:

| 파일 | 역할 |
| --- | --- |
| `src/services/nativeApp.ts` | `isNativeApp()`, 딥링크 상수 |
| `src/services/nativeAuth.ts` | 브라우저로 인증 열기 + 복귀 시 코드→세션 교환 |
| `src/services/supabase.ts` | 네이티브만 PKCE 플로우 (웹은 기존 implicit 유지) |
| `android/.../AndroidManifest.xml` | 딥링크 intent-filter |

---

## 4. 빌드 절차

### 4-1. 웹 배포 먼저

앱은 배포된 웹을 띄우므로 **웹이 최신이어야 한다.**

```bash
npm run deploy          # Cloudflare Workers
```

### 4-2. versionCode 올리기

`android/app/build.gradle`:

```gradle
versionCode 100         // ⚠️ 플레이 콘솔의 현재 값보다 커야 한다
versionName "2.0.0"
```

> 플레이 콘솔 → 앱 → 버전 정보에서 현재 최고 versionCode를 확인하고 그보다 큰 값으로 수정할 것.
> 같거나 작으면 업로드가 거부된다. (기존 TWA는 `versionCode 3`부터 올려온 이력이 있어 실제 값 확인 필요)

### 4-3. 네이티브 프로젝트 동기화

`capacitor.config.ts`나 플러그인을 바꿨을 때만 필요하다.
(`@capawesome/capacitor-app-update`를 추가한 뒤로 `android/capacitor.settings.gradle`과
`android/app/capacitor.build.gradle`에 그 항목이 들어가 있어야 한다 — 8절 참고)

```bash
npm run build:android      # = vue-tsc --build + cap sync android
```

> `build:android`에 `vite build`는 **일부러 넣지 않았다.** `server.url`을 쓰므로 앱은 로컬 `dist`가
> 아니라 배포된 웹을 띄운다. 여기서 빌드한 `dist`는 `.aab`에 들어가긴 해도 실행 시 쓰이지 않는다.
> **앱 화면 내용을 바꾸려면 `npm run deploy`(웹 배포)를 해야 한다** — `build:android`로는 안 바뀐다.

앱 아이콘을 바꿨다면 (`assets/icon.png` 가 원본, `public/icons/icon-512-v3.png` 사본):

```bash
npx @capacitor/assets generate --android
```

> 아이콘에 투명 영역이 있어 안드로이드 8+ 적응형 아이콘의 배경색이 비쳐 보인다. 현재 값은 생성 도구
> 기본값인 흰색(`android/app/src/main/res/values/ic_launcher_background.xml`)이다. 실기기에서 어색하면
> 브랜드 색(`#0E8A82`)으로 바꿀 것.

### 4-4. .aab 빌드 (서명 필요)

> ⚠️ **예전 TWA 프로젝트(`C:\Workspace\FirePath-TWA`)에서 빌드하면 안 된다.** 그건 크롬을 띄우는
> 예전 앱이라, 버전만 올려 올리면 이번 변경이 전혀 반영되지 않는다. 반드시 이 저장소의
> `my-investment/android` 에서 빌드할 것.

**서명키 설정 (최초 1회)** — 기존 TWA와 **같은 키**로 서명해야 한다. 다른 키면 "업로드 인증서가
일치하지 않습니다"로 거부된다. 예전 프로젝트 폴더에서 keystore 파일(`*.keystore` 또는 `*.jks`,
PWABuilder는 보통 `signing.keystore`)을 찾아 경로를 적는다.

`android/keystore.properties` 파일을 만든다 (gitignore 처리되어 커밋되지 않는다):

```properties
storeFile=C:/Workspace/FirePath-TWA/signing.keystore
storePassword=<기존 비밀번호>
keyAlias=<기존 alias>
keyPassword=<기존 키 비밀번호>
```

> 경로 구분자는 `\` 대신 `/`를 쓴다(`.properties`에서 `\`는 이스케이프 문자).
> 이 파일이 없으면 서명 없이 빌드되므로, 업로드용 빌드 전에 반드시 만들어야 한다.

**빌드** — JDK 21이 필요하다 (`sourceCompatibility JavaVersion.VERSION_21`). 낮으면
`invalid source release: 21` 로 실패한다. `java -version` 으로 확인할 것.

```bash
cd android
./gradlew clean
./gradlew bundleRelease
```

산출물: `android/app/build/outputs/bundle/release/app-release.aab`

**R8(코드 축소·난독화)이 켜져 있다** (`minifyEnabled true`). 끄면 매핑 파일이 안 생겨서 플레이 콘솔이
업로드마다 "이 App Bundle 유형과 연결된 가독화 파일이 없습니다" 경고를 띄운다. 켜두면 AGP가
`mapping.txt`를 `.aab` 안에 같이 넣어주므로 경고가 사라지고, 콘솔에서 크래시 스택도 원래 이름으로 보인다.

> ⚠️ R8은 **런타임에만 드러나는 문제**를 만들 수 있다. 리플렉션으로 로드되는 클래스가 잘려나가는 게
> 대표적인데, Capacitor 플러그인은 `capacitor-android`가 `consumerProguardFiles`로 넣어주는
> `-keep public class * extends com.getcapacitor.Plugin { *; }` 가 지켜주고, 웹뷰 JS 브리지는 AGP 기본
> `proguard-android.txt`의 `@JavascriptInterface` 규칙이 지켜준다. 그래도 **릴리스 빌드를 실기기에
> 설치해 5절 체크리스트를 한 번 돌려본 뒤 업로드할 것.** 문제가 생기면 `minifyEnabled false`로 되돌리면
> 되고, 그때는 경고가 다시 뜨지만 업로드 자체는 막히지 않는다(경고일 뿐 오류가 아니다).

### 4-5. 업로드

플레이 콘솔 → **비공개 테스트 트랙** → 새 버전 만들기 → .aab 업로드.

**새 앱으로 만들지 말고 기존 앱의 업데이트로 올릴 것.** 패키지명이 같으므로 14일 카운트가 유지된다.

---

## 5. 실기기 검증 항목

### 먼저 — 설치된 앱이 TWA인지 Capacitor인지 판별

`server.url` 방식이라 **화면만 봐서는 구분이 안 된다.** 버전 번호도 예전 프로젝트에서 올릴 수 있어
확실한 근거가 못 된다. 아래 둘로 판별한다.

| 확인 | TWA (예전) | Capacitor (현재) |
| --- | --- | --- |
| 로그인 화면 "홈 화면에 추가" 배너 | **보임** | **없음** |
| 구글 로그인 | 화면 안에서 그대로 넘어감 | **브라우저 창이 따로 떴다가** 앱으로 복귀 |

배너 판별이 확실한 이유: 배너는 `isNativeApp()`이 참일 때만 숨기는데, 그건 Capacitor 브리지
(`window.androidBridge`)가 주입돼야만 참이 된다. TWA에는 그 브리지가 없다.


웹뷰 안에서만 드러나는 문제가 있어 **실기기 확인이 필요하다.** 타입 체크·빌드로는 잡히지 않는다.

- [ ] 앱 실행 → 로그인 화면이 정상 표시되는가
- [ ] **이메일 로그인** 성공 → 마지막 사용 모듈로 이동하는가
- [ ] **구글 로그인** — 시스템 브라우저가 뜨고, 인증 후 앱으로 돌아와 로그인되는가
      (`disallowed_useragent` 오류가 뜨면 브라우저 우회가 동작하지 않은 것)
- [ ] **카카오 로그인** — 위와 동일
- [ ] 앱 완전 종료 후 재실행 시 **세션이 유지**되는가
- [ ] 하드웨어 뒤로가기 버튼이 화면 단위로 동작하는가 (즉시 종료되지 않는가)
- [ ] 로그인 화면에 **"홈 화면에 추가" 배너가 뜨지 않는가** (앱에서는 숨기도록 처리함)
- [ ] 당겨서 새로고침이 이중으로 뜨지 않는가
- [ ] 소셜 계정 연결(`/linked-accounts`)이 동작하는가
- [ ] 런처 아이콘이 FirePath 아이콘으로 보이는가 (배경색이 어색하지 않은가 — 4-3절 참고)
- [ ] 앱 사용 후 **플레이 콘솔 통계에 일일 활성 사용자가 잡히는가** ← 이번 변경의 핵심 목적
- [ ] **업데이트 안내 팝업** — 더 높은 versionCode를 테스트 트랙에 올린 뒤, 낮은 버전이 깔린 기기에서
      앱을 켰을 때 팝업이 뜨는가 (8절 참고. 로컬 빌드로는 확인이 안 된다)
- [ ] ⚠️ **R8을 켠 뒤 첫 릴리스 빌드**라면 위 항목을 `bundleRelease` 산출물로 한 번 더 돌려볼 것.
      디버그 빌드는 R8을 타지 않아 여기서 걸러지지 않는다 (4-4절 참고)

플레이 콘솔 통계 항목은 반영까지 하루 이상 걸린다. 여기서 숫자가 잡히기 시작하면 원인 분석이 맞았다는 뜻이다.

---

## 6. 알려진 제약

- **오프라인**: `server.url` 방식이라 첫 로드에 네트워크가 필요하다. 다만 웹의 서비스 워커가 웹뷰에서도
  동작하므로 재방문 시 캐시는 살아 있다.
- **웹 번들 비용**: `@capacitor/core`(gzip 약 3.1 KB)가 웹·앱인토스 번들에도 포함된다. `supabase.ts`가
  클라이언트 생성 시점에 `isNativeApp()`을 동기로 필요로 하기 때문이다. 나머지 네이티브 전용 코드
  (`nativeAuth`, `appUpdate`, `AppUpdateDialog`, `@capacitor/app`, `@capacitor/browser`,
  `@capawesome/capacitor-app-update`)는 동적 import라 앱에서만 내려받는다.
- **정책 4.3(최소 기능)**: 콘텐츠 심사에서 "웹사이트 껍데기" 지적을 받을 여지는 남아 있다. 실기능 42화면
  규모라 위험은 낮다고 보지만, 지적받으면 네이티브 플러그인(푸시 알림, 생체인증 등)으로 보강한다.

---

## 7. 이 변경으로 해결되지 않는 것

거절 사유 2번 — **"사용자 의견을 수집하고 조치를 취하는 등의 테스트 권장사항을 따르지 않았습니다"** 는
그대로 남아 있다. 재신청 전 14일 동안:

1. 테스터에게 피드백을 받고 (앱 내 `/feedback` 화면 활용)
2. 받은 피드백을 반영한 빌드를 **비공개 트랙에 1회 이상 더 올려야** 한다

프로덕션 신청서에도 "테스터를 어떻게 모집했는지 / 어떤 피드백을 받아 무엇을 고쳤는지"를 구체적으로 적어야
한다. 빈칸이나 형식적인 답변은 거절 사유가 된다.

---

## 8. 앱 업데이트 안내 팝업

새 `.aab`를 올렸을 때 **안드로이드 앱 사용자에게만** "새 버전이 나왔어요" 팝업을 띄운다. 필수가 아니라
선택이며, "나중에"를 누르면 **같은 버전은 24시간 동안 다시 묻지 않는다.**

### 왜 버전 번호를 우리가 관리하지 않나

앱은 자기 versionCode만 알지 스토어의 최신 버전은 모른다. 그래서 "최신 버전 값"을 웹 상수나 DB에 두는
방법을 먼저 검토했는데, 둘 다 **웹 배포가 먼저이고 플레이 심사가 나중**이라는 순서(4절) 때문에 심사가
끝나기 전에 팝업이 떠서 "스토어에 갔는데 업데이트 버튼이 없는" 상태가 생긴다.

Google Play In-App Updates API(`@capawesome/capacitor-app-update`)는 플레이가 직접 업데이트 유무를
판정하므로 이 문제가 없다. **실제로 내려받을 수 있게 된 시점부터만** 안내가 뜨고, 새 버전을 낼 때마다
고쳐야 할 값이 없다.

### 구성

| 파일 | 역할 |
| --- | --- |
| `src/services/appUpdate.ts` | 업데이트 조회(`getAppUpdateInfo`), 24시간 스누즈, 스토어 열기 |
| `src/components/common/AppUpdateDialog.vue` | 팝업 UI + 앱 시작·복귀 시 검사 |
| `src/App.vue` | `isNativeApp()`일 때만 위 컴포넌트를 렌더 (동적 import) |

- 웹·PWA·앱인토스는 `isNativeApp()`이 false라 렌더 자체가 안 되고, 청크도 내려받지 않는다.
- 검사 시점은 **앱 시작 시 + 백그라운드에서 돌아올 때**(`appStateChange`). 앱을 완전히 종료하지 않는
  사용자에게도 24시간 뒤 안내가 닿게 하기 위함이다.
- "업데이트"를 눌러도 스누즈를 남긴다. 스토어에 갔다가 업데이트하지 않고 돌아오면 복귀 검사가 곧바로
  다시 띄우기 때문이다.
- 화면에 버전 번호를 적지 않는다. 안드로이드는 새 버전의 `versionName`을 주지 않고
  (`availableVersionName`은 iOS 전용) `versionCode` 숫자만 오는데, 그건 사용자에게 의미가 없다.

### ⚠️ 확인 방법 — 로컬 빌드로는 안 된다

In-App Updates API는 **플레이스토어를 통해 설치된 빌드**에서만 동작한다. `./gradlew` 로 만든 디버그
빌드나 사이드로드 설치본에서는 조회가 실패하고, 그때는 팝업을 띄우지 않고 조용히 넘어간다(정상 동작).

실제 확인은 이렇게 한다:

1. 이 팝업이 들어간 빌드를 테스트 트랙에 올린다 (예: `versionCode 7`)
2. 그 버전을 스토어에서 설치한다
3. 더 높은 버전(`versionCode 8`)을 같은 트랙에 올리고 심사가 끝날 때까지 기다린다
4. 기기에서 앱을 켜면 팝업이 떠야 한다

> **이 기능은 다음 릴리스부터 동작한다.** 지금 설치돼 있는 `versionCode 6`에는 이 코드가 없으므로,
> 6 사용자는 7로 올라온 것을 안내받지 못한다. 7 이상을 쓰는 사용자부터 적용된다.
