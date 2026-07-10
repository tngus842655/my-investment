# GLOBALIZATION.md — 다국가 지원 설계

Fire Path를 한국 전용에서 다국가 서비스로 확장하기 위한 테이블·코드 설계 문서.
1차 목표는 **한국(ko/KRW) + 미국(en/USD)** 2개 국가이며, 이후 일본(ja/JPY), 중국(zh/CNY) 등을
**테이블 변경 없이(또는 최소 변경으로)** 추가할 수 있는 구조를 만든다.

작성일: 2026-07-10. 아직 착수 전 — 실행 시 이 문서의 단계 번호로 지시한다.

---

## 1. 핵심 설계 원칙

1. **기준통화(base currency)와 거래통화(transaction currency)를 분리한다.**
   - 거래통화: 종목을 매수한 통화. 미국주식=USD, 한국주식=KRW, 일본주식=JPY. (현행 유지·확장)
   - 기준통화: 사용자가 선택한 "내 자산을 집계하는 통화". 지금은 KRW로 암묵 고정 → 명시적 컬럼으로.
2. **"국내/해외" 분류를 폐기하고 시장(market) + 자산군(asset_class) 2축으로 재설계한다.**
   - `'국내주식'`은 한국 관점 명칭이라 다국가에서 무의미. `stock + KR`, `stock + US`처럼 표현.
3. **국가 추가 = 데이터 추가**가 되도록 한다. 시장/통화별 상수(야후 심볼 서픽스, 통화 포맷 등)는
   enum이 아닌 텍스트 + 프론트 설정 파일(`marketConfig.ts`)로 관리 → 일본 추가 시 DB는 enum에
   JPY 넣는 것 외에 변경 없음.
4. **과거 스냅샷은 소급 환산하지 않는다.** `asset_history`는 "그 시점 기준통화로 계산된 값"을
   행 단위 통화와 함께 보존. 기준통화를 나중에 바꿔도 과거 기록은 그대로 둔다.
5. **점진 마이그레이션(dual-run).** 새 컬럼을 추가하고 백필한 뒤 프론트를 전환하고,
   마지막에 옛 컬럼을 제거한다. 각 단계 사이에 앱이 정상 동작해야 한다.

---

## 2. 최종 데이터 모델

### 2-1. 코드 체계

| 항목 | 값 | 비고 |
| --- | --- | --- |
| market | `'KR' \| 'US' \| 'JP' \| 'CN' ...` | ISO 3166-1 alpha-2. text + CHECK 제약 |
| asset_class | `'stock' \| 'etf' \| 'crypto' \| 'cash'` | text + CHECK 제약 |
| currency | `KRW \| USD \| JPY \| CNY ...` | 기존 `currency_enum` 확장 |
| locale | `'ko' \| 'en' \| 'ja' \| 'zh' ...` | 표시 언어. text |

- crypto/cash는 market이 `NULL` (시장 개념 없음).
- 현금 티커는 현행 `CASH_KRW`/`CASH_USD` 패턴 유지 → `CASH_JPY` 등으로 자연 확장.

### 2-2. 테이블별 변경 요약

```
portfolios
  + asset_class  text   NOT NULL      -- 'stock'|'etf'|'crypto'|'cash'
  + market       text   NULL          -- 'KR'|'US'|... (crypto/cash는 NULL)
  - asset_type   (전환 완료 후 제거)   -- 현행: '국내주식'|'해외주식'|'ETF'|'암호화폐'|'현금'
  · currency     (유지, enum 값만 확장)

transactions
  + base_currency  currency_enum  NOT NULL DEFAULT 'KRW'
      -- 이 거래의 exchange_rate가 "거래통화 → 무슨 통화" 환율인지 명시
  · exchange_rate  (유지) 의미 재정의: 거래통화 1단위 = base_currency 얼마 (거래 시점)
      -- 거래통화 == base_currency면 NULL 또는 1
      -- 기존 데이터: USD 거래에만 USD→KRW 환율이 저장돼 있음 → base_currency='KRW'로 백필하면 의미 일치

investment_goals
  + base_currency  currency_enum  NOT NULL DEFAULT 'KRW'
      -- target_asset / monthly_investment의 단위 (의미 재정의: KRW 고정 → base_currency 단위)
  + locale         text           NOT NULL DEFAULT 'ko'
      -- 표시 언어 (theme처럼 사용자 설정의 일부)

asset_summary
  + base_currency  currency_enum  NOT NULL DEFAULT 'KRW'
      -- current_asset / investment_principal의 단위

asset_history
  + base_currency  currency_enum  NOT NULL DEFAULT 'KRW'
      -- current_asset의 단위. 행마다 기록(원칙 4)

save_daily_asset_snapshot() 함수
  · asset_summary.base_currency를 스냅샷 행에 복사하도록 수정
```

