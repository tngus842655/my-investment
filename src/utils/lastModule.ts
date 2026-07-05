const KEY = 'fp-last-module'

export type ModuleId = 'asset' | 'budget'

export const getLastModule = (): ModuleId | null => {
  const v = localStorage.getItem(KEY)
  return v === 'asset' || v === 'budget' ? v : null
}

export const setLastModule = (m: ModuleId) => {
  localStorage.setItem(KEY, m)
}
