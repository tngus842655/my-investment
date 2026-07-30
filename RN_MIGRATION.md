# RN_MIGRATION.md

React Native 전면 전환 계획. **코드 작업 착수 전 단계 문서** — 실제 이식은 4절(방식 결정)과 9절(미해결 질문)이
정리된 뒤 시작한다.

---

## 0. 배경과 결정 사항

2026-07-30 구글 플레이 프로덕션 액세스 신청이 거절됐다. 거절 메일 제목은 "프로덕션에 액세스하려면 추가 테스트
필요"였고, 사유는 두 가지였다.

1. 비공개 테스트 중 테스터가 앱에 참여(= 실사용)하지 않음
2. 사용자 의견을 수집하고 이를 반영한 앱 업데이트를 올리지 않음

### 실제 원인 — TWA의 참여 신호 미집계

**콘솔 확인 결과 앞의 두 체크포인트는 이미 충족돼 있었다.**

- ✅ 비공개 테스트 버전 게시
- ✅ 12명 이상의 테스터가 비공개 테스트 참여를 선택
- ○ 검토일부터 12명 이상을 대상으로 **14일 더** 비공개 테스트 실행 ← 거절과 동시에 자동으로 새로 걸린 조건

즉 테스터 수와 기간은 문제가 아니었다. 실제 접속자도 있었다. 그럼에도 "테스터가 앱에 참여하지 않았습니다"가
사유로 나온 것은 **TWA 구조상 사용 신호가 앱 패키지로 집계되지 않기 때문**일 가능성이 높다.

**메커니즘:** TWA는 앱의 `LauncherActivity`가 크롬의 `CustomTabActivity`를 띄운 뒤 스스로 종료한다. 이후 화면에
떠 있는 액티비티는 **크롬 패키지 소유**이고 크롬 프로세스에서 렌더링된다. 안드로이드가 기록하는 포그라운드
사용 시간이 앱이 아니라 크롬에 붙는 구조라, 플레이의 참여도 측정에는 "설치는 됐는데 아무도 안 쓴 앱"으로
보인다. 2026년부터 이 판정이 사람 검토에서 AI 자동 분석으로 바뀌면서 더 기계적으로 걸러진다.

7,400개 이상의 앱을 분석한 자료에서도 TWA·PWA 래퍼 빌드가 네이티브·WebView 빌드보다 이 사유로 거절되는
비율이 두드러지게 높다고 보고된다. (출처가 테스터 모집 업체라 이해관계가 있고, 구글이 정확한 텔레메트리를
공개하지 않아 단정할 수는 없다. 다만 위 메커니즘은 기술적으로 일관되고 증상과 정확히 맞는다.)

> **정정 이력:** 이 문서 최초 작성 시에는 "거절은 테스트 요건 문제일 뿐 TWA와 무관"하다고 적었으나, 콘솔
> 스크린샷(12명·기간 충족)과 위 자료로 확인한 결과 **TWA가 직접적 원인일 가능성이 높다.** 해당 판단을 정정한다.

### 이것이 전환 방식 결정에 미치는 영향

문제의 핵심은 "웹이냐 네이티브냐"가 아니라 **웹뷰가 앱 자신의 프로세스·액티비티 안에서 도느냐**다. 이 조건만
만족하면 참여 신호는 정상 집계된다. 따라서 RN 전면 재작성 말고 **Capacitor 래핑**이라는 훨씬 싼 해법이 있다.
4-1절 참고. 두 방식의 비용 차이가 크므로 착수 전에 반드시 비교할 것.

또 하나 중요한 실무 사항 — **패키지명을 그대로 유지하고 업데이트로 올리면 14일 카운트가 초기화되지 않는다.**
현재 카운터가 이미 돌고 있으므로, 어떤 방식을 택하든 새 패키지로 올리지 말 것.

---

## 1. 현황 실측 (2026-07-30 기준)

