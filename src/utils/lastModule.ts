const KEY = 'fp-last-module'

export type ModuleId = 'asset' | 'budget'

// 계정 단위로 기록한다. 예전에는 모듈 이름만 저장했는데, 한 기기에서 계정을 갈아타면
// 이전 계정의 기록이 그대로 적용돼 엉뚱한 모듈로 진입했다(신규 가입도 마찬가지).
// 저장된 사용자와 지금 로그인한 사용자가 다르면 기록이 없는 것으로 본다 → 허브로 간다.
type Stored = { userId: string; module: ModuleId }

const read = (): Stored | null => {
  const raw = localStorage.getItem(KEY)
  if (raw === null) return null
  try {
    const v = JSON.parse(raw) as Partial<Stored>
    if (typeof v?.userId !== 'string') return null
    return v.module === 'asset' || v.module === 'budget'
      ? { userId: v.userId, module: v.module }
      : null
  } catch {
    // 계정 단위로 바꾸기 전의 옛 형식(모듈 이름 문자열)은 누구 것인지 알 수 없어 버린다
    return null
  }
}

export const getLastModule = (userId: string): ModuleId | null => {
  const stored = read()
  return stored !== null && stored.userId === userId ? stored.module : null
}

export const setLastModule = (userId: string, module: ModuleId) => {
  localStorage.setItem(KEY, JSON.stringify({ userId, module } satisfies Stored))
}
