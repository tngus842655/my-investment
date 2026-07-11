# GLOBALIZATION.md — 다국가 지원 설계

Fire Path를 한국 전용에서 다국가 서비스로 확장하기 위한 테이블·코드 설계 문서.
1차 목표는 **한국(ko/KRW) + 미국(en/USD)** 2개 국가이며, 이후 일본(ja/JPY), 중국(zh/CNY) 등을
**테이블 변경 없이(또는 최소 변경으로)** 추가할 수 있는 구조를 만든다.

작성일: 2026-07-10. 실행 시 이 문서의 단계 번호로 지시한다.

**진행 상태** (완료 시 여기에 기록):

- ✅ 사용자 단계 1 (currency_enum 확장) — 2026-07-10 실행 완료
- ✅ 사용자 단계 2 (portfolios asset_class/market 추가+백필) — 2026-07-10 실행 완료, 검증 쿼리 0 확인
- ✅ Claude 단계 A-① (marketConfig.ts + types 기반 작업) — 2026-07-10 완료.
  `src/config/marketConfig.ts` 신설(시장/통화/자산군 상수 + 전환기 매핑 헬퍼),
  `PortfolioAsset` 타입에 asset_class/market optional 추가, 단계 1·2 SQL을 migrations에 기록
- ✅ Claude 단계 A-② (PortfolioView + 등록/거래 다이얼로그 전환) — 2026-07-10 완료.
  marketConfig에 접근자(getAssetClass/getMarket/isCash/isCrypto, 새 컬럼 우선 + asset_type 폴백) 추가,
  portfolioMath·assetSummary·PortfolioView·PortfolioAddDialog·TransactionAddDialog의 asset_type 분기를
  전부 접근자 기반으로 교체, 신규 등록 insert에 asset_class/market dual-write.
  **UI 선택지(국내주식/해외주식/암호화폐/현금)는 의도적으로 유지** — 한국 사용자용 화면이므로
  UI 재설계는 i18n(단계 D)과 함께 진행. getStockPrice 호출부의 asset_type 파라미터는 단계 B에서 교체.
- ✅ Claude 단계 A-③ (나머지 화면 전환) — 2026-07-11 완료.
  DashboardView·TransactionView·DividendCalendarView·PortfolioAnalysisView·AdminSignupLogView의
  asset_type 분기(현금/암호화폐 필터, 뱃지 색상, 유형 라벨)를 전부 접근자 기반으로 교체.
  표시 라벨은 classMarketToAssetType으로 기존 한글 명칭(테마 typeColors 키 포함)을 그대로 유지.
  개별 select 쿼리에 asset_class/market 컬럼 추가 (userData 스토어는 select '*'라 이미 포함).
  이로써 프론트의 asset_type 직접 분기는 0곳 — 남은 참조는 getStockPrice 파라미터(단계 B에서 교체),
  등록/거래 다이얼로그의 UI 선택지 내부 상태(단계 D에서 재설계), dual-write 기록뿐.
- ✅ Claude 단계 B (Edge Function 개편) — 2026-07-11 완료.
  stock-price를 `asset_class`/`market` 파라미터 기반으로 전환(구버전 asset_type 요청도 하위호환 인식),
  4개 함수 모두 야후 심볼 서픽스를 marketConfig와 동일한 맵(KR/US/JP/CN)으로 교체.
  etf-info/etf-backtest/etf-dividend는 심볼 후보를 순서대로 시도하는 구조로 변경 —
  부수 효과로 기존에 안 되던 KOSDAQ 상장 종목(`.KQ`)도 조회 가능해짐.
  프론트 `getStockPrice(ticker, item)` 시그니처 변경(ClassifiableItem 기반), 호출부 6곳 전환.
  ⚠️ Edge Function 4개(stock-price/etf-info/etf-backtest/etf-dividend)는 **사용자가 Supabase에 재배포 필요**.
  배포 후 기존 티커(AAPL, 005930, QQQ) + KOSDAQ/일본 티커 시세 조회 확인할 것
  (이 세션 환경은 외부 API 직접 호출이 막혀 있어 로컬 검증 불가, vue-tsc는 통과).
