import { i18n } from '@/plugins/i18n'

// 계좌 미지정 sentinel — DB에는 로케일과 무관하게 항상 '미지정'으로 저장한다.
// (로케일별 문자열로 저장하면 언어 전환 시 같은 계좌가 둘로 갈라짐)
export const UNASSIGNED_ACCOUNT = '미지정'

// 표시용: sentinel만 현재 로케일 라벨로 번역, 사용자가 입력한 계좌명은 그대로
export const displayAccountName = (name: string): string =>
  name === UNASSIGNED_ACCOUNT ? i18n.global.t('dialog.accountUnassigned') : name

// 입력값 → 저장값: 빈 값이거나 현재 로케일의 '미지정' 라벨이면 sentinel로 정규화
export const normalizeAccountName = (input: string): string => {
  const v = input.trim()
  return v === '' || v === i18n.global.t('dialog.accountUnassigned') ? UNASSIGNED_ACCOUNT : v
}
