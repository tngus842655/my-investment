# ADD_LOCALE.md — 새 국가·언어·통화 추가 가이드

Fire Path에 새 국가/언어/통화를 추가할 때 손대야 하는 곳 체크리스트.
1차 오픈은 **한국(ko/KRW/KR) + 미국(en/USD/US)** 이고, 구조는 **일본(ja/JPY/JP)·중국(zh/CNY/CN)을
테이블 변경 없이(또는 CHECK 제약만 수정) 추가**할 수 있게 짜여 있다.

설계 배경·전체 히스토리는 **GLOBALIZATION.md** 참고. 이 문서는 "이제 추가할 때 뭘 건드리나"만 정리한다.

> **핵심 안전망**: 시장/통화/자산군 라벨은 전부 `Record<LocaleCode, string>` 타입이다.
> `marketConfig.ts`의 `LocaleCode`에 새 언어를 추가하면 **라벨이 빠진 모든 곳에서 컴파일 에러**가 나므로,
> `vue-tsc --build`만 통과시키면 라벨 누락은 원천 차단된다. 아래 순서대로 진행하고 마지막에 타입체크할 것.

---

## 1. 무엇을 추가하나 (조합)

보통 "국가 하나 추가"는 세 축이 함께 붙는다. 필요한 축만 골라 진행한다.

| 축 | 예 (일본) | 타입 위치 (`src/config/marketConfig.ts`) |
| --- | --- | --- |
| market (시장) | `JP` | `MarketCode` |
| currency (통화) | `JPY` | `CurrencyCode` |
| locale (언어) | `ja` | `LocaleCode` |

JPY/CNY, JP/CN, 은 이미 타입·상수·DB에 부분적으로 준비돼 있다(아래 "이미 준비된 것" 참고).

---

## 2. DB (Supabase SQL Editor)

새 마이그레이션 파일(`supabase/migrations/`)로도 남길 것.

1. **통화 enum** — 새 통화면:
   ```sql
   ALTER TYPE currency_enum ADD VALUE IF NOT EXISTS 'JPY'; -- 트랜잭션 밖에서 한 줄씩
   ```
   (JPY/CNY는 2026-07-10 사용자 단계 1에서 이미 추가됨.)
2. **market CHECK** — `KR|US|JP|CN` 밖의 새 시장이면 `portfolios.market` CHECK 제약 수정.
   (JP/CN은 이미 CHECK에 포함.)
3. **locale CHECK** — `ko|en|ja|zh` 밖의 새 언어면 `investment_goals.locale` CHECK 제약 수정.
   (ja/zh는 이미 CHECK에 포함.)

즉 **일본/중국은 DB 변경이 사실상 없다.** 완전히 새로운 5번째 국가일 때만 위 CHECK를 손댄다.

---

## 3. 프론트 단일 소스 — `src/config/marketConfig.ts`

여기부터가 실제 작업의 대부분. 국가 추가 = 이 파일에 항목 추가.

1. `MarketCode` / `CurrencyCode` / `LocaleCode` 타입에 새 코드 추가 (해당 축만).
2. `MARKETS` — 새 시장 엔트리: `currency`, `yahooSuffixes`(야후 심볼 서픽스, 순서대로 시도),
   `tickerPattern`(티커 형식 정규식 or null), `label`(**모든 LocaleCode** 키).
3. `ACTIVE_MARKETS` — 새 시장을 UI에 **노출하려면** 여기 배열에 코드 추가. (넣기 전까진 설정만 준비된 상태.)
4. `LOCALE_CURRENCY` — 새 언어 → 기본 통화 매핑. 화면설정에서 **언어 변경 시 표시통화 자동 전환**에 쓰인다
   (예: `ja: 'JPY'`). 안 넣으면 그 언어로 바꿔도 통화는 안 따라 바뀜.
5. `CURRENCIES` — 새 통화 엔트리: `symbol`, `decimals`, `label`(모든 LocaleCode).
6. `ASSET_CLASSES` — 4개 자산군(stock/etf/crypto/cash) 각 `label`에 새 로케일 키 추가.
   (`LocaleCode` 확장 시 타입 에러로 강제됨.)

> `getAssetClass`/`getMarket`/`isCash`/`isCrypto` 접근자와 `classMarketToAssetType`(표시 라벨)은
> 새 코드가 들어가도 그대로 동작한다. 손댈 필요 없음.

---

## 4. i18n (언어를 추가할 때만)

1. `src/locales/<lang>.json` 생성 — `en.json`을 복사해 구조 유지한 채 번역.
   (네임스페이스 키는 그대로 두고 값만 번역. 누락 키는 `fallbackLocale: 'ko'`로 폴백됨.)
