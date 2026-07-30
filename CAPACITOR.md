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

```bash
npx cap sync android
```

앱 아이콘을 바꿨다면 (`assets/icon.png` 가 원본, `public/icons/icon-512-v3.png` 사본):

```bash
npx @capacitor/assets generate --android
```

> 아이콘에 투명 영역이 있어 안드로이드 8+ 적응형 아이콘의 배경색이 비쳐 보인다. 현재 값은 생성 도구
> 기본값인 흰색(`android/app/src/main/res/values/ic_launcher_background.xml`)이다. 실기기에서 어색하면
> 브랜드 색(`#0E8A82`)으로 바꿀 것.

### 4-4. .aab 빌드 (서명 필요)

`android/` 에서 기존 TWA와 **같은 키로** 서명해야 한다. 서명 설정을 아직 옮기지 않았다면
`android/app/build.gradle`의 `signingConfigs`에 기존 keystore 경로·비밀번호를 넣는다.

```bash
cd android
./gradlew clean
./gradlew bundleRelease
```

산출물: `android/app/build/outputs/bundle/release/app-release.aab`

> keystore 파일과 비밀번호는 **저장소에 커밋하지 말 것** (`android/.gitignore`에서 `*.jks`, `*.keystore` 차단).

### 4-5. 업로드

플레이 콘솔 → **비공개 테스트 트랙** → 새 버전 만들기 → .aab 업로드.

**새 앱으로 만들지 말고 기존 앱의 업데이트로 올릴 것.** 패키지명이 같으므로 14일 카운트가 유지된다.

---

## 5. 실기기 검증 항목

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

마지막 항목은 반영까지 하루 이상 걸린다. 여기서 숫자가 잡히기 시작하면 원인 분석이 맞았다는 뜻이다.

---

## 6. 알려진 제약

- **오프라인**: `server.url` 방식이라 첫 로드에 네트워크가 필요하다. 다만 웹의 서비스 워커가 웹뷰에서도
  동작하므로 재방문 시 캐시는 살아 있다.
- **웹 번들 비용**: `@capacitor/core`(gzip 약 3.1 KB)가 웹·앱인토스 번들에도 포함된다. `supabase.ts`가
  클라이언트 생성 시점에 `isNativeApp()`을 동기로 필요로 하기 때문이다. 나머지 네이티브 전용 코드
  (`nativeAuth`, `@capacitor/app`, `@capacitor/browser`)는 동적 import라 앱에서만 내려받는다.
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