| 항목 | 값 |
| --- | --- |
| `src` 전체 | 119 파일 / 32,884줄 |
| 화면·레이아웃·컴포넌트 (`.vue`) | 66 파일 / 25,530줄 |
| 순수 데이터 (`tickerNames.*`) | 4 파일 / 약 4,960줄 — **100% 이식 가능** |
| 라우트 수 | 42개 (자산 13, 가계부 6, 관리자 10, 공용·인증 13) |
| 사용 중인 Vuetify 컴포넌트 | 34종 (상위 4종이 전체 사용량의 약 60%) |
| 인라인 SVG 차트 보유 화면 | 10개 (차트 라이브러리 없음 — 전부 손으로 그린 SVG) |
| 테스트 | **없음** (프레임워크 미설치, 테스트 파일 0개) |

Vuetify 사용 분포 — 상위만:

```
v-icon 204   v-btn 188   v-card 67   v-text-field 55   v-container 38
v-skeleton-loader 36   v-divider 35   v-dialog 29   v-spacer 25
```

꼬리가 매우 짧다. `v-date-picker`, `v-combobox`, `v-window` 등은 1~3회씩만 쓰인다. **UI 킷 전체를 대체할 필요가
없고, 상위 12종 정도만 만들면 화면 코드의 대부분이 커버된다.**

---

## 2. 바뀌지 않는 것 — 백엔드 전체

이번 전환 범위는 **클라이언트 표현 계층뿐**이다. 아래는 손대지 않는다.

- Supabase 프로젝트, 인증, RLS, 테이블 스키마 (`TABLE.md`, `BUDGET_TABLE.md`)
- Edge Function 9개 전부 (`EDGE_FUNCTIONS.md`) — `stock-price`, `exchange-rate`, `etf-info`, `etf-backtest`,
  `etf-dividend`, `admin-delete-user`, `admin-reset-password`, `toss-login`, `toss-disconnect`
- DB 트리거 / RPC / pg_cron

`@supabase/supabase-js`는 RN에서 그대로 동작한다(스토리지 어댑터만 교체). **서버 재작성은 0.**

---

## 3. 스택 결정

### 3-1. 프레임워크 — Expo (권장)

| | Expo SDK + EAS Build | bare React Native |
| --- | --- | --- |
| .aab 빌드 | EAS가 클라우드 빌드 → 로컬 안드로이드 툴체인 불필요 | 로컬 Android Studio/Gradle 필요 |
| OAuth 딥링크 | `expo-auth-session`이 처리 | 직접 구현 |
| 라우팅 | `expo-router` — 파일 기반, 현행 URL 구조와 1:1 | React Navigation 수동 구성 |
| 빠른 수정 배포 | EAS Update (OTA) | 별도 구성 |

**Expo를 권장한다.** 특히 `expo-router`가 현행 vue-router 경로 구조를 거의 그대로 옮길 수 있다는 점이 크다.

> ⚠️ EAS Update(OTA)는 **플레이 심사용 "업데이트 이력"으로 인정되지 않는다.** 0절의 거절 사유 2번을 해소하려면
> 비공개 테스트 트랙에 실제 빌드를 올려야 한다. OTA는 개발 속도용으로만 쓸 것.

### 3-2. UI — 자체 `Fp*` 프리미티브 (권장)

| | 자체 프리미티브 + `react-native-svg` | React Native Paper |
| --- | --- | --- |
| 기존 5개 테마(light/dark/nature/space/gold) | 그대로 유지 | Paper 테마 체계와 충돌, 재매핑 필요 |
| 앱 고유 비주얼 | 유지 | Material 3 룩으로 변함 |
| 초기 작업량 | 12종 직접 제작 | 설치 즉시 사용 |
| 의존성 | 최소 | 큰 UI 킷 하나 추가 |

**자체 프리미티브를 권장한다.** 1절에서 본 대로 필요한 컴포넌트가 12종 남짓이고, 이미 `src/design`에 테마
5종 × 토큰 체계가 갖춰져 있어 Paper를 얹으면 오히려 두 개의 테마 시스템을 동기화해야 한다. 다만 초기 2~3주는
Paper 쪽이 확실히 빠르므로, 일정이 최우선이라면 뒤집을 만한 결정이다.

만들 프리미티브: `FpIcon` `FpButton` `FpCard` `FpTextField` `FpScreen` `FpSkeleton` `FpDivider` `FpDialog`
`FpChip` `FpSpinner` `FpSelect` `FpTooltip`