2. `src/plugins/i18n.ts`:
   - `import <lang> from '@/locales/<lang>.json'`
   - `SUPPORTED_LOCALES` 배열에 코드 추가
   - `SupportedLocale` 타입(`Extract<LocaleCode, 'ko' | 'en'>`)에 코드 추가
   - `messages: { ko, en, <lang> }`에 추가
3. `src/views/shared/DisplaySettingsView.vue` — `languageOptions` 배열에 `{ value, label }` 추가
   (현재 ko/en 2개 하드코딩).

**관리자 작성 콘텐츠는 번역하지 않는다**(정책 확정): 공지사항·개발자 노트·개인정보처리방침 본문은
한글 원문 그대로 모든 로케일에 노출. 자동번역 API는 도입 안 함. (배경은 GLOBALIZATION.md 참고.)

---

## 5. 통화를 추가할 때만 (표시통화 선택 UI)

`src/views/shared/DisplaySettingsView.vue`의 `currencyOptions`는 현재 **KRW/USD 2개 버튼 하드코딩**이다.
세 번째 통화를 표시통화로 고를 수 있게 하려면 여기에 버튼을 추가해야 한다.
(원래 자산 저장 단위인 `base_currency` 선택은 목표 설정 화면에 별도로 있고, 그쪽도 통화 선택지 확인 필요.)

금액 포맷(`src/utils/numberFormat.ts` `formatMoneyIn`)은 **KRW만 억/만 단위 특수 처리**이고
그 외 통화는 `Intl` 통화 포맷으로 자동 처리된다 → JPY/CNY는 `¥1,234,567` 형태로 **코드 수정 없이** 나온다.
새 통화에 억/만 같은 자국식 축약이 필요하면 그때만 `formatMoneyIn`에 분기 추가.

---

## 6. 환율

`src/services/exchangeRateCache.ts`는 **USD 허브**(A→B = A→USD × USD→B) + 1시간 캐시 구조라
새 통화쌍이 자동으로 지원된다. 단 **`exchange-rate` Edge Function이 USD/신통화 환율을 반환해야** 한다 —
새 통화 추가 시 이 API가 해당 통화를 지원하는지만 확인.

---

## 7. Edge Function (새 시장을 추가할 때만)

`stock-price` / `etf-info` / `etf-backtest` / `etf-dividend`는 야후 심볼 서픽스 맵을 **각 함수 안에 자체 보유**한다
(`marketConfig.MARKETS`와 동일 값이지만 별도 복사본). 상세는 **EDGE_FUNCTIONS.md** 참고.

- KR/US/JP/CN 서픽스는 이미 반영돼 있음 → 일본/중국은 Edge Function 수정 불필요.
- 완전히 새로운 시장이면 4개 함수의 서픽스 맵에 추가 후 **Supabase 재배포** 필요.

---

## 8. 티커 표시명 (선택)

`src/utils/tickerNames.ts`는 ko만 한글 매핑을 갖고, 그 외 로케일은 **티커 원문 폴백**이다.
새 시장 종목의 이름 자동완성(등록 다이얼로그의 `KR_STOCK_NAMES`/`KR_ETF_NAMES` 류)은 현재 한국 시장 전용 —
새 시장 종목은 미국처럼 텍스트 직접 입력이 기본이다. 이름 자동완성까지 원하면 해당 시장 이름 데이터를 추가.

---

## 9. 마무리 검증

```bash
./node_modules/.bin/vue-tsc --build   # 라벨/타입 누락은 여기서 전부 잡힘 (--noEmit 단독 금지)
npm run build
```

라벨 누락·타입 에러 0을 확인한 뒤, 실제 언어·통화 전환은 로그인해서 사용자가 직접 확인
(CLAUDE.md 지침상 스크린샷 자동화는 금지).

---

## 이미 준비된 것 (일본/중국 기준)

- DB: `currency_enum`에 JPY/CNY 있음, `market` CHECK에 JP/CN 있음, `locale` CHECK에 ja/zh 있음.
- `marketConfig.ts`: `MarketCode`/`CurrencyCode`/`LocaleCode`에 JP·CN·JPY·CNY·ja·zh 있음,
  `MARKETS`/`CURRENCIES`/`ASSET_CLASSES` 라벨에 ja/zh 값 있음, JP/CN 시장 엔트리(서픽스·패턴) 있음.
- Edge Function: JP(`.T`)/CN(`.SS`/`.SZ`) 서픽스 반영됨.

**즉 일본/중국을 켜려면 실질적으로**: `ACTIVE_MARKETS`에 시장 추가 + `LOCALE_CURRENCY`에 언어→통화 추가
+ `src/locales/ja.json`(또는 zh) 작성 + `i18n.ts`/`DisplaySettingsView` 언어·통화 선택지 추가 정도.
DB 구조 변경은 없다.
