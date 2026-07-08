# TABLE.md

Supabase 테이블 스키마 정리. 모든 테이블은 `user_id → auth.users` FK를 가지며 user 삭제 시 CASCADE 된다. `public` 스키마의 모든 테이블은 RLS(rowsecurity)가 켜져 있다.

### RLS 정책 작성 주의사항

RLS 정책에서 이메일로 관리자 체크할 때 `auth.users` 테이블 직접 조회는 권한 오류 발생:

```sql
-- ❌ 이렇게 하면 안 됨 (permission denied for table users)
USING ((SELECT email FROM auth.users WHERE id = auth.uid()) = 'admin@email.com')

-- ✅ 이렇게 해야 함 (JWT claims에서 직접 읽기)
USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'admin@email.com')
```

### DB 트리거

| 트리거명            | 테이블       | 시점  | 이벤트                | 함수                              |
| -------------------- | ------------ | ----- | ---------------------- | ---------------------------------- |
| trg_sync_portfolio    | transactions | AFTER | INSERT/UPDATE/DELETE   | sync_portfolio_from_transactions() |

`sync_portfolio_from_transactions()`: transactions 변경 시 해당 portfolio_id의 `quantity`/`avg_price`를 BUY+INITIAL 합산, SELL 차감으로 재계산 (`supabase/migrations/20260624_02_fix_sync_portfolio_trigger.sql`).

### RPC 함수 (프론트에서 `supabase.rpc()`로 호출)

| 함수명                     | 호출 위치                    | 설명                                                             |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| delete_user_account()       | MoreView.vue (회원탈퇴)       | SECURITY DEFINER. signup_log.deleted_at 기록 후 auth.users 삭제(CASCADE) |
| record_signup(user_email)   | LoginView.vue (로그인/가입)   | SECURITY DEFINER. signup_log에 신규 insert 또는 탈퇴 이력 재활성화     |
| save_daily_asset_snapshot() | FireHistoryView.vue, pg_cron  | asset_history에 당일 스냅샷 upsert (아래 pg_cron 항목 참고)          |
| admin_get_email_confirmations() | AdminSignupLogView.vue (가입 이력) | SECURITY DEFINER. 관리자만 호출 가능. auth.users의 이메일별 인증 여부(email_confirmed_at) 반환 |

### pg_cron

| jobname             | schedule (UTC) | 설명                                      |
| -------------------- | -------------- | ------------------------------------------- |
| daily-asset-snapshot | `0 15 * * *`   | 매일 KST 00:00, save_daily_asset_snapshot() 실행 |

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
| include_cash       | boolean     | 대시보드 현재 자산에 현금 포함 여부 (기본값 false)                 |
| created_at         | timestamptz |                                                                    |
| updated_at         | timestamptz |                                                                    |

**RLS 정책 (investment_goals 테이블):**

| 정책명                       | 커맨드 | roles         | 설명                              |
| ----------------------------- | ------ | ------------- | ---------------------------------- |
| Users can view own goals      | SELECT | authenticated | 본인 데이터만 조회 (auth.uid() = user_id) |
| Users can insert own goals    | INSERT | authenticated | 본인 데이터만 insert               |
| Users can update own goals    | UPDATE | authenticated | 본인 데이터만 수정                 |
| Users can delete own goals    | DELETE | authenticated | 본인 데이터만 삭제                 |
| admin_read_all_goals          | SELECT | public        | 관리자(이메일 일치) 전체 조회      |

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

**RLS 정책 (asset_summary 테이블):**

| 정책명                          | 커맨드 | roles         | 설명                              |
| -------------------------------- | ------ | ------------- | ---------------------------------- |
| Users can view own goals         | SELECT | authenticated | 본인 데이터만 조회                 |
| Users can insert own goals       | INSERT | authenticated | 본인 데이터만 insert               |
| Users can update own goals       | UPDATE | authenticated | 본인 데이터만 수정                 |
| Users can delete own goals       | DELETE | authenticated | 본인 데이터만 삭제                 |
| admin_read_all_asset_summary     | SELECT | public        | 관리자(이메일 일치) 전체 조회      |

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

**RLS 정책 (portfolios 테이블):**

| 정책명                     | 커맨드 | roles         | 설명                              |
| ---------------------------- | ------ | ------------- | ---------------------------------- |
| Users can view own goals     | SELECT | authenticated | 본인 데이터만 조회                 |
| Users can insert own goals   | INSERT | authenticated | 본인 데이터만 insert               |
| Users can update own goals   | UPDATE | authenticated | 본인 데이터만 수정                 |
| Users can delete own goals   | DELETE | authenticated | 본인 데이터만 삭제                 |
| admin_read_all_portfolios    | SELECT | public        | 관리자(이메일 일치) 전체 조회      |

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

**RLS 정책 (asset_history 테이블):** 다른 테이블과 달리 관리자 전용 조회 정책이 별도로 없고, 아래 정책 하나(`ALL`)로 본인 데이터 CRUD만 허용한다.

| 정책명            | 커맨드 | roles  | 설명                              |
| ------------------ | ------ | ------ | ---------------------------------- |
| 본인 데이터만 접근 | ALL    | public | auth.uid() = user_id인 행만 접근 가능 |

#### transactions

종목별 매수/매도 거래 내역. portfolio_id → portfolios CASCADE.