### 3-3. 나머지

| 영역 | 현행 | 전환 후 | 비고 |
| --- | --- | --- | --- |
| 아이콘 | `@mdi/font` + `v-icon` | `@expo/vector-icons`의 `MaterialCommunityIcons` | **동일한 MDI 아이콘 셋**. `mdi-wallet` → `name="wallet"`. 204곳 기계적 치환 |
| 차트 | 인라인 `<svg>` | `react-native-svg` | 태그명만 대문자로 (`<path>`→`<Path>`). 좌표 계산 로직 그대로 |
| 로컬 저장소 | `localStorage` (동기) | `react-native-mmkv` (**동기**) | AsyncStorage는 비동기라 호출부를 전부 async로 바꿔야 함. MMKV는 시그니처 유지 가능 |
| i18n | `vue-i18n` | `react-i18next` | `locales/ko.json`, `en.json` 그대로 재사용 |
| 상태 | Pinia 1개 스토어 + 모듈 레벨 ref | `zustand` | 현행도 사실상 모듈 레벨 상태라 대응이 단순 |
| 엑셀 | `read-excel-file` / `write-excel-file` | `xlsx`(SheetJS) + `expo-document-picker` + `expo-file-system` + `expo-sharing` | 6절 최고 난이도 항목 |
| 드래그 정렬 | `vue-draggable-plus` / `sortablejs` | `react-native-draggable-flatlist` | 가계부 3개 화면 |

---

## 4. 방식 결정 — ⚠️ 착수 전 최우선

### 4-1. Capacitor vs React Native

0절에서 확인했듯 문제의 원인은 **웹뷰가 크롬 프로세스에서 도는 것**이지 "웹 기술을 쓴 것"이 아니다. 그렇다면
해법도 두 가지 층위가 있다.

| | **Capacitor 래핑** | **RN 전면 전환** |
| --- | --- | --- |
| 기존 Vue 코드 | **그대로 사용** (재작성 0) | 화면 66개 25,530줄 재작성 |
| 참여 신호 집계 | 앱 자신의 `MainActivity` 안 `WebView` → **정상 집계** | 네이티브 → 정상 집계 |
| 작업 기간 | **수일** | 수개월 |
| 14일 카운터 | 패키지명 유지 시 **보존** — 지금 주기 안에 반영 가능 | 완성될 때까지 주기를 계속 흘려보냄 |
| 토스 미니앱 | **영향 없음** (웹 빌드가 그대로 소스) | 4-2절 문제 발생 |
| 정책 4.3(최소 기능) | 심사 대상이나, 42화면·실기능 앱이라 위험 낮음. 네이티브 플러그인 추가로 보강 가능 | 해당 없음 |
| 네이티브 성능·기능 | 웹뷰 수준 | 완전한 네이티브 |
| iOS 확장 | 가능 (동일 방식) | 가능 |

**참여도 문제만 보면 Capacitor로 충분하다.** 필요한 건 "앱 패키지가 포그라운드를 점유하는 구조"뿐이고,
Capacitor는 `android.webkit.WebView`를 앱 자신의 액티비티·프로세스 안에서 띄우므로 이 조건을 만족한다.
게다가 지금 14일 카운터가 이미 돌고 있어서, **수일 안에 올릴 수 있는 해법과 수개월짜리 해법의 차이가 크다.**

권장 순서:

1. **먼저 Capacitor 빌드를 같은 패키지명으로 비공개 트랙에 업데이트로 올린다** → 참여 신호 집계 복구,
   카운터 보존, 이번 주기 안에 재신청 가능
2. RN 전환은 **이 거절 건과 분리해서**, 네이티브 성능·기능·iOS 확장이 필요한지를 기준으로 따로 판단한다

RN을 택하더라도 1번을 먼저 하는 게 손해가 아니다. 전환 기간 동안 앱이 스토어에 살아 있게 된다.

### 4-2. 토스 미니앱 트랙 (RN을 택할 경우에만 해당)

> Capacitor를 택하면 이 문제는 발생하지 않는다. 웹 빌드가 그대로 미니앱 소스로 남기 때문이다.