**신규 테이블은 없다.** 환율은 현행처럼 실시간 API + 클라이언트 캐시로 충분하고,
시장별 설정은 프론트 설정 파일이 담당한다.

### 2-3. 금액 타입 주의 (JPY 대비)

`investment_goals.target_asset` 등이 `int8`인데, JPY도 소수점이 없어 당장 문제없다.
단, `asset_summary`/`asset_history`는 USD 기준 사용자의 경우 센트 단위가 잘린다.
→ **정수 반올림 유지로 결정** (자산 집계에서 $1 미만 오차는 무시 가능). 바꾸고 싶으면
`numeric`으로 타입 변경하면 되지만 필수는 아님.

### 2-4. 기준통화 변경 시 동작 (정책)

사용자가 기준통화를 KRW → USD로 바꾸면:
- `investment_goals.target_asset`/`monthly_investment`: **현재 환율로 1회 환산해서 UPDATE** (프론트에서 수행, 확인 다이얼로그 필수)
- `asset_summary`: 다음 재계산 때 새 기준통화로 저장됨 (즉시 재계산 트리거)
- `asset_history`: 과거 행은 그대로 (base_currency='KRW'인 채 보존). 차트에서 통화가 섞이는
  구간은 "표시 시점 환율로 환산해서 이어 그리기" — 완벽하진 않지만 원칙 4의 트레이드오프
- `transactions.exchange_rate`: 과거 거래는 그대로 (base_currency 컬럼이 행마다 있으므로 해석 가능)

이 정책 덕에 "기준통화 변경"은 드문 이벤트여도 데이터가 깨지지 않는다.

---

## 3. 사용자 작업 (Supabase SQL Editor에서 실행)

각 단계는 독립적으로 실행 가능하며, 실행 후에도 기존 앱이 그대로 동작한다(하위호환).
**단계 순서대로 실행할 것.** 마이그레이션 파일도 같은 내용으로 저장해달라고 지시하면
`supabase/migrations/`에 기록해준다.

### 사용자 단계 1 — currency_enum 확장

> ⚠️ `ALTER TYPE ... ADD VALUE`는 트랜잭션 안에서 실행 불가. 한 줄씩 실행할 것.
> 당장 미국까지만 하더라도 JPY/CNY를 미리 넣어두면 나중에 이 단계를 반복할 필요 없음.

```sql
ALTER TYPE currency_enum ADD VALUE IF NOT EXISTS 'JPY';
```
```sql
ALTER TYPE currency_enum ADD VALUE IF NOT EXISTS 'CNY';
```

### 사용자 단계 2 — portfolios에 asset_class / market 추가 + 백필

```sql
-- 2-1. 컬럼 추가 (CHECK로 값 제한, 국가 추가 시 CHECK만 수정)
ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS asset_class text
    CHECK (asset_class IN ('stock', 'etf', 'crypto', 'cash')),
  ADD COLUMN IF NOT EXISTS market text
    CHECK (market IN ('KR', 'US', 'JP', 'CN'));

-- 2-2. 기존 데이터 백필 (기존 유저는 전원 한국인 전제)
UPDATE portfolios SET
  asset_class = CASE asset_type
    WHEN '국내주식' THEN 'stock'
    WHEN '해외주식' THEN 'stock'
    WHEN 'ETF'      THEN 'etf'
    WHEN '암호화폐' THEN 'crypto'
    WHEN '현금'     THEN 'cash'
  END,
  market = CASE
    WHEN asset_type = '국내주식' THEN 'KR'
    WHEN asset_type = '해외주식' THEN 'US'
    -- ETF는 통화로 시장 판별 (KRW=국내 상장, USD=미국 상장)
    WHEN asset_type = 'ETF' AND currency = 'KRW' THEN 'KR'
    WHEN asset_type = 'ETF' AND currency = 'USD' THEN 'US'
    ELSE NULL  -- 암호화폐/현금
  END
WHERE asset_class IS NULL;

-- 2-3. 백필 검증 (0이어야 정상)
SELECT count(*) FROM portfolios WHERE asset_class IS NULL;

-- 2-4. NOT NULL 제약 (검증 통과 후)
ALTER TABLE portfolios ALTER COLUMN asset_class SET NOT NULL;
```

