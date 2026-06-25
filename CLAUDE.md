# CLAUDE.md

## 📋 남은 작업 목록

새 세션 시작 시 **TODO.md** 를 먼저 읽어 남은 작업을 파악할 것.

## ⚠️ 서비스 오픈 전 체크리스트

- [ ] `.env`를 `.gitignore`에 추가할 것 (현재 2PC 개발 편의상 저장소에 포함되어 있음 — API 키 노출 주의!)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 커밋 메시지 규칙

**모든 커밋 메시지는 반드시 한글로 작성할 것.**

## Git Push 규칙

사용자가 "push" 라고 말하면 아래 순서로 develop까지 반영한다:

1. 현재 작업 브랜치에 `git push -u origin <branch>`
2. GitHub MCP로 해당 브랜치 → `develop` PR 생성
3. PR을 squash merge로 develop에 머지

사용자가 "main에 반영" 이라고 말하면 아래 순서로 진행한다:

1. 현재 작업 브랜치에 `git push -u origin <branch>`
2. GitHub API(curl + $GITHUB_TOKEN) 또는 GitHub MCP로 해당 브랜치 → `main` PR 생성
3. PR을 squash merge로 main에 머지
4. **절대 `git push origin main` 직접 push 시도 금지** — main은 보호 브랜치라 항상 막힘

## 프로젝트 개요

**Fire Path** - 개인 FIRE(Financial Independence, Retire Early) 목표 관리 PWA. 투자 포트폴리오 추적 및 목표 달성률을 확인하는 앱.

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

### Supabase 테이블 스키마

모든 테이블은 `user_id → auth.users` FK를 가지며 user 삭제 시 CASCADE 된다.

#### investment_goals

사용자별 1개 (user_id unique). FIRE 목표 설정.

| 컬럼명             | 타입        | 설명                         |
| ------------------ | ----------- | ---------------------------- |
| id                 | uuid        | PK                           |
| user_id            | uuid        | FK → auth.users, unique      |
| target_asset       | int8        | 목표 자산 (KRW)              |
| monthly_investment | int8        | 월 투자금액 (KRW)            |
| annual_return      | float8      | 연 기대 수익률 (%, nullable) |
| target_date        | date        | 목표 달성 날짜 (nullable)    |
| created_at         | timestamptz |                              |
| updated_at         | timestamptz |                              |

#### asset_summary

사용자별 1개 (user_id unique). 전체 자산 요약 (캐시성 데이터).

| 컬럼명               | 타입        | 설명                    |
| -------------------- | ----------- | ----------------------- |
| id                   | uuid        | PK                      |
| user_id              | uuid        | FK → auth.users, unique |
| current_asset        | int8        | 현재 평가 자산 (KRW)    |
| investment_principal | int8        | 투자 원금 (KRW)         |
| created_at           | timestamptz |                         |
| updated_at           | timestamptz |                         |

#### portfolios

보유 종목 목록.

| 컬럼명     | 타입          | 설명                         |
| ---------- | ------------- | ---------------------------- |
| id         | uuid          | PK                           |
| user_id    | uuid          | FK → auth.users              |
| ticker     | text          | 종목 코드 (예: AAPL, 005930) |
| asset_type | text          | 자산 유형                    |
| quantity   | numeric       | 보유 수량                    |
| avg_price  | numeric       | 평균 매수가                  |
| currency   | currency_enum | KRW \| USD                   |
| sort_order | int8          | 정렬 순서 (nullable)         |
| created_at | timestamptz   |                              |
| updated_at | timestamptz   |                              |

#### transactions

종목별 매수/매도 거래 내역. portfolio_id → portfolios CASCADE.

| 컬럼명           | 타입                  | 설명            |
| ---------------- | --------------------- | --------------- |
| id               | uuid                  | PK              |
| user_id          | uuid                  | FK → auth.users |
| portfolio_id     | uuid                  | FK → portfolios |
| transaction_type | transaction_type_enum | BUY \| SELL     |
| quantity         | numeric               | 거래 수량       |
| unit_price       | numeric               | 거래 단가       |
| transaction_date | date                  | 거래일          |
| memo             | text                  | 메모 (nullable) |
| created_at       | timestamptz           |                 |
| updated_at       | timestamptz           |                 |

### 공통 패턴

- **스낵바 알림**: `src/composables/useSnackbar.ts`의 `showMessage(text, color)` 함수를 직접 import해서 사용 (Pinia 스토어가 아닌 모듈 레벨 ref)
- **테마**: `src/composables/useAppTheme.ts`의 `useAppTheme()` - localStorage에 `my-investment-theme` 키로 저장, 초기값은 시스템 설정 따라감
- **티커 한글명**: `src/utils/tickerNames.ts`의 `TICKER_NAMES` 매핑 테이블 - 없는 티커는 그대로 표시
- **경로 alias**: `@` → `src/`

### 상태관리

Pinia를 사용하나 현재 `src/stores/counter.ts`는 템플릿 코드(미사용). 실제 앱 상태는 대부분 컴포넌트 로컬 또는 composable에서 관리된다.