**RN 전환 시 이번 작업에서 가장 큰 미결 변수다.**

현재 앱인토스 미니앱은 `@apps-in-toss/web-framework` + `granite.config.ts`로 **지금의 Vue 웹 빌드를 그대로**
띄운다(`granite.config.ts`의 `web.commands.build: 'vite build'`). 즉 웹 코드베이스와 미니앱이 한 몸이다.
RN으로 가면 이 연결이 끊어진다.

선택지:

| 안 | 내용 | 비용 |
| --- | --- | --- |
| **(a) 웹 유지 + RN 병행** | Vue 앱은 PWA·토스 미니앱용으로 계속 살리고, 플레이스토어용 RN 앱을 별도 운영 | **모든 기능을 두 번 구현.** 장기 유지비가 가장 큼 |
| **(b) 토스도 RN 트랙으로 이전** | 앱인토스의 React Native 프레임워크로 미니앱도 이전, 코드베이스 1개 유지 | 이전 비용 1회. **단 앱인토스 RN 지원 범위 확인 필요** |
| **(c) 미니앱 포기** | 토스 트랙 종료, RN 단일 | 확보한 토스 유입 포기 |

**(b)가 성립하면 (b)가 최선이다.** 다만 `toss-docs/`에 보관된 문서는 로그인·프로모션·연동 절차뿐이라
RN 프레임워크 지원 범위(제공 API, 심사 절차, 기존 미니앱의 트랙 변경 가능 여부)가 확인되지 않는다.
**착수 전에 앱인토스 개발자센터에서 이 부분을 확인해야 한다.** 확인 결과에 따라 6~7절의 일정이 크게 달라진다.

(a)를 택할 경우: 이 문서의 나머지는 그대로 유효하되, "웹·RN 양쪽에 기능을 반영한다"는 운영 규칙을 `CLAUDE.md`에
추가해야 한다.

---

## 5. 레이어별 이식 전략

### A. 그대로 이전 — 수정 0 또는 극소

DOM 참조가 하나도 없는 모듈들. `.ts` 파일을 복사하면 끝난다.

```
utils/  tickerNames.{ts,kr,us,crypto}  portfolioMath  numberFormat  dateFormat
        budgetMoney  budgetDefaultCategories  budgetDefaultPaymentMethods
        accountName  errorMessage
config/ marketConfig  admin
types/  portfolio  budget
services/ supabase(옵션만 추가)  market  assetSummary  tossApp  tossLogin
```

**전체 비즈니스 로직의 대부분이 여기 속한다.** 금액 계산·환율 환산·티커 매핑·자산 분류가 전부 무손실 이전된다.

### B. 어댑터만 교체 — `localStorage` → MMKV

```
services/exchangeRateCache  services/tickerLogo  services/tossPromotion
utils/lastModule            stores/userData
```

MMKV가 동기 API라 `getCachedRate(from, to)` / `getLastModule(userId)` 등의 **시그니처를 그대로 둘 수 있다.**
`localStorage.getItem/setItem/removeItem`만 얇은 래퍼로 바꾼다.

추가로 Supabase 클라이언트에 RN용 옵션이 필요하다:

```ts
createClient(url, key, {
  auth: {
    storage: mmkvStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,   // RN에는 URL 세션이 없다
  },
})
```

`AppState` 리스너로 포그라운드 복귀 시 `startAutoRefresh`도 붙여야 한다.

### C. 재작성 — 화면 66개

6절 참고. 여기가 작업량의 대부분이다.

### D. 대체 — 웹 전용 메커니즘

| 현행 | 대체 |
| --- | --- |
| `router.beforeEach` 가드 (인증/관리자/목표/이메일 4종) | `expo-router` 루트 레이아웃 + `<Redirect>` + 인증 컨텍스트 |
| `usePullToRefresh` (터치 이벤트 직접 처리) | `RefreshControl` — **제거하고 표준 컴포넌트로** |
| `useFitToPanel`, `useFontScale` | RN `Dimensions` / `PixelRatio` 기반 재작성 |
| `IntersectionObserver` 3곳 | `FlatList`의 `onViewableItemsChanged` |
| `matchMedia` 2곳 | `useColorScheme()` |
| `contextmenu` 차단 (`main.ts`) | **불필요 — 삭제** |
| PWA / 서비스 워커 / A2HS 배너 (`LoginView`) | **불필요 — 삭제** |
| `window.location.origin` 기반 OAuth `redirectTo` | `expo-auth-session`의 `makeRedirectUri()` + 딥링크 스킴 |

