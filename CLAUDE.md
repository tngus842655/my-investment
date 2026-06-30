# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 0. 코딩 완료 후 필수 체크

**수정한 파일이 있으면 반드시 타입 체크를 실행하고 오류가 없는지 확인할 것.**

```bash
./node_modules/.bin/vue-tsc --noEmit
```

`npx tsc --noEmit`은 Vue SFC를 검사하지 못하므로 반드시 `vue-tsc`를 사용할 것.
오류가 있으면 커밋 전에 수정한다. 오류가 없을 때만 커밋·푸시한다.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

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

main 배포는 사용자가 직접 처리한다. 사용자가 "push" 또는 "main에 반영"을 요청해도 Claude는 즉시 실행하지 않는다.

Claude가 git push를 돕는 경우: **빌드 오류, 충돌 등 사용자가 직접 해결하기 어려운 상황이 생겼을 때만** 요청에 따라 지원한다.

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

| 컬럼명             | 타입        | 설명                                                               |
| ------------------ | ----------- | ------------------------------------------------------------------ |
| id                 | uuid        | PK                                                                 |
| user_id            | uuid        | FK → auth.users, unique                                            |
| target_asset       | int8        | 목표 자산 (KRW)                                                    |
| monthly_investment | int8        | 월 투자금액 (KRW)                                                  |
| annual_return      | float8      | 연 기대 수익률 (%, nullable)                                       |
| target_date        | date        | 목표 달성 날짜 (nullable)                                          |
| theme              | text        | 앱 테마 (light/dark/system 등, 기본값 system)                      |
| portfolio_sort     | text        | 포트폴리오 정렬 기준 (custom/eval/profit/rate/name, 기본값 custom) |
| hide_asset         | boolean     | 자산 숨김 여부 (기본값 false)                                      |
| created_at         | timestamptz |                                                                    |
| updated_at         | timestamptz |                                                                    |

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

| 컬럼명        | 타입        | 설명                                     |
| ------------- | ----------- | ---------------------------------------- |
| id            | uuid        | PK                                       |
| user_id       | uuid        | FK → auth.users                          |
| recorded_at   | date        | 기록 날짜 (user_id + recorded_at unique) |
| current_asset | int8        | 해당 일 평가 자산 (KRW, 현금 제외)       |
| progress_pct  | float8      | FIRE 달성률 % (nullable)                 |
| created_at    | timestamptz |                                          |

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

| 컬럼명   | 타입        | 설명            |
| -------- | ----------- | --------------- |
| id       | uuid        | PK              |
| user_id  | uuid        | FK → auth.users |
| email    | text        | 로그인 이메일   |
| login_at | timestamptz | 로그인 시각     |

#### signup_log

회원가입 이력 기록. RLS 적용 (관리자만 조회). 재가입 시 `deleted_at` 초기화로 재활성화 처리.

| 컬럼명       | 타입        | 설명                 |
| ------------ | ----------- | -------------------- |
| id           | uuid        | PK                   |
| email        | text        | 가입 이메일 (unique) |
| signed_up_at | timestamptz | 최초 가입 시각       |
| deleted_at   | timestamptz | 탈퇴 시각 (nullable) |

#### feedback

사용자 피드백. RLS 적용.

| 컬럼명            | 타입        | 설명                                                                      |
| ----------------- | ----------- | ------------------------------------------------------------------------- |
| id                | uuid        | PK                                                                        |
| email             | text        | 작성자 이메일                                                             |
| category          | text        | 피드백 카테고리 (버그신고/기능제안/기타의견)                              |
| title             | text        | 제목                                                                      |
| content           | text        | 내용                                                                      |
| status            | text        | 처리 상태 (기본값: 'RECEIVED') RECEIVED/REVIEWING/DONE/REJECTED           |
| admin_comment     | text        | 관리자 답변 (nullable)                                                    |
| is_read_by_user   | boolean     | 사용자 확인 여부 (기본값 true). 관리자가 상태변경/답변 저장 시 false로 전환 |
| created_at        | timestamptz |                                                                           |

**RLS 정책 (feedback 테이블):**

| 정책명                                  | 커맨드  | 설명                                                    |
| --------------------------------------- | ------- | ------------------------------------------------------- |
| 로그인 유저 insert                      | INSERT  | 로그인한 모든 사용자 insert 가능                        |
| 관리자 전체 조회                        | SELECT  | 관리자만 전체 조회 가능                                 |
| 관리자 수정                             | UPDATE  | 관리자만 수정 가능 (상태 변경, 답변 저장 등)            |
| 관리자 삭제                             | DELETE  | 관리자만 삭제 가능                                      |
| Users can read own feedback             | SELECT  | 사용자가 본인 이메일의 의견 조회 가능                   |
| Users can update read status on own feedback | UPDATE | 사용자가 본인 의견의 is_read_by_user 업데이트 가능  |

### 공통 패턴

- **스낵바 알림**: `src/composables/useSnackbar.ts`의 `showMessage(text, color)` 함수를 직접 import해서 사용 (Pinia 스토어가 아닌 모듈 레벨 ref)
- **테마**: `src/composables/useAppTheme.ts`의 `useAppTheme()` - localStorage에 `my-investment-theme` 키로 저장, 초기값은 시스템 설정 따라감
- **티커 한글명**: `src/utils/tickerNames.ts`의 `TICKER_NAMES` 매핑 테이블 - 없는 티커는 그대로 표시
- **경로 alias**: `@` → `src/`

### 상태관리

Pinia를 사용하나 현재 `src/stores/counter.ts`는 템플릿 코드(미사용). 실제 앱 상태는 대부분 컴포넌트 로컬 또는 composable에서 관리된다.
