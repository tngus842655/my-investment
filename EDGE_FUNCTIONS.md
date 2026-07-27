# EDGE_FUNCTIONS.md

Supabase Edge Functions 정리. 실제 소스는 각 파일로 관리되므로 `supabase/functions/{함수명}.ts`를 참고할 것. 모두 CORS `*` 허용, `OPTIONS` 프리플라이트 처리 포함.

#### stock-price

주식/ETF/암호화폐 현재가 조회. `src/services/market.ts`에서 호출. 소스: `supabase/functions/stock-price.ts`

- **파라미터**: `{ ticker, asset_class, market, currency }` (구버전 프론트 하위호환으로 `asset_type`(한글)만 보내는 요청도 인식 — 국내주식/ETF+KRW/6자리 티커→KR, 그 외→US로 유추)
- **응답**: `{ ticker, price }`
- **로직**: `asset_class === 'crypto'`면 Finnhub `BINANCE:{ticker}USDT`. 그 외에는 `market`의 야후 서픽스 맵(KR→`.KS`/`.KQ`, JP→`.T`, CN→`.SS`/`.SZ`, 프론트 `marketConfig.ts`와 동일)으로 분기 — 서픽스가 있는 시장은 Yahoo Finance chart API를 서픽스 순서대로 시도, 서픽스가 없는 시장(US)은 Finnhub API 사용 (`FINNHUB_API_KEY` 환경변수 필요).

#### exchange-rate

환율 조회. `src/services/market.ts`에서 호출. 소스: `supabase/functions/exchange-rate.ts`

- **파라미터**: `{ from, to }`
- **응답**: `{ rate, from, to }`
- **로직**: 무료 API `open.er-api.com/v6/latest/{from}` 호출 (API 키 불필요), `rates[to]` 값 반환.

#### etf-info

ETF 상세 정보(현재가/52주 고저/CAGR/MDD/변동성/배당률/운용보수/베타 등) 조회. `EtfAnalysisView.vue`에서 호출. 소스: `supabase/functions/etf-info.ts`

- **파라미터**: `{ tickers: string[] }`
- **응답**: `{ data: [...] }` (티커별 정보 배열, 실패한 티커는 결과에서 제외)
- **로직**: Yahoo Finance `chart` API(월봉, 기본 정보 + CAGR/MDD/변동성 계산)와 `quoteSummary` API(배당률/운용보수/베타 등, crumb 인증 필요)를 병렬 조회 후 병합. 국내 6자리 티커는 `.KS` → `.KQ` 순서로 시도(시장 서픽스 맵은 `marketConfig.ts`와 동일). 응답에 프론트 공통 구간 재계산용 `chartData: { t, c }[]`(월별 타임스탬프+종가) 포함.

#### etf-backtest

적립식(DCA) 백테스트 시뮬레이션. `EtfBacktestView.vue`에서 호출. 소스: `supabase/functions/etf-backtest.ts`

- **파라미터**: `{ ticker, monthly_amount, start_ym }` (`start_ym`은 `"YYYY-MM"`)
- **응답**: `{ ticker, name, currency, monthly: [...], summary: { totalInvested, evalAmount, profit, totalReturn, cagr, mdd, mddYm, peakEval, peakYm, months, startYm, endYm } }`
- **로직**: Yahoo Finance `chart` API로 시작월~현재까지 월별 종가(adjclose 우선) 조회, 매월 말 `monthly_amount`만큼 매수했다고 가정하고 누적 매입금액/평가금액/CAGR/MDD 계산. 국내 6자리 티커는 `.KS` → `.KQ` 순서로 시도. 티커 없거나 데이터 없으면 `{ error: 'ticker_not_found' }`를 status 200으로 반환.

#### etf-dividend

배당 캘린더(과거 배당 이력 + 다음 예정 배당락일) 조회. `DividendCalendarView.vue`에서 호출. 소스: `supabase/functions/etf-dividend.ts`

- **파라미터**: `{ tickers: { ticker, currency }[] }`
- **응답**: `{ data: [{ ticker, currency, dividends: [{ date, amount, type: 'ex' | 'next' }] }] }`
- **로직**: Yahoo Finance `chart` API(`events=dividends`)로 과거 배당 이력, `quoteSummary`(`calendarEvents`)로 다음 배당락일 조회 후 병합·정렬. 통화로 시장을 판별(KRW→KR, JPY→JP, CNY→CN)해 해당 시장 형식의 티커면 서픽스를 순서대로 시도 (예: 국내 6자리 티커는 `.KS` → `.KQ`).

#### admin-delete-user

관리자 전용 사용자 강제 삭제. `AdminSignupLogView.vue`에서 `fetch`로 직접 호출 (`supabase.functions.invoke` 아님). 소스: `supabase/functions/admin-delete-user.ts`

