# CLAUDE.md

## 📋 남은 작업 목록

새 세션 시작 시 **TODO.md** 를 먼저 읽어 남은 작업을 파악할 것.

## ⚠️ 서비스 오픈 전 체크리스트

- [ ] `.env`를 `.gitignore`에 추가할 것 (현재 2PC 개발 편의상 저장소에 포함되어 있음 — API 키 노출 주의!)

## Supabase RLS 정책 작성 주의사항

RLS 정책에서 이메일로 관리자 체크할 때 `auth.users` 테이블 직접 조회는 권한 오류 발생:

```sql
-- ❌ 이렇게 하면 안 됨 (permission denied for table users)
USING ((SELECT email FROM auth.users WHERE id = auth.uid()) = 'admin@email.com')

-- ✅ 이렇게 해야 함 (JWT claims에서 직접 읽기)
USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'admin@email.com')
```

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 커밋 메시지 규칙

**모든 커밋 메시지는 반드시 한글로 작성할 것.**

## Git Push 규칙

사용자가 "push" 또는 "main에 반영" 이라고 말하면 아래 순서로 진행한다:

1. **새 브랜치 생성** — 현재 작업 브랜치를 그대로 쓰지 말고 `claude/작업명-날짜` 형식으로 새 브랜치 생성
   - `git checkout main && git pull origin main`
   - `git checkout -b claude/새브랜치명`
   - 변경된 파일들만 `git checkout origin/작업브랜치 -- 파일1 파일2 ...` 로 가져오기
   - `git push -u origin claude/새브랜치명`
2. GitHub MCP로 새 브랜치 → `main` PR 생성
3. PR을 squash merge로 main에 머지
4. **⚠️ 머지 완료 후 반드시 세션 시작 시의 원래 작업 브랜치로 돌아올 것** (`git checkout claude/원래브랜치명`)

**⚠️ 충돌 방지 핵심 규칙:**
- squash merge 후 같은 브랜치에서 계속 작업하면 다음 PR에서 반드시 충돌 발생
- main에 push할 때는 **항상 새 브랜치**를 만들어서 변경 파일만 담아 PR 생성
- **절대 `git push origin main` 직접 push 시도 금지** — main은 보호 브랜치라 항상 막힘

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
| theme              | text        | 앱 테마 (light/dark/system 등, 기본값 system) |
| portfolio_sort     | text        | 포트폴리오 정렬 기준 (custom/eval/profit/rate/name, 기본값 custom) |
| hide_asset         | boolean     | 자산 숨김 여부 (기본값 false) |
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

#### asset_history

일별 자산 스냅샷. 매일 자정(KST) pg_cron으로 자동 저장 + PortfolioView 로드 시 당일 upsert. 미래예측 차트의 과거 실선에 사용.

| 컬럼명       | 타입        | 설명                                         |
| ------------ | ----------- | -------------------------------------------- |
| id           | uuid        | PK                                           |
| user_id      | uuid        | FK → auth.users                              |
| recorded_at  | date        | 기록 날짜 (user_id + recorded_at unique)     |
| current_asset| int8        | 해당 일 평가 자산 (KRW, 현금 제외)           |
| progress_pct | float8      | FIRE 달성률 % (nullable)                     |
| created_at   | timestamptz |                                              |

**pg_cron 스케줄:** `daily-asset-snapshot` — `0 15 * * *` (UTC) = 매일 KST 00:00 실행

```sql
-- save_daily_asset_snapshot() 함수
BEGIN
  INSERT INTO asset_history (user_id, recorded_at, current_asset, progress_pct)
  SELECT
    a.user_id,
    CURRENT_DATE,
    a.current_asset,
    ROUND((a.current_asset::float8 / g.target_asset * 100)::numeric, 2)
  FROM asset_summary a
  JOIN investment_goals g ON g.user_id = a.user_id
  WHERE a.current_asset > 0
  ON CONFLICT (user_id, recorded_at) DO UPDATE
    SET current_asset = EXCLUDED.current_asset,
        progress_pct  = EXCLUDED.progress_pct;
END;
```

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

#### login_log

로그인 이력 기록. RLS 적용 (관리자만 조회).

| 컬럼명    | 타입        | 설명            |
| --------- | ----------- | --------------- |
| id        | uuid        | PK              |
| user_id   | uuid        | FK → auth.users |
| email     | text        | 로그인 이메일   |
| login_at  | timestamptz | 로그인 시각     |

#### signup_log

회원가입 이력 기록. RLS 적용 (관리자만 조회). 재가입 시 `deleted_at` 초기화로 재활성화 처리.

| 컬럼명       | 타입        | 설명                        |
| ------------ | ----------- | --------------------------- |
| id           | uuid        | PK                          |
| email        | text        | 가입 이메일 (unique)        |
| signed_up_at | timestamptz | 최초 가입 시각              |
| deleted_at   | timestamptz | 탈퇴 시각 (nullable)        |

#### feedback

사용자 피드백. RLS 적용.

| 컬럼명     | 타입        | 설명                          |
| ---------- | ----------- | ----------------------------- |
| id         | uuid        | PK                            |
| email      | text        | 작성자 이메일                 |
| category   | text        | 피드백 카테고리               |
| title      | text        | 제목                          |
| content    | text        | 내용                          |
| status     | text        | 처리 상태 (기본값: 'NEW')     |
| created_at | timestamptz |                               |

### 공통 패턴

- **스낵바 알림**: `src/composables/useSnackbar.ts`의 `showMessage(text, color)` 함수를 직접 import해서 사용 (Pinia 스토어가 아닌 모듈 레벨 ref)
- **테마**: `src/composables/useAppTheme.ts`의 `useAppTheme()` - localStorage에 `my-investment-theme` 키로 저장, 초기값은 시스템 설정 따라감
- **티커 한글명**: `src/utils/tickerNames.ts`의 `TICKER_NAMES` 매핑 테이블 - 없는 티커는 그대로 표시
- **경로 alias**: `@` → `src/`

### 상태관리

Pinia를 사용하나 현재 `src/stores/counter.ts`는 템플릿 코드(미사용). 실제 앱 상태는 대부분 컴포넌트 로컬 또는 composable에서 관리된다.
