// 시장/통화별 상수의 단일 소스 (GLOBALIZATION.md 단계 A 참고)
// 국가 추가 = 이 파일에 항목 추가 + DB CHECK 제약 수정. 그 외 코드는 이 설정만 참조할 것.

import { i18n } from '@/plugins/i18n'

export type MarketCode = 'KR' | 'US' | 'JP' | 'CN'
export type AssetClass = 'stock' | 'etf' | 'crypto' | 'cash'
export type CurrencyCode = 'KRW' | 'USD' | 'JPY' | 'CNY'
export type LocaleCode = 'ko' | 'en' | 'ja' | 'zh'

interface MarketInfo {
  currency: CurrencyCode
  // Yahoo Finance 심볼 서픽스. 순서대로 시도 (KR: KOSPI 실패 시 KOSDAQ 재시도)
  yahooSuffixes: string[]
  // 티커 형식 판별 (예: 한국 6자리 숫자). 시장 미지정 데이터의 추론용
  tickerPattern: RegExp | null
  label: Record<LocaleCode, string>
}

export const MARKETS: Record<MarketCode, MarketInfo> = {
  KR: {
    currency: 'KRW',
    yahooSuffixes: ['.KS', '.KQ'],
    tickerPattern: /^\d{6}$/,
    label: { ko: '한국', en: 'Korea', ja: '韓国', zh: '韩国' },
  },
  US: {
    currency: 'USD',
    yahooSuffixes: [],
    tickerPattern: null,
    label: { ko: '미국', en: 'US', ja: '米国', zh: '美国' },
  },
  JP: {
    currency: 'JPY',
    yahooSuffixes: ['.T'],
    tickerPattern: /^\d{4}$/,
    label: { ko: '일본', en: 'Japan', ja: '日本', zh: '日本' },
  },
  CN: {
    currency: 'CNY',
    yahooSuffixes: ['.SS', '.SZ'],
    tickerPattern: /^\d{6}$/,
    label: { ko: '중국', en: 'China', ja: '中国', zh: '中国' },
  },
}

// 1차 오픈 대상 시장 (JP/CN은 설정만 준비, UI 노출은 여기에 추가되는 시점부터)
export const ACTIVE_MARKETS: MarketCode[] = ['KR', 'US']

// 로케일별 기본 통화 (화면설정에서 언어 변경 시 표시통화 자동 전환에 사용)
export const LOCALE_CURRENCY: Partial<Record<LocaleCode, CurrencyCode>> = {
  ko: 'KRW', en: 'USD',
}

interface CurrencyInfo {
  symbol: string
  // 소수점 자릿수 (표시용 기본값)
  decimals: number
  label: Record<LocaleCode, string>
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  KRW: { symbol: '₩', decimals: 0, label: { ko: '원', en: 'KRW', ja: 'ウォン', zh: '韩元' } },
  USD: { symbol: '$', decimals: 2, label: { ko: '달러', en: 'USD', ja: 'ドル', zh: '美元' } },
  JPY: { symbol: '¥', decimals: 0, label: { ko: '엔', en: 'JPY', ja: '円', zh: '日元' } },
  CNY: { symbol: '¥', decimals: 2, label: { ko: '위안', en: 'CNY', ja: '元', zh: '元' } },
}

export const ASSET_CLASSES: Record<AssetClass, { label: Record<LocaleCode, string> }> = {
  stock: { label: { ko: '주식', en: 'Stock', ja: '株式', zh: '股票' } },
  etf: { label: { ko: 'ETF', en: 'ETF', ja: 'ETF', zh: 'ETF' } },
  crypto: { label: { ko: '암호화폐', en: 'Crypto', ja: '暗号資産', zh: '加密货币' } },
  cash: { label: { ko: '현금', en: 'Cash', ja: '現金', zh: '现金' } },
}

// 새 체계(asset_class/market) → 한글 자산유형 라벨. 화면 표시·테마 색상 키가 아직 한글
// 자산유형 기준이라 접근자로 재구성한다 (DB asset_type 컬럼과는 무관 — 컬럼은 사용자 단계 6로 제거됨).
// 주의: 이 값은 테마 typeColors 팔레트 키로도 쓰이는 내부 식별자라 로케일과 무관하게 한글 고정.
// 화면 표시용 문자열이 필요하면 displayAssetType()으로 감싸서 쓸 것.
export const classMarketToAssetType = (assetClass: AssetClass, market: MarketCode | null): string => {
  switch (assetClass) {
    case 'stock':
      return market === 'KR' ? '국내주식' : '해외주식'
    case 'etf':
      return 'ETF'
    case 'crypto':
      return '암호화폐'
    case 'cash':
      return '현금'
  }
}

// classMarketToAssetType()의 내부 한글 키를 현재 로케일 표시용 문자열로 변환
export const displayAssetType = (assetType: string): string =>
  assetType ? i18n.global.t(`assetType.${assetType}`) : ''

// ── 접근자: DB 행에서 자산군/시장 읽기 ─────────────────────────
// portfolios.asset_class(NOT NULL) / market(crypto·cash는 NULL) 컬럼을 읽는다.
// 분기 코드는 한글 라벨을 직접 비교하지 말고 반드시 이 접근자를 쓸 것.

export interface ClassifiableItem {
  asset_class?: AssetClass | null
  market?: MarketCode | null
  currency?: string
}

export const getAssetClass = (item: ClassifiableItem): AssetClass => item.asset_class ?? 'stock'

export const getMarket = (item: ClassifiableItem): MarketCode | null => item.market ?? null

export const isCash = (item: ClassifiableItem): boolean => getAssetClass(item) === 'cash'
export const isCrypto = (item: ClassifiableItem): boolean => getAssetClass(item) === 'crypto'
