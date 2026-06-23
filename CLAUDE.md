# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**MY INVESTMENT** - 개인 FIRE(Financial Independence, Retire Early) 목표 관리 PWA. 투자 포트폴리오 추적 및 목표 달성률을 확인하는 앱.

## 주요 명령어

```bash
npm run dev        # 개발 서버 실행 (port 3820)
npm run build      # 타입 체크 + 프로덕션 빌드
npm run lint       # oxlint → eslint 순서로 lint + auto-fix
npm run format     # Prettier 포맷
```

## 아키텍처

### 인증 및 라우팅 흐름

라우터(`src/router/index.ts`)가 Supabase 세션을 직접 확인하여 네비게이션 가드를 처리한다.

- `/` → `LoginView` (공개)
- `/goalSettings` → 로그인 필요 (`requiresAuth`)
- `/dashboard`, `/portfolio` → 로그인 + 목표 설정 완료 필요 (`requiresGoal`)

`requiresGoal` 가드는 `investment_goals` 테이블에서 사용자 레코드를 조회하고, 없으면 `/goalSettings`로 리다이렉트한다.

### 백엔드 연동

- **Supabase** (`src/services/supabase.ts`): 단일 클라이언트 인스턴스를 export하여 앱 전체에서 공유
- **시세 조회** (`src/services/market.ts`): Supabase Edge Function 두 개를 호출
  - `stock-price`: 주식/ETF 현재가 조회 (ticker, asset_type, currency 파라미터)
  - `exchange-rate`: 환율 조회 (from, to 파라미터)

### 환경 변수

`.env` 파일에 아래 두 값이 필요하다:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Supabase 테이블 구조 (코드 기반 추론)

- `investment_goals` - 사용자별 FIRE 목표 (user_id 컬럼)
- `portfolio_assets` - 보유 자산 (`src/types/portfolio.ts`의 `PortfolioAsset` 참조)

### 공통 패턴

- **스낵바 알림**: `src/composables/useSnackbar.ts`의 `showMessage(text, color)` 함수를 직접 import해서 사용 (Pinia 스토어가 아닌 모듈 레벨 ref)
- **테마**: `src/composables/useAppTheme.ts`의 `useAppTheme()` - localStorage에 `my-investment-theme` 키로 저장, 초기값은 시스템 설정 따라감
- **티커 한글명**: `src/utils/tickerNames.ts`의 `TICKER_NAMES` 매핑 테이블 - 없는 티커는 그대로 표시
- **경로 alias**: `@` → `src/`

### 상태관리

Pinia를 사용하나 현재 `src/stores/counter.ts`는 템플릿 코드(미사용). 실제 앱 상태는 대부분 컴포넌트 로컬 또는 composable에서 관리된다.
