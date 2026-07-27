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
| admin_get_user_providers()  | AdminSignupLogView.vue (가입 이력) | SECURITY DEFINER. 관리자만 호출 가능. 이메일별 로그인 수단 배열 반환. 토스 계정은 `createUser`로 만들어져 auth.identities에 `email`로만 남으므로, `toss_identities`를 UNION해 `'toss'`를 함께 넣는다 |
| claim_toss_promotion(p_promotion_code, p_amount, p_toss_user_key) | tossPromotion.ts (프로모션 수령) | SECURITY DEFINER. 지급 전 예약. `'OK'`(예약 성공) 또는 `'ALREADY'`(중복 참여) 반환 |
| complete_toss_promotion(p_promotion_code, p_reward_key, p_error_code) | tossPromotion.ts (프로모션 수령) | SECURITY DEFINER. PENDING → GRANTED/FAILED 전이. PENDING 상태에서만 전이되므로 재수령 불가 |

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
| base_currency      | currency_enum | 기준통화 — target_asset/monthly_investment의 단위 (기본값 KRW)   |
| locale             | text        | 표시 언어 ko \| en \| ja \| zh (기본값 ko, CHECK 제약)           |
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
| current_asset        | int8        | 현재 평가 자산 (base_currency 단위) |
| investment_principal | int8        | 투자 원금 (base_currency 단위)      |
| base_currency        | currency_enum | 금액 단위 통화 (기본값 KRW)       |
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
| asset_type | text          | 자산 유형 (한글, 레거시). 프론트 참조 전면 제거 완료 → 컬럼 DROP SQL 실행 대기(`migrations/20260711_04`, main 배포 후) — GLOBALIZATION.md 사용자 단계 6 |
| asset_class | text         | stock \| etf \| crypto \| cash (CHECK 제약)  |
| market     | text          | KR \| US \| JP \| CN (CHECK 제약, crypto/cash는 NULL) |
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
| current_asset | int8        | 해당 일 평가 자산 (base_currency 단위, 현금 제외) |
| progress_pct  | float8      | FIRE 달성률 % (nullable)                 |
| base_currency | currency_enum | 기록 시점의 기준통화 (행 단위 보존 — 기준통화를 바꿔도 과거 행은 소급 환산하지 않음) |
| created_at    | timestamptz |                                          |

**pg_cron 스케줄:** `daily-asset-snapshot` — `0 15 * * *` (UTC) = 매일 KST 00:00 실행

```sql
-- save_daily_asset_snapshot() 함수
BEGIN
  INSERT INTO asset_history (user_id, recorded_at, current_asset, progress_pct, base_currency)
  SELECT
    a.user_id,
    CURRENT_DATE,
    a.current_asset,
    ROUND((a.current_asset::float8 / g.target_asset * 100)::numeric, 2),
    a.base_currency
  FROM asset_summary a
  JOIN investment_goals g ON g.user_id = a.user_id
  WHERE a.current_asset > 0
  ON CONFLICT (user_id, recorded_at) DO UPDATE
    SET current_asset = EXCLUDED.current_asset,
        progress_pct  = EXCLUDED.progress_pct,
        base_currency = EXCLUDED.base_currency;
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
| exchange_rate    | numeric               | 거래 시점 환율: 거래통화 1단위 = base_currency 얼마 (거래통화 == base_currency면 NULL) |
| base_currency    | currency_enum         | exchange_rate가 환산하는 통화 (기본값 KRW) |
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

#### toss_promotion_rewards

앱인토스 프로모션(토스포인트) 지급 이력. 지급 자체는 미니앱 클라이언트의 브리지 호출(`grantPromotionReward`)로만 가능하므로, 중복 지급은 이 테이블의 유니크 인덱스 + "예약(PENDING) → 지급 → 결과 확정" 순서로 막는다.

| 컬럼명         | 타입        | 설명                                                          |
| -------------- | ----------- | ------------------------------------------------------------- |
| id             | uuid        | PK                                                            |
| user_id        | uuid        | auth.users FK                                                 |
| promotion_code | text        | 앱인토스 콘솔에서 발급받은 프로모션 코드                        |
| toss_user_key  | text        | `getAnonymousKey()` 해시. 같은 토스 계정의 중복 수령 차단용       |
| amount         | integer     | 지급 금액(토스포인트)                                          |
| status         | text        | PENDING(예약) / GRANTED(지급완료) / FAILED(지급실패, 재시도 가능) |
| reward_key     | text        | 지급 성공 시 토스가 돌려준 리워드 키                            |
| error_code     | text        | 지급 실패 시 에러 코드                                         |
| created_at     | timestamptz |                                                               |
| updated_at     | timestamptz |                                                               |

**유니크 인덱스:** `(user_id, promotion_code)` — 계정당 1회 / `(toss_user_key, promotion_code)` where toss_user_key is not null — 같은 토스 계정으로 앱 계정을 여러 개 만들어 중복 수령하는 것 차단

**RLS 정책 (toss_promotion_rewards 테이블):**

| 정책명        | 커맨드 | 설명                                                     |
| ------------- | ------ | -------------------------------------------------------- |
| 본인 select   | SELECT | 본인 이력만 조회 가능                                     |
| 관리자 select | SELECT | 관리자는 전체 조회 가능                                   |

INSERT/UPDATE 정책은 두지 않는다 — 기록은 `claim_toss_promotion` / `complete_toss_promotion` RPC(SECURITY DEFINER)를 통해서만 이뤄진다. 지급 여부를 알 수 없는 결과(`'ERROR'`)는 PENDING으로 남겨 재시도를 막는다(이중 지급 방지).

#### toss_identities

토스 로그인 계정 매핑. 토스가 주는 `userKey`(앱 단위 고유 식별자)와 앱 계정을 1:1로 연결한다. 이메일만으로 매칭하면 유저가 토스 프로필 이메일을 바꿨을 때 같은 사람에게 계정이 하나 더 생기므로, `userKey`를 1순위 식별자로 둔다.

| 컬럼명        | 타입        | 설명                                            |
| ------------- | ----------- | ----------------------------------------------- |
| user_id       | uuid        | PK, auth.users FK                               |
| toss_user_key | text        | UNIQUE. `login-me` 응답의 `userKey`              |
| created_at    | timestamptz |                                                 |

`toss_promotion_rewards.toss_user_key`와는 **다른 값**이다. 프로모션 쪽은 `getAnonymousKey()`의 해시이고, 이쪽은 토스 로그인의 `userKey`다. 문서상 anon 해시는 "토스 서버 API 호출용 키가 아니"라고 명시돼 있어 서로 매칭되지 않는다.

**RLS 정책 (toss_identities 테이블):**

| 정책명        | 커맨드 | 설명                    |
| ------------- | ------ | ----------------------- |
| 본인 select   | SELECT | 본인 매핑만 조회 가능    |
| 관리자 select | SELECT | 관리자는 전체 조회 가능  |

INSERT/UPDATE 정책은 두지 않는다 — 기록은 `toss-login` Edge Function(service_role)에서만 이뤄진다.
