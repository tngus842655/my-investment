import { isKoLocale } from '@/plugins/i18n'

// 최초 가계부 진입 시 한 번 시딩되는 기본 결제수단.
// 이름은 DB에 사용자 데이터로 저장되므로 시딩 시점의 로케일에 맞는 문자열을 넣는다.
export const getDefaultBudgetPaymentMethods = () => (isKoLocale() ? ['현금', '카드'] : ['Cash', 'Card'])