### 토큰 값 형식 변환 (선행 작업)

현행 토큰은 CSS 문자열이라 RN에서 그대로 못 쓴다. **이름은 유지하고 값만 바꾼다** — 화면 코드가 동일하게 읽힌다.

```
spacing.cardPadding  '20px'                        → 20
radius.card          '20px'                        → 20
radius.badge         '999px'                       → 999
shadows.card         '0 2px 12px rgba(0,0,0,0.06)' → { shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation }
```

`design/themes/*` 의 색상(`FpColors`, `FpChartColors`)은 전부 hex 문자열이라 **변환 없이 그대로 쓴다.**
`useDesignTokens`는 `useTheme()`(Vuetify) 의존만 걷어내고 자체 테마 컨텍스트로 교체한다.

---

## 6. 화면 단위 분해

난이도: **S** 단순 폼·정적 / **M** 목록·상태 다수 / **L** 대형·복합 / **XL** 대형 + 고위험 요소

### 인증 (4개 · 1,093줄)

| 화면 | 줄수 | 난이도 | 특이사항 |
| --- | --- | --- | --- |
| `LoginView` | 745 | **XL** | OAuth 3종(구글/카카오/토스) 딥링크 전환, A2HS 배너 삭제, `tossOnly` 분기 유지 |
| `CompleteEmailView` | 217 | M | 이메일 미보유 SNS 계정 처리 |
| `ResetPasswordView` | 131 | M | 딥링크로 진입 — URL 토큰 처리 방식 변경 필요 |
| `AdminResetPasswordView` | 171 | S | |

### 자산 모듈 (20개 · 11,606줄)

| 화면 | 줄수 | 난이도 | 특이사항 |
| --- | --- | --- | --- |
| `PortfolioView` | 1,525 | **XL** | 최대 화면. 목록·정렬·필터·집계 |
| `EtfBacktestView` | 1,218 | **XL** | SVG 차트 + 최근검색 캐시 |
| `TransactionView` | 1,197 | **XL** | 대용량 목록 → `FlatList` 가상화 필요 |
| `AnalysisView` | 1,117 | **XL** | |
| `TransactionAddDialog` | 924 | **L** | 다이얼로그 → 모달/바텀시트 |
| `EtfAnalysisView` | 841 | **L** | |
| `DashboardView` | 776 | **L** | SVG 차트, 백그라운드 재계산 로직 유지 |
| `PortfolioAddDialog` | 732 | **L** | 티커 자동완성(`v-autocomplete`) |
| `PortfolioBubblePanel` | 727 | **L** | 버블 차트 — SVG 좌표 계산 그대로 |
| `DividendCalendarView` | 644 | **L** | 캘린더 UI + 캐시 |
| `AssetGrowthView` | 596 | **L** | SVG 차트 |
| `FireSimulatorView` | 534 | M | SVG + 슬라이더 |
| `GoalSettingsView` | 476 | M | 목표 저장 후 가드 캐시 무효화 |
| `PortfolioAssetClassPanel` | 405 | M | SVG |
| `PortfolioComparePanel` | 382 | M | |
| `BadgesView` | 331 | M | |
| `FireHistoryView` | 304 | M | SVG |
| `MoreView` | 193 | S | |
| `PortfolioAnalysisView` | 190 | M | 스와이프 전환(`v-window`) → `react-native-pager-view` |
| `AssetLayout` | 301 | **L** | 하단 탭 5개 → `expo-router` 탭 레이아웃 |

### 가계부 모듈 (12개 · 4,077줄)