- ✅ 사용자 단계 3·4·5 (transactions/investment_goals/asset_summary/asset_history에 base_currency 등 추가,
  스냅샷 함수 교체) — 2026-07-11 실행 완료
- ✅ Claude 단계 C (기준통화 도입) — 2026-07-11 완료.
  `useDisplayCurrency` → `useBaseCurrency`로 대체(원화/달러 토글을 "기준통화 ↔ 미리보기"로 재해석,
  기존 localStorage 키 호환), `exchangeRateCache`를 통화쌍별 캐시(USD 허브)로 일반화,
  `portfolioMath`에 `convertMoney`/`evaluateItemBase`/`simpleCostBase` 도입(기존 Krw 함수 대체),
  asset_summary 저장(PortfolioView·assetSummary.ts)에 base_currency 기록,
  거래 저장(등록/거래 다이얼로그)에 base_currency + 거래통화→기준통화 환율 기록,
  목표 설정 화면에 기준통화 선택 UI + 변경 시 금액 환산 확인 다이얼로그(2-4 정책) + 변경 시 즉시 재계산,
  asset_history 표시(자산성장리포트/FIRE 진행기록)는 행별 base_currency를 표시 시점 환율로 환산,
  `formatMoneyIn(value, currency, style)` 통화별 포맷터 신설. 화면 10곳 표시 전환 완료.
  기준통화는 userData 스토어가 goals 로드 시 동기화. 검증: vue-tsc 통과 + base=KRW 경로는
  기존과 문자열 단위로 동일하도록 각 포맷터를 1:1 매핑(직접 구동 검증은 사용자 몫).
  참고: ETF 백테스트 화면의 "원화 환산" 병기와 관리자 화면은 KRW 고정 유지(각각 티커 통화 기준
  시뮬레이션·한국 운영자 전용이라 base 무관), i18n 문구는 단계 D에서 처리.
- ✅ Claude 단계 D-① (i18n 인프라 구축) — 2026-07-11 완료.
  `vue-i18n@11` 설치, `src/plugins/i18n.ts` 신설(Composition API 모드, `messages: { ko, en }`,
  초기 locale은 로컬스토리지 → 브라우저 언어 → 'ko' 순으로 감지), `src/locales/ko.json`/`en.json`
  스켈레톤(공통 문구 몇 개만, 대량 추출은 D-②③), `main.ts`에 `app.use(i18n)` 연결.
  `useLocale` 컴포저블 신설(`useBaseCurrency`와 동일 패턴) — `setLocale`은 즉시 반영,
  `setLocale`(계정 저장 포함 버전)은 로컬스토리지 + `investment_goals.locale`에 저장.
  userData 스토어가 goals 로드 시 DB의 locale을 로컬스토리지보다 우선 동기화(로그아웃 시 초기화 안 함 —
  테마와 동일하게 기기 단위 선호도로 취급). 더보기 > 화면 설정에 언어 선택 UI(한국어/English) 추가.
  실제 화면 문구는 아직 하드코딩 한글 그대로 — 다음 단계에서 순차 교체.
  검증: vue-tsc 통과. 언어 선택 UI는 존재하지만 대량 문구 교체 전이라 English 선택해도 대부분 한글 노출됨(의도됨).
- ✅ Claude 단계 D-② (메인 탭 문구 교체) — 2026-07-11 완료.
  i18n `globalInjection: true` 활성화(템플릿에서 `$t` 직접 사용). 공용 날짜/기간 포맷 유틸
  `src/utils/dateFormat.ts`(formatYearMonth/formatDuration) 신설 — ko "2027년 9월"/"3년 2개월"
  ↔ en "Sep 2027"/"3y 2mo". 하단 탭(AssetLayout) + 대시보드/자산/거래내역/예측 4개 화면의 하드코딩
  한글을 전부 i18n 키로 전환(스크립트 showMessage/computed 생성 문구 포함). 종목명 강조가 있는
  삭제 확인 문구는 `<i18n-t>` 컴포넌트 보간으로, FIRE Tip의 `<strong>` 포함 문장은 t() 메시지로 처리.
  통화-네이티브 금액 표기(억/만/원, $)는 언어가 아니라 통화 표기라 그대로 유지(ETF 백테스트와 동일 원칙).
  화면당 빌드 검증 후 커밋(4개 커밋). ⚠️ 로컬에서 새로 pull 시 `npm install` 필요(vue-i18n).