### 사용자 단계 3 — transactions에 base_currency 추가

```sql
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS base_currency currency_enum NOT NULL DEFAULT 'KRW';
-- 기존 데이터는 전부 KRW 기준으로 저장돼 있었으므로 DEFAULT 'KRW' 백필로 의미가 정확히 일치.
-- (exchange_rate는 USD 거래에만 USD→KRW 환율로 저장돼 있음 → 그대로 유효)
```

### 사용자 단계 4 — investment_goals에 base_currency / locale 추가

```sql
ALTER TABLE investment_goals
  ADD COLUMN IF NOT EXISTS base_currency currency_enum NOT NULL DEFAULT 'KRW',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'ko'
    CHECK (locale IN ('ko', 'en', 'ja', 'zh'));
```

### 사용자 단계 5 — asset_summary / asset_history에 base_currency 추가 + 스냅샷 함수 교체

```sql
-- 5-1. 컬럼 추가
ALTER TABLE asset_summary
  ADD COLUMN IF NOT EXISTS base_currency currency_enum NOT NULL DEFAULT 'KRW';

ALTER TABLE asset_history
  ADD COLUMN IF NOT EXISTS base_currency currency_enum NOT NULL DEFAULT 'KRW';

-- 5-2. 일별 스냅샷 함수 교체 (asset_summary의 base_currency를 스냅샷에 복사)
CREATE OR REPLACE FUNCTION save_daily_asset_snapshot()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;
```

### 사용자 단계 6 — (맨 마지막) asset_type 컬럼 제거

> ⚠️ **Claude 단계 A~C가 전부 배포되고 안정화된 후에만 실행.**
> 프론트가 asset_type을 한 곳도 참조하지 않는 것이 확인된 뒤의 정리 작업.

```sql
ALTER TABLE portfolios DROP COLUMN asset_type;
```

---

## 4. Claude 작업 (단계별 지시용)

아래 단계 이름으로 지시하면 된다 (예: "GLOBALIZATION 단계 A 진행해줘").
의존관계: **A → B → C**는 순서 필수, D/E는 C 이후 아무 때나, F는 각 단계 직후 수시로.

### 단계 A — 시장/자산군 재설계 (프론트 전환) 〔사용자 단계 2 완료 후〕

가장 큰 작업. `asset_type` 한글 리터럴 분기(현재 15개 파일, 약 100곳)를
`asset_class` + `market` 기반으로 전면 교체.

- `src/config/marketConfig.ts` 신설 — 시장/통화별 상수의 단일 소스:
  ```ts
  // 국가 추가 = 이 파일에 항목 추가 (+ DB CHECK 제약 수정)
  MARKETS: {
    KR: { currency: 'KRW', yahooSuffix: ['.KS', '.KQ'], label: { ko: '한국', en: 'Korea' } },
    US: { currency: 'USD', yahooSuffix: [], label: { ko: '미국', en: 'US' } },
    ...
  }
  CURRENCIES: {
    KRW: { symbol: '₩', decimals: 0, shortUnits: [억, 만] },
    USD: { symbol: '$', decimals: 2, shortUnits: [M, K] },
    ...
  }
  ```
- `src/types/portfolio.ts` — `asset_class`/`market` 필드 추가, asset_type 제거
- 보유자산/거래 추가 다이얼로그 — 자산유형 선택 UI를 "자산군 + 시장" 조합으로 변경
  (사용자 locale에 따라 기본 시장 자동 선택: ko→KR, en→US)
- 15개 파일의 `'국내주식'`/`'해외주식'`/`'현금'`/`'암호화폐'` 분기 전부 교체
- insert/update 시 asset_class·market 저장 (전환기에는 asset_type도 함께 기록해 하위호환)
- 검증: vue-tsc + 기존 데이터로 자산/거래/대시보드 화면 값 불변 확인

### 단계 B — Edge Function 개편 〔단계 A와 동시 가능〕

- `stock-price`: `asset_type === '국내주식'` 분기 → `market` 파라미터 기반으로 변경.
  야후 심볼 서픽스를 marketConfig와 동일한 맵(KR→`.KS`/`.KQ`, JP→`.T`, CN→`.SS`/`.SZ`)으로 처리.
  전환기 하위호환: asset_type 파라미터도 당분간 인식.
