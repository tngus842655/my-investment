# EDGE_FUNCTIONS.md

Supabase Edge Functions 정리. 실제 소스는 각 파일로 관리되므로 `supabase/functions/{함수명}.ts`를 참고할 것. 모두 CORS `*` 허용, `OPTIONS` 프리플라이트 처리 포함.

#### stock-price

주식/ETF/암호화폐 현재가 조회. `src/services/market.ts`에서 호출. 소스: `supabase/functions/stock-price.ts`

- **파라미터**: `{ ticker, asset_type, currency }`
- **응답**: `{ ticker, price }`
- **로직**: 국내주식(`asset_type === '국내주식'` 또는 `ETF`+`KRW` 또는 6자리 숫자 티커)이면 Yahoo Finance chart API로 KOSPI(`.KS`) 조회 후 실패 시 KOSDAQ(`.KQ`) 재시도. 그 외(해외주식/암호화폐)는 Finnhub API 사용 (`FINNHUB_API_KEY` 환경변수 필요, 암호화폐는 `BINANCE:{ticker}USDT` 심볼).

#### exchange-rate

환율 조회. `src/services/market.ts`에서 호출. 소스: `supabase/functions/exchange-rate.ts`

- **파라미터**: `{ from, to }`
- **응답**: `{ rate, from, to }`
- **로직**: 무료 API `open.er-api.com/v6/latest/{from}` 호출 (API 키 불필요), `rates[to]` 값 반환.

#### etf-info

ETF 상세 정보(현재가/52주 고저/CAGR/MDD/변동성/배당률/운용보수/베타 등) 조회. `EtfAnalysisView.vue`에서 호출. 소스: `supabase/functions/etf-info.ts`

- **파라미터**: `{ tickers: string[] }`
- **응답**: `{ data: [...] }` (티커별 정보 배열, 실패한 티커는 결과에서 제외)
- **로직**: Yahoo Finance `chart` API(월봉, 기본 정보 + CAGR/MDD/변동성 계산)와 `quoteSummary` API(배당률/운용보수/베타 등, crumb 인증 필요)를 병렬 조회 후 병합. 국내 6자리 티커는 `.KS` 심볼로 변환.

#### etf-backtest

적립식(DCA) 백테스트 시뮬레이션. `EtfBacktestView.vue`에서 호출. 소스: `supabase/functions/etf-backtest.ts`

- **파라미터**: `{ ticker, monthly_amount, start_ym }` (`start_ym`은 `"YYYY-MM"`)
- **응답**: `{ ticker, name, currency, monthly: [...], summary: { totalInvested, evalAmount, profit, totalReturn, cagr, mdd, mddYm, peakEval, peakYm, months, startYm, endYm } }`
- **로직**: Yahoo Finance `chart` API로 시작월~현재까지 월별 종가(adjclose 우선) 조회, 매월 말 `monthly_amount`만큼 매수했다고 가정하고 누적 매입금액/평가금액/CAGR/MDD 계산. 티커 없거나 데이터 없으면 `{ error: 'ticker_not_found' }`를 status 200으로 반환.

#### etf-dividend

배당 캘린더(과거 배당 이력 + 다음 예정 배당락일) 조회. `DividendCalendarView.vue`에서 호출. 소스: `supabase/functions/etf-dividend.ts`

- **파라미터**: `{ tickers: { ticker, currency }[] }`
- **응답**: `{ data: [{ ticker, currency, dividends: [{ date, amount, type: 'ex' | 'next' }] }] }`
- **로직**: Yahoo Finance `chart` API(`events=dividends`)로 과거 배당 이력, `quoteSummary`(`calendarEvents`)로 다음 배당락일 조회 후 병합·정렬. 국내 6자리 티커(KRW)는 `.KS` 심볼로 변환.

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

### 공통 환경변수

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: admin-delete-user, admin-reset-password에서 사용
- `FINNHUB_API_KEY`: stock-price에서 해외주식/암호화폐 조회 시 사용