| 화면 | 줄수 | 난이도 | 특이사항 |
| --- | --- | --- | --- |
| `BudgetCalendarView` | 797 | **L** | 캘린더 그리드 |
| `BudgetEntryAddDialog` | 651 | **L** | 키패드 연동 |
| `BudgetImportView` | 586 | **XL** | **엑셀 파싱 — 최고 위험 항목.** 파일 선택·읽기 전 구조 변경 |
| `BudgetFavoriteView` | 400 | M | 드래그 정렬 |
| `BudgetStatsView` | 395 | M | SVG 차트 |
| `BudgetSearchView` | 350 | M | |
| `BudgetCategoryView` | 330 | M | 드래그 정렬 |
| `BudgetPaymentMethodView` | 293 | M | 드래그 정렬 |
| `BudgetMoreView` | 300 | S | |
| `BudgetDateCalendarCard` | 182 | M | |
| `BudgetMonthYearCard` | 138 | S | |
| `BudgetCategoryGridPicker` | 107 | S | |
| `BudgetAmountKeypad` | 100 | M | 커스텀 키패드 — RN이 오히려 쉬움 |
| `BudgetManageView` | 53 | S | |
| `BudgetPanelTopbar` | 46 | S | |
| `BudgetLayout` | 127 | M | 하단 탭 |

### 관리자 (10개 · 3,521줄)

`AdminSignupLogView`(525) `AdminFeedbackView`(504) `AdminAccessHistoryView`(428) `AdminStatsView`(404, SVG)
`AdminNoticesView`(380) `AdminMembersView`(349) `AdminTickerView`(286) `AdminView`(278) `AdminDataView`(196)

전부 **M** 이하. 표 형태 목록이 대부분이라 기계적이다.

> **제안: 관리자 모듈은 RN 이전 대상에서 제외를 검토할 것.** 본인만 쓰는 화면이고 3,521줄인데, 웹으로 남겨두면
> 전환 범위가 14% 줄어든다. (4-2절에서 (a)안을 택해 웹이 어차피 유지된다면 특히.)

### 공용 (11개 · 1,603줄)

`FeedbackView`(410) `ReleaseNotesView`(310) `LinkedAccountsView`(175, OAuth 연결) `DisplaySettingsView`(160)
`ChangePasswordView`(130) `NoticesView`(123) `TermsView`·`PrivacyPolicyView`+본문 4종(307) `HubView`(741, **L**)
`TossPromotionCard`(153) `GlobalSnackbar` `ProviderBadges`(27)

약관·개인정보 본문은 정적 텍스트라 가장 쉽다.

---

## 7. 단계별 실행 계획과 검증 기준

각 단계는 **검증을 통과해야 다음으로 넘어간다.**

### P0 — 스파이크 (선행 · 필수)

목적: 전환의 4대 리스크(빌드/인증/토스/엑셀)가 실제로 뚫리는지 먼저 확인. **여기서 막히면 계획을 다시 짠다.**

1. Expo 프로젝트 부팅 + Supabase 이메일 로그인 1개 화면
2. 구글 OAuth 딥링크 왕복
3. 엑셀 파일 1개를 `expo-document-picker` + SheetJS로 파싱
4. EAS Build로 .aab 산출

> **검증:** 실기기에서 ① 이메일 로그인 성공 ② 앱 완전 종료 후 재실행 시 세션 유지 ③ 구글 로그인 복귀 성공
> ④ 기존 가계부 엑셀 샘플 파싱 결과가 현행 웹과 동일 ⑤ .aab 파일 생성

### P1 — 코어 로직 이식

5절 A·B 그룹 전부 이전. **동시에 `vitest` 도입.**

테스트가 하나도 없는 상태에서 33,000줄을 옮기면 금액 계산이 조용히 틀어져도 알 수 없다. 최소한
`portfolioMath` `budgetMoney` `numberFormat` `dateFormat` `marketConfig`에는 골든 테스트를 깐다.

> **검증:** 현행 Vue 앱에서 뽑은 입력·기대값 세트로 위 5개 모듈 테스트 전부 통과. `vue-tsc` 대신 `tsc --noEmit`
> 오류 0.

### P2 — 디자인 시스템

토큰 값 변환(5절) + `Fp*` 프리미티브 12종 + 테마 컨텍스트.