| 컬럼명           | 타입                  | 설명            |
| ---------------- | --------------------- | --------------- |
| id               | uuid                  | PK              |
| user_id          | uuid                  | FK → auth.users |
| portfolio_id     | uuid                  | FK → portfolios |
| transaction_type | transaction_type_enum | BUY \| SELL \| INITIAL |
| quantity         | numeric               | 거래 수량       |
| unit_price       | numeric               | 거래 단가       |
| transaction_date | date                  | 거래일          |
| memo             | text                  | 메모 (nullable) |
| created_at       | timestamptz           |                 |
| updated_at       | timestamptz           |                 |

**transaction_type = 'INITIAL' 의미:** 이미 보유 중이던 종목을 포트폴리오에 처음 등록할 때 입력하는 초기 잔고. 종목당 최대 1개만 존재(등록/수정 다이얼로그에서 upsert, 값 비우면 삭제). 자산·평단가 계산 로직(`sync_portfolio_trigger`, `PortfolioView.vue`)에서는 `BUY`와 동일하게 합산되지만, `TransactionView.vue`(거래 내역 화면)에서는 `.neq('transaction_type', 'INITIAL')`로 항상 제외되어 사용자에게 노출되지 않는다.

**RLS 정책 (transactions 테이블):**

| 정책명                        | 커맨드 | roles         | 설명                              |
| -------------------------------- | ------ | ------------- | ---------------------------------- |
| Users can view own goals         | SELECT | authenticated | 본인 데이터만 조회                 |
| Users can insert own goals       | INSERT | authenticated | 본인 데이터만 insert               |
| Users can update own goals       | UPDATE | authenticated | 본인 데이터만 수정                 |
| Users can delete own goals       | DELETE | authenticated | 본인 데이터만 삭제                 |
| admin_read_all_transactions      | SELECT | public        | 관리자(이메일 일치) 전체 조회      |

#### login_log

로그인 이력 기록. RLS 적용 (관리자만 조회).

| 컬럼명   | 타입        | 설명            |
| -------- | ----------- | --------------- |
| id       | uuid        | PK              |
| user_id  | uuid        | FK → auth.users |
| email    | text        | 로그인 이메일   |
| login_at | timestamptz | 로그인 시각     |

**RLS 정책 (login_log 테이블):**

| 정책명                    | 커맨드 | roles         | 설명                            |
| --------------------------- | ------ | ------------- | -------------------------------- |
| login_log: 본인 insert      | INSERT | authenticated | 로그인한 사용자가 본인 기록만 insert 가능 |
| login_log: 관리자 select    | SELECT | authenticated | 관리자만 전체 조회 가능          |

#### access_log

페이지 접근 이력 기록. RLS 적용.

| 컬럼명      | 타입        | 설명            |
| ----------- | ----------- | --------------- |
| id          | uuid        | PK              |
| user_id     | uuid        | FK → auth.users |
| email       | text        | 접근자 이메일   |
| page        | text        | 접근 페이지     |
| accessed_at | timestamptz | 접근 시각       |

**RLS 정책 (access_log 테이블):**

| 정책명                   | 커맨드 | 설명                            |
| ------------------------ | ------ | -------------------------------- |
| access_log: 관리자 select | SELECT | 관리자만 전체 조회 가능          |
| access_log: 본인 insert   | INSERT | 로그인한 사용자가 본인 기록만 insert 가능 (`auth.uid() = user_id`) |

#### signup_log

회원가입 이력 기록. RLS 적용 (관리자만 조회). 재가입 시 `deleted_at` 초기화로 재활성화 처리.

| 컬럼명       | 타입        | 설명                 |
| ------------ | ----------- | -------------------- |
| id           | uuid        | PK                   |
| email        | text        | 가입 이메일 (unique) |
| signed_up_at | timestamptz | 최초 가입 시각       |
| deleted_at   | timestamptz | 탈퇴 시각 (nullable) |

**RLS 정책 (signup_log 테이블):**

| 정책명            | 커맨드 | roles  | 설명                                              |
| ------------------ | ------ | ------ | -------------------------------------------------- |
| insert_on_signup   | INSERT | public | 로그인 전(회원가입 시점)에도 누구나 insert 가능 (with check: true) |
| select_for_admin   | SELECT | public | 관리자(이메일 일치)만 조회 가능                     |
| update_for_admin   | UPDATE | public | 관리자(이메일 일치)만 수정 가능 (재가입 시 deleted_at 초기화 등) |

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

#### notices

공지사항. 관리자만 작성 가능, 로그인 유저는 전체 조회 가능. 개발자 노트(버전별 업데이트 이력, 코드 하드코딩)와는 별개로 관리자가 실시간으로 작성하는 공지 게시판.

| 컬럼명     | 타입        | 설명                                             |
| ---------- | ----------- | ------------------------------------------------ |
| id         | uuid        | PK                                               |
| title      | text        | 제목                                             |
| content    | text        | 내용                                             |
| is_test    | boolean     | 테스트 공지 여부 (기본값 false). true면 관리자만 조회 가능 |
| created_at | timestamptz |                                                  |
| updated_at | timestamptz |                                                  |

**RLS 정책 (notices 테이블):**

| 정책명                | 커맨드 | 설명                                                              |
| ---------------------- | ------ | ------------------------------------------------------------------ |
| 로그인 유저 select     | SELECT | is_test = false인 공지는 모든 로그인 유저 조회 가능, true면 관리자만 |
| 관리자 insert          | INSERT | 관리자만 작성 가능                                                  |
| 관리자 update          | UPDATE | 관리자만 수정 가능                                                  |
| 관리자 delete          | DELETE | 관리자만 삭제 가능                                                  |

새 공지 작성 시 대시보드에 최초 1회 팝업 노출. "마지막으로 본 공지 id"는 서버 동기화 없이 로컬스토리지에만 저장(기기별).