- 🔶 Claude 단계 D-③ (더보기 하위 화면들) — 진행 중. 범위가 넓어 4개 소단위로 분할:
  - ✅ D-③-a (더보기 메뉴 + 목표설정 + 화면설정) — 2026-07-11 완료.
    MoreView(메뉴 라벨/섹션), GoalSettingsView(제목/기준통화/목표·투자금/수익률/환산 다이얼로그/검증 메시지),
    DisplaySettingsView(글자크기/언어) i18n 전환. 강조(<strong>) 포함 문구는 <i18n-t> 컴포넌트 보간,
    예상 달성일·기간은 dateFormat 유틸 사용. `t` 이름 충돌(지역변수 vs useI18n) 1건 수정.
  - ✅ D-③-b (FIRE 관련 — FireSimulatorView / FireHistoryView / BadgesView) — 2026-07-11 완료.
    시뮬레이터(조건/비교/차이), 진행기록(기간필터/요약/차트안내), 배지(6개 배지 label·desc + 진행률/힌트)
    i18n 전환. BADGES/periods 데이터를 key 기반으로, monthsToLabel/Date는 dateFormat 유틸로 교체.
    배지 다음-힌트의 강조 라벨은 <i18n-t> 보간. 통화-네이티브 표기(원/슬라이더 만 단위)는 유지.
  - ✅ D-③-c (자산 분석 — PortfolioAnalysisView / AssetGrowthView) — 2026-07-11 완료.
    포트폴리오 분석(뷰 토글/비교 UI/도넛 중앙·범례/안내문), 성장 리포트(기간탭/요약 4카드/원금·수익 바/
    차트 텍스트/월별·일별 상세) i18n 전환. periods를 labelKey 기반으로. 통화-네이티브 '원' 표기 유지.
  - ⬜ D-③-d (투자 도구 — EtfAnalysisView / EtfBacktestView / DividendCalendarView)

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

### 단계별 권장 모델

| 단계 | 권장 모델 | 이유 |
| --- | --- | --- |
| A | **높음 (Opus급 이상)** | 15개 파일 ~100곳의 의미 판단 필요 — 같은 `asset_type` 분기라도 맥락마다 asset_class/market 중 어느 쪽으로 갈지 다름. 단, 아래처럼 2~3회로 쪼개 지시하면 Sonnet 중간으로도 가능 |
| B | Sonnet 중간 | 파일 몇 개, 분기 로직 교체로 범위가 좁고 명확 |
| C | **높음 (Opus급 이상)** | 금액 계산 의미론 변경 — 실수하면 "계산은 틀렸는데 화면상 그럴듯한" 버그가 남. 가장 신중해야 할 단계 |
| D | Sonnet 중간 | 양은 많지만 텍스트→키 추출의 기계적 반복 |
| E | Sonnet 중간 | 구조 단순 |
| F | Sonnet 중간 | 문서 작업 |

- **단계 A를 쪼개는 법** (Sonnet 중간으로 진행하고 싶을 때):
  ① marketConfig.ts + types + portfolioMath → ② PortfolioView + 등록/거래 다이얼로그 → ③ 나머지 화면들.
  범위가 좁을수록 모델 등급보다 지시 단위가 성공률을 좌우한다.
- 각 단계 시작 전, Claude는 현재 세션 모델이 위 권장과 다르면 **작업 착수 전에 사용자에게
  모델 변경을 권고할 것** (예: "이 단계는 Opus급 권장인데 현재 Sonnet입니다. 진행할까요?").
- 안전망: 단계 종료 조건인 `vue-tsc` 통과 + 화면 값 불변 검증은 모델과 무관하게 항상 수행.

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
