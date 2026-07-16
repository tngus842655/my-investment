// 홈 화면에 추가된 앱(standalone 디스플레이 모드) 컨텍스트인지 여부
export const isStandaloneDisplay = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
