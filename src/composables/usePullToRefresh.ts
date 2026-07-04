import { ref } from 'vue'

type RefreshHandler = () => Promise<unknown> | unknown

// 현재 화면(탭)이 등록한 새로고침 함수. 화면당 최대 1개만 유지된다.
export const activeRefreshHandler = ref<RefreshHandler | null>(null)

export const useRegisterPullToRefresh = (handler: RefreshHandler) => {
  activeRefreshHandler.value = handler
}

export const clearPullToRefresh = () => {
  activeRefreshHandler.value = null
}