- **인증**: `Authorization` 헤더로 호출자 확인 후, `SUPABASE_SERVICE_ROLE_KEY`로 호출자 이메일이 관리자(`tngus842655@gmail.com`)인지 검증. 아니면 401/403.
- **파라미터**: `{ email }`
- **응답**: `{ success: true }`
- **로직**: 이메일로 대상 유저를 찾아 `auth.admin.deleteUser`로 강제 삭제 (CASCADE로 관련 데이터 전부 삭제).

#### admin-reset-password

관리자 전용 비밀번호 초기화. `AdminResetPasswordView.vue`에서 `fetch`로 직접 호출. 소스: `supabase/functions/admin-reset-password.ts`

- **인증**: admin-delete-user와 동일한 관리자 검증.
- **파라미터**: `{ email, newPassword }` (`newPassword`는 6자 이상)
- **응답**: `{ success: true }`
- **로직**: 이메일로 대상 유저를 찾아 `auth.admin.updateUserById`로 비밀번호 변경.

#### toss-login

토스 로그인. 미니앱에서 받은 인가 코드를 Supabase 세션으로 바꿔준다. `src/services/tossLogin.ts`에서 호출. 소스: `supabase/functions/toss-login.ts`

- **인증**: 없음 (세션을 만드는 것이 목적이라 호출 시점에 세션이 없다). 위조 방지는 인가 코드를 토스 서버에 교환해 보는 것으로 이뤄진다.
- **파라미터**: `{ authorizationCode, referrer, email? }` (`email`은 토스가 이메일을 주지 않아 유저가 직접 입력한 경우에만)
- **응답**: `{ tokenHash, email }` / `{ needsEmail: true }` / `{ error }`
- **로직**: mTLS로 `generate-token` → `login-me` 호출 → `userKey` 확보. ① `toss_identities`에 매핑이 있으면 그 계정, ② 없으면 토스가 준 이메일(AES-256-GCM 복호화)로 기존 계정 매칭, ③ 이메일이 없으면 `needsEmail`을 돌려주고 클라이언트가 입력받아 재요청. 계정은 `admin.createUser({ email_confirm: true })`로 만들어 **확인 메일을 보내지 않고**, `admin.generateLink({ type: 'magiclink' })`의 `hashed_token`만 돌려준다(발송 없음). 클라이언트가 `verifyOtp`로 세션을 세운다.
- **거부 조건**: 관리자 이메일은 자동 연결 대상에서 제외(`admin_not_allowed`). 유저가 **직접 입력한** 이메일이 기존 계정과 겹치면 계정 가로채기가 되므로 거부(`email_conflict`) — 토스가 준 이메일은 토스 계정 등록값이라 이 제한을 두지 않는다.

#### toss-disconnect

회원탈퇴 시 토스 쪽 로그인 연결 해제. `HubView.vue`의 탈퇴 플로우에서 계정 삭제 직전에 호출. 소스: `supabase/functions/toss-disconnect.ts`

- **인증**: `Authorization` 헤더로 호출자 세션 확인
- **파라미터**: 없음 (세션 유저의 `toss_identities` 매핑을 사용)
- **응답**: `{ success: boolean }`
- **로직**: mTLS로 `remove-by-user-key` 호출. 토스로 가입하지 않은 계정이면 아무것도 하지 않고 성공 반환. 서비스가 직접 이 API를 호출한 경우 연결 끊기 콜백은 오지 않는다.

### 공통 환경변수

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: admin-delete-user, admin-reset-password에서 사용
- `FINNHUB_API_KEY`: stock-price에서 해외주식/암호화폐 조회 시 사용
- `TOSS_MTLS_CERT`, `TOSS_MTLS_KEY`: toss-login, toss-disconnect. 앱인토스 콘솔 > mTLS 인증서에서 발급받은 PEM 내용을 그대로 넣는다
- `TOSS_DECRYPT_KEY`: toss-login. 콘솔 토스 로그인 설정의 '이메일로 복호화 키 받기'로 받는다
- `TOSS_DECRYPT_AAD`: toss-login. **등록하지 않아도 된다** — 문서는 AAD를 복호화 키와 함께 메일로 준다고 하는데 실제로는 키만 오고, 문서의 PHP 예제가 `TOSS`로 하드코딩해 둬서 코드도 그 값을 기본으로 쓴다. 나중에 다른 값을 안내받으면 이 시크릿으로 덮어쓴다

> toss-login은 호출 시점에 사용자 세션이 없지만, `supabase.functions.invoke`가 anon key를 Authorization 헤더로 실어 보내므로 게이트웨이 JWT 검증은 그대로 통과한다. `--no-verify-jwt`는 필요 없다. (나중에 연결 끊기 콜백을 켜면, 그건 토스가 Basic 헤더로 직접 호출하므로 그 함수만 검증을 꺼야 한다.)