> **검증:** 테마 데모 화면에서 5개 테마 전환 시 12종 프리미티브가 모두 정상 렌더. 화면 코드에 색상·간격
> 하드코딩 0건(`grep -rE "#[0-9a-fA-F]{6}"` 으로 확인, `design/` 제외).

### P3 — 네비게이션 + 인증 가드

`expo-router` 42개 라우트 + 가드 4종(`requiresAuth` `requiresAdmin` `requiresGoal` `needsEmail`) +
`lastModule` 자동 진입.

> **검증:** 42개 경로 이동표를 만들어 전부 수동 확인. 특히 ① 미로그인 시 보호 경로 → `/` ② 목표 미설정 시
> → `/goalSettings` ③ 이메일 없는 SNS 계정 → `/completeEmail` ④ 세션 있는 상태로 앱 실행 시 마지막 모듈 진입.

### P4 — 자산 모듈 / P5 — 가계부 모듈 / P6 — 공용 화면

화면 재작성. 각 모듈 안에서는 **작은 화면부터** 올려 프리미티브의 부족한 부분을 먼저 드러낸다.

> **검증 (화면 단위):** 동일 계정으로 현행 웹과 RN을 나란히 띄우고 ① 표시되는 수치가 일치 ② 생성·수정·삭제
> 후 양쪽 새로고침 결과 일치. 금액이 걸린 화면은 이 대조를 반드시 수행.

### P7 — 관리자 (범위 결정에 따라 생략 가능)

### P8 — 네이티브 마감

앱 아이콘·스플래시·권한 문구·개인정보처리방침 링크·`targetSdk` 확인·난독화·버전 코드 체계.

> **검증:** 릴리스 빌드(.aab)를 내부 테스트 트랙에 업로드 성공, 실기기 설치 후 P3 검증표 재통과.

### P9 — 출시

내부 테스트 → 비공개 테스트 14일 → 프로덕션 신청.

> **검증:** 0절의 두 사유 대응 — ① 테스터 12명 이상이 14일간 **실제로 앱을 여는지** 콘솔에서 확인
> ② 기간 중 피드백을 받아 반영한 빌드를 최소 1회 이상 비공개 트랙에 업로드.

---

## 8. 리스크

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| **토스 트랙 미결** (4-2절) | 코드베이스 1개 vs 2개 — 장기 유지비가 갈림 | **착수 전 확인.** RN 선택 시 최우선 |
| 엑셀 가져오기 (`BudgetImportView`) | 가계부 핵심 기능 | P0에서 먼저 검증 |
| OAuth 3종 딥링크 | 로그인 불가 = 앱 전체 정지 | P0에서 먼저 검증 |
| 테스트 부재 상태의 대규모 이식 | 금액 계산 오류가 조용히 유입 | P1에서 골든 테스트 선행 |
| 대용량 목록 성능 (`TransactionView` 등) | 스크롤 버벅임 | `FlatList` 가상화 전제로 설계 |
| 전환 기간 중 웹 신규 기능 추가 | 두 코드베이스 격차 확대 | 전환 기간에는 웹 기능 동결 권장 |
| **전환이 끝나도 플레이 승인은 별개** | 출시 지연 | 0절 — 14일 재테스트를 지금부터 병행 |

## 9. 미해결 질문 — 답이 필요한 순서대로

1. **Capacitor로 먼저 막을 것인가, RN으로 바로 갈 것인가?** (4-1절) — 14일 카운터가 이미 돌고 있어 시간이
   걸린 결정이다. 나머지 질문은 전부 이 답에 종속된다.
2. **앱인토스 RN 프레임워크로 미니앱 트랙을 옮길 수 있는가?** (4-2절) — RN 선택 시. 답에 따라 전체 구조가 갈린다.
3. **관리자 모듈 10개를 RN으로 옮길 것인가, 웹에 남길 것인가?** — 전환 범위 14% 차이.
4. **PWA/웹 버전을 계속 유지하는가?** — 유지한다면 웹 기능 동결 정책이 필요.
5. UI는 자체 프리미티브(권장)인가 React Native Paper인가? (3-2절) — 일정 우선이면 뒤집을 수 있다.
6. iOS도 같이 낼 것인가? — RN 전환의 최대 이점이지만 범위가 또 늘어난다.
