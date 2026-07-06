import { ref } from 'vue'

// 서비스홈 화면을 벗어났다 뒤로가기로 돌아와도 펼침 상태가 유지되도록 모듈 스코프에 보관
export const serviceMenuOpen = ref(false)
export const settingsMenuOpen = ref(false)