- `etf-info` / `etf-dividend` / `etf-backtest`: 6자리 티커→`.KS` 하드코딩을 동일한 맵으로 교체.
- 검증: 기존 티커(AAPL, 005930, QQQ) + 일본 티커(7203.T 등) 시세 조회 확인.

### 단계 C — 기준통화 도입 〔사용자 단계 3·4·5 + Claude 단계 A 완료 후〕

- `useDisplayCurrency` → `useBaseCurrency`로 일반화:
  "KRW 고정 ÷ 환율" 구조를 "모든 금액을 base_currency로 환산해 집계·표시"로 재작성.
  이번에 만든 원화/달러 토글은 이 구조의 프로토타입 — 토글은 "기준통화 ↔ 보조통화 미리보기"로 재해석.
- `exchangeRateCache`: 단일 USD/KRW 캐시 → 통화쌍별 캐시(`{from}_{to}` 키)로 확장.
  환산은 USD 허브 방식(A→B = A→USD × USD→B)으로 API 호출 최소화.
- `portfolioMath.ts`: `evaluateItemKrw` → `evaluateItemBase(item, price, rates, baseCurrency)`로 일반화.
  assetSummary 재계산·스냅샷 저장 시 base_currency 기록.
- 거래 저장 시 `base_currency` + `exchange_rate`(거래통화→기준통화) 기록.
- 목표 설정 화면: 기준통화 선택 UI + 변경 시 목표금액 환산 확인 다이얼로그(2-4 정책).
- 금액 포맷: `formatShortMoney`(억/만)를 CURRENCIES 설정 기반 통화별 포맷터로 교체.
- 검증: 기존 한국 유저 화면 값 불변(base=KRW) + base=USD 신규 계정 시나리오.

### 단계 D — i18n 도입 (ko/en) 〔단계 C 이후 권장〕

- `vue-i18n` 설치, `src/locales/ko.json` + `en.json`.
- 사용자 화면만 대상 (**관리자 화면 제외** — 기존 결정).
- locale 저장: `investment_goals.locale` + localStorage(비로그인 대비), 최초값은 브라우저 언어.
- 더보기 > 화면 설정에 언어 선택 추가.
- 날짜/숫자 포맷도 locale 연동 (`2027년 9월` ↔ `Sep 2027`).
- 일본어/중국어 추가 = locales 파일 추가 + CHECK 제약 수정뿐인 구조로.

### 단계 E — 티커 표시명 로케일화 〔단계 D 이후〕

- `TICKER_NAMES`(한글 고정) → locale별 매핑으로 구조 변경.
  이름 없는 locale은 티커 원문 폴백 (현행 폴백 로직 유지).
- 종목 등록 검증 로직(국내주식: 목록 기반 차단)도 market 기반으로 정리.

### 단계 F — 문서 갱신 〔각 단계 직후 수시〕

- TABLE.md: 변경된 스키마 반영 (**누락돼 있던 transactions.exchange_rate 컬럼도 이번에 추가 기록**)
- EDGE_FUNCTIONS.md: stock-price 파라미터 변경 반영
- CLAUDE.md: marketConfig / useBaseCurrency 공통 패턴 추가
- 각 사용자 단계의 SQL을 `supabase/migrations/`에 파일로 저장

---

## 5. 실행 순서 요약 (사용자 ↔ Claude 인터리브)

```
[사용자] 단계 1  currency_enum 확장            ← 언제든, 5분
[사용자] 단계 2  portfolios 컬럼 추가+백필      ← 언제든, 10분
[Claude] 단계 A  시장/자산군 프론트 전환        ← 제일 큰 작업
[Claude] 단계 B  Edge Function 개편            ← A와 병행 가능
[사용자] 단계 3  transactions.base_currency
[사용자] 단계 4  investment_goals 컬럼 추가
[사용자] 단계 5  asset_summary/history + 스냅샷 함수
[Claude] 단계 C  기준통화 도입
[Claude] 단계 D  i18n (ko/en)
[Claude] 단계 E  티커명 로케일화
[사용자] 단계 6  asset_type 컬럼 제거           ← 전부 안정화된 후 정리
```

- 사용자 단계 1~5는 실행해도 기존 앱에 영향 없음 (컬럼 추가 + 하위호환).
- 일본/중국 추가 시: locale CHECK 수정 + marketConfig 항목 추가 + locales/ja.json — DB 구조 변경 없음.
