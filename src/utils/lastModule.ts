const KEY = 'fp-last-module'

export type ModuleId = 'asset' | 'budget'

export const getLastModule = (): ModuleId | null => {
  const v = localStorage.getItem(KEY)
  return v === 'asset' || v === 'budget' ? v : null
}

export const setLastModule = (m: ModuleId) => {
  localStorage.setItem(KEY, m)
}

// 기기 단위 기록이라 같은 기기에서 새 계정을 만들면 이전 계정의 기록이 그대로 적용된다.
// 신규 가입 계정은 이력이 없는 게 맞으므로 지워서 허브로 보낸다.
export const clearLastModule = () => {
  localStorage.removeItem(KEY)
}
