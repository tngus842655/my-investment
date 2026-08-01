import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update'

/**
 * 안드로이드 앱 업데이트 안내.
 *
 * 최신 버전 번호를 우리가 따로 관리하지 않고 플레이 In-App Updates API가 직접 판정한다.
 * 그래서 .aab를 새로 올린 뒤 웹을 다시 배포하거나 어딘가의 값을 고칠 필요가 없고,
 * 심사가 끝나 실제로 내려받을 수 있게 된 시점부터만 안내가 뜬다.
 *
 * ⚠️ 플레이스토어를 통해 설치된 빌드에서만 동작한다. 로컬 디버그 빌드나 사이드로드
 * 설치본에서는 조회가 실패하므로 안내가 뜨지 않는다 (실기기 확인은 테스트 트랙에서 할 것).
 */

/** 안내를 미룬 기록. `{ build, ts }` 형태로 저장한다. */
const SNOOZE_KEY = 'fp-app-update-snoozed'
const SNOOZE_MS = 24 * 60 * 60 * 1000

const isSnoozed = (build: string) => {
  const raw = localStorage.getItem(SNOOZE_KEY)
  if (!raw) return false
  try {
    const { build: snoozedBuild, ts } = JSON.parse(raw) as { build: string; ts: number }
    return snoozedBuild === build && Date.now() - ts < SNOOZE_MS
  } catch {
    return false
  }
}

/**
 * 안내할 업데이트가 있으면 그 버전의 versionCode를, 없으면 null을 반환한다.
 *
 * 반환값은 화면에 노출하지 않고 스누즈 대상을 구분하는 데만 쓴다. 안드로이드는
 * 새 버전의 versionName을 주지 않아서(`availableVersionName`은 iOS 전용) 보여줄 만한
 * 버전 표기가 없기 때문이다.
 */
export const getAppUpdateBuild = async (): Promise<string | null> => {
  try {
    const info = await AppUpdate.getAppUpdateInfo()
    if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) return null
    const build = info.availableVersionCode ?? ''
    return isSnoozed(build) ? null : build
  } catch {
    // 플레이스토어가 없는 기기나 스토어를 거치지 않은 설치본에서는 조회 자체가 실패한다.
    // 안내를 못 할 뿐 앱 동작에는 지장이 없으므로 조용히 넘긴다.
    return null
  }
}

/** 같은 버전은 24시간 동안 다시 묻지 않는다. 그 사이 더 새 버전이 올라오면 기다리지 않고 다시 안내한다. */
export const snoozeAppUpdate = (build: string) => {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify({ build, ts: Date.now() }))
}

/** 플레이스토어의 이 앱 페이지를 연다. 패키지명은 플러그인이 현재 앱 것으로 채운다. */
export const openAppStore = () => AppUpdate.openAppStore()
