# Fire Path - 서비스 URL 모음

## 🚀 FirePath 배포 URL

| 플랫폼             | URL                                       |
| ------------------ | ----------------------------------------- |
| Vercel             | https://my-investment-kappa.vercel.app    |
| Netlify            | https://firepath-v1.netlify.app/          |
| Cloudflare Workers | https://firepath.tngus842655.workers.dev/ |

---

## ⚙️ 개발 인프라

| 서비스     | 용도                       | URL                                                         |
| ---------- | -------------------------- | ----------------------------------------------------------- |
| GitHub     | 소스코드 저장소            | https://github.com/tngus842655/my-investment                |
| Supabase   | DB / Auth / Edge Functions | https://supabase.com/dashboard/project/szkqvqiuibyjshrlyyxa |
| Vercel     | 배포                       | https://vercel.com/dashboard                                |
| Netlify    | 배포                       | https://app.netlify.com                                     |
| Cloudflare | Workers / Pages            | https://dash.cloudflare.com                                 |

---

## 📊 API / 데이터

| 서비스  | 용도                      | URL                          |
| ------- | ------------------------- | ---------------------------- |
| Finnhub | 주식 시세 / 종목 정보 API | https://finnhub.io/dashboard |

---

## 🎨 디자인 / 에셋

| 서비스    | 용도             | URL                          |
| --------- | ---------------- | ---------------------------- |
| remove.bg | 이미지 배경 제거 | https://www.remove.bg/ko     |
| Flaticon  | 아이콘           | https://www.flaticon.com/kr/ |

## Cloudflare 수동배포

npx wrangler login
npx wrangler deploy
firepath / Vite / dist

##

| 서비스     | 용도                           | URL                      |
| ---------- | ------------------------------ | ------------------------ |
| PWABuilder | 모바일 앱 배포시 .aab파일 생성 | https://www.remove.bg/ko |

## 로컬에서 배포 (Android 프로젝트)

⚠️ **2026-07-31부터 TWA에서 Capacitor로 전환했다. 아래 예전 절차는 더 이상 쓰지 않는다.**
`C:\Workspace\FirePath-TWA` 에서 빌드하면 크롬을 띄우는 예전 앱이 그대로 나온다.
빌드는 이 저장소의 `my-investment\android` 에서 하고, 절차는 **CAPACITOR.md** 4절 참고.

<details>
<summary>예전 TWA 빌드 절차 (사용 중지)</summary>

1. build.gradle 버전 수정
   C:\Workspace\FirePath-TWA\app\build.gradle 열기
   versionCode 3 // +1
   versionName "1.0.0.3" // 수정

2. CMD에서 명령어 실행
   cd C:\Workspace\FirePath-TWA
   gradlew.bat clean
   gradlew.bat bundleRelease

3. 생성 .aab 파일경로
   C:\Workspace\FirePath-TWA\app\build\outputs\bundle\release\app-release.aab

</details>

## 로컬에서 배포 (Capacitor, 2026-07-31~) — 현재 방식

빌드 폴더가 `C:\Workspace\my-investment\android` 로 바뀌었다. **예전 TWA 폴더에서 빌드하면
크롬을 띄우는 예전 앱이 나온다.** 배경과 상세는 **CAPACITOR.md** 참고.

### 최초 1회만 — PC 준비

1. **JDK 21 설치** (`java -version`으로 확인)
   Capacitor 8이 `JavaVersion.VERSION_21`을 요구한다. 낮으면 `invalid source release: 21`로 실패.

2. **Android SDK Platform 36** 설치
   Android Studio → SDK Manager → Android 16 (API 36) 체크 → Apply.
   없으면 `Failed to find target with hash string 'android-36'` 오류.

3. **`android\local.properties`** 생성 — SDK 경로 (PC마다 달라 저장소에 없음)
   예전 TWA 폴더의 `local.properties`를 복사해 오면 된다.
   ```properties
   sdk.dir=C:/Users/사용자명/AppData/Local/Android/Sdk
   ```

4. **`android\keystore.properties`** 생성 — 서명키 (저장소에 없음, gitignore 대상)
   **예전 TWA와 같은 키**여야 한다. 다른 키면 "업로드 인증서가 일치하지 않습니다"로 거부된다.
   값 4개는 예전 `FirePath-TWA\app\build.gradle`의 `signingConfigs` 블록에 적혀 있다.
   ```properties
   storeFile=C:/Workspace/FirePath-TWA/signing.keystore
   storePassword=...
   keyAlias=...
   keyPassword=...
   ```
   > 경로 구분자는 `\` 대신 `/`를 쓸 것 (`.properties`에서 `\`는 이스케이프 문자).

### 매번 하는 배포

1. **웹 먼저 배포** — 앱이 `server.url`로 배포된 웹(`firepath.me`)을 띄우므로 웹이 최신이어야 한다.

2. **versionCode 올리기** — `android\app\build.gradle`
   ```gradle
   versionCode 5        // 플레이 콘솔의 현재 최고값보다 크게
   versionName "1.0.0.5"
   ```

3. **CMD에서 명령어 실행**
   ```cmd
   cd C:\Workspace\my-investment
   npx cap sync android

   cd android
   gradlew.bat clean
   gradlew.bat bundleRelease
   ```
   `npx cap sync android`가 예전에 없던 단계다. `dist` 폴더가 없다는 경고는 무시해도 된다
   (`server.url`을 쓰므로 웹 파일을 번들에 넣지 않는다 — Capacitor가 "not an error"라고 알려준다).

4. **생성 .aab 파일경로**
   ```
   C:\Workspace\my-investment\android\app\build\outputs\bundle\release\app-release.aab
   ```

5. **플레이 콘솔 업로드** — 반드시 **기존 앱의 업데이트**로 올린다.
   새 앱으로 만들면 비공개 테스트 14일 카운트가 초기화된다.

### 업로드 시 뜨는 경고 (정상)

| 경고 | 이유 |
| --- | --- |
| 지원 기기 약 2,100개 감소 | Capacitor가 `minSdk 24`를 요구해서다(예전 TWA는 19~21). 기기 **모델 수**지 사용자 수가 아니며 안드로이드 6 이하 대상이다. 낮출 수 없다 |
| 난독화 파일 없음 | `minifyEnabled false`라 매핑 파일이 없는 게 정상. 심사와 무관 |
| 용량 1.5MB → 3.7MB | 크롬에 넘기지 않고 앱이 직접 WebView를 띄우는 코드가 들어간 것. 늘어나야 정상 |

### 설치 후 확인

`server.url` 방식이라 화면만 봐서는 예전 TWA와 구분이 안 된다. 로그인 화면의
**"홈 화면에 추가" 배너가 사라졌으면** Capacitor 빌드가 맞다 (배너는 `isNativeApp()`이
참일 때만 숨기는데, 그건 Capacitor 브리지가 있어야 참이 된다).
