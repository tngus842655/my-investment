<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useUserDataStore } from '@/stores/userData'

const router = useRouter()
const userDataStore = useUserDataStore()
const confirmDialog = ref(false)

const logout = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    showMessage('로그아웃 중 오류가 발생했습니다.', 'error')
    return
  }
  userDataStore.reset()
  router.replace('/')
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="d-flex align-center ga-2 mb-6">
      <img src="/icons/icon-more.png" class="header-icon" alt="더보기" />
      <div>
        <div class="font-weight-bold">더보기</div>
        <div class="text-medium-emphasis">가계부 설정 및 계정 관리</div>
      </div>
    </div>

    <div class="section-label mb-2">다른 서비스</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/hub')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-view-grid-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">서비스 홈</div>
          <div class="text-medium-emphasis">자산관리·가계부 전환</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <div class="section-label mb-2">가계부</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/search')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-magnify</v-icon></div>
        <div>
          <div class="font-weight-medium">내역 검색</div>
          <div class="text-medium-emphasis">메모·카테고리로 내역 찾기</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/manage')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-cog-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">관리</div>
          <div class="text-medium-emphasis">카테고리·결제수단·즐겨찾기 관리</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/import')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-file-excel-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">엑셀 가져오기</div>
          <div class="text-medium-emphasis">엑셀 파일로 과거 내역 일괄 등록</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <div class="section-label mb-2">서비스</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/notices')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-bullhorn-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">공지사항</div>
          <div class="text-medium-emphasis">서비스 관련 안내 및 공지를 확인하세요.</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/feedback')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-message-text-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">의견 관리</div>
          <div class="text-medium-emphasis">불편한 점이나 개선 아이디어를 보내주세요.</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/release-notes')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-notebook-edit-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">개발자 노트</div>
          <div class="text-medium-emphasis">업데이트 내역을 확인하세요.</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <div class="section-label mb-2">설정</div>
    <div class="d-flex flex-column ga-2 mb-5">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/change-password')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-lock-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">비밀번호 변경</div>
          <div class="text-medium-emphasis">계정 비밀번호를 변경합니다</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>

      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="router.push('/budget/display-settings')">
        <div class="menu-icon"><v-icon size="18" color="primary">mdi-palette-outline</v-icon></div>
        <div>
          <div class="font-weight-medium">화면 설정</div>
          <div class="text-medium-emphasis">테마·글자 크기 조절</div>
        </div>
        <v-spacer />
        <v-icon size="16" class="chevron-icon">mdi-chevron-right</v-icon>
      </div>
    </div>

    <div class="section-label mb-2">계정</div>
    <div class="d-flex flex-column ga-2">
      <div class="menu-card glass-card pa-4 d-flex align-center ga-3" @click="confirmDialog = true">
        <div class="menu-icon menu-icon-error"><v-icon size="18" color="error">mdi-logout</v-icon></div>
        <div class="font-weight-medium text-error">로그아웃</div>
      </div>
    </div>

    <v-dialog v-model="confirmDialog" max-width="360">
      <v-card rounded="xl" class="glass-dialog">
        <v-card-title class="text-center pt-6">로그아웃</v-card-title>
        <v-card-text class="text-center text-medium-emphasis">정말 로그아웃 하시겠습니까?</v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-btn variant="text" block @click="confirmDialog = false">취소</v-btn>
          <v-btn color="error" block @click="logout">로그아웃</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.header-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.section-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
  padding: 0 4px;
}

.glass-card {
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
  border-radius: 20px;
}

.menu-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-icon-error {
  background: rgba(var(--v-theme-error), 0.1);
}

.menu-card {
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.menu-card:active {
  opacity: 0.7;
}

.chevron-icon {
  color: rgba(var(--v-theme-on-surface), 0.3);
}

.glass-dialog {
  background: var(--fp-surface) !important;
  border: 1px solid var(--fp-outline) !important;
}
</style>
