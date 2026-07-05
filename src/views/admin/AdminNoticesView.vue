<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { isAdminEmail } from '@/config/admin'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
const loading = ref(true)
const isAdmin = ref(false)

interface Notice {
  id: string
  title: string
  content: string
  is_test: boolean
  created_at: string
  updated_at: string
}

const notices = ref<Notice[]>([])

const editDialog = ref(false)
const editTarget = ref<Notice | null>(null)
const titleDraft = ref('')
const contentDraft = ref('')
const isTestDraft = ref(false)
const saving = ref(false)

const deleteDialog = ref(false)
const deleteTarget = ref<Notice | null>(null)
const deleteLoading = ref(false)

const expandedId = ref<string | null>(null)

const KST = 'Asia/Seoul'
const formatDate = (iso: string) => {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}.${get('month')}.${get('day')} (${get('hour')}:${get('minute')})`
}

const loadNotices = async () => {
  const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false })
  notices.value = data ?? []
}

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) {
    router.replace('/dashboard')
    return
  }
  isAdmin.value = true
  await loadNotices()
  loading.value = false
})

const openCreateDialog = () => {
  editTarget.value = null
  titleDraft.value = ''
  contentDraft.value = ''
  isTestDraft.value = false
  editDialog.value = true
}

const openEditDialog = (n: Notice) => {
  editTarget.value = n
  titleDraft.value = n.title
  contentDraft.value = n.content
  isTestDraft.value = n.is_test
  editDialog.value = true
}

const saveNotice = async () => {
  const title = titleDraft.value.trim()
  const content = contentDraft.value.trim()
  if (!title || !content) return
  saving.value = true
  try {
    if (editTarget.value) {
      const { error } = await supabase
        .from('notices')
        .update({ title, content, is_test: isTestDraft.value, updated_at: new Date().toISOString() })
        .eq('id', editTarget.value.id)
      if (error) throw error
      showMessage('공지사항이 수정되었습니다.', 'success')
    } else {
      const { error } = await supabase.from('notices').insert({ title, content, is_test: isTestDraft.value })
      if (error) throw error
      showMessage(isTestDraft.value ? '테스트 공지가 등록되었습니다. (관리자만 확인 가능)' : '공지사항이 등록되었습니다.', 'success')
    }
    editDialog.value = false
    await loadNotices()
  } catch {
    showMessage('저장 중 오류가 발생했습니다.', 'error')
  } finally {
    saving.value = false
  }
}

const confirmDelete = (n: Notice) => {
  deleteTarget.value = n
  deleteDialog.value = true
}

const deleteNotice = async () => {
  if (!deleteTarget.value || deleteLoading.value) return
  deleteLoading.value = true
  try {
    const { error } = await supabase.from('notices').delete().eq('id', deleteTarget.value.id)
    if (error) { showMessage('삭제 실패', 'error'); return }
    notices.value = notices.value.filter(n => n.id !== deleteTarget.value!.id)
    deleteDialog.value = false
    showMessage('삭제되었습니다.', 'success')
  } finally {
    deleteLoading.value = false
  }
}

const toggleExpand = (n: Notice) => {
  expandedId.value = expandedId.value === n.id ? null : n.id
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 700px">
    <div class="d-flex align-center ga-3 mb-4">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="font-weight-bold">공지사항 관리</div>
        <div class="text-medium-emphasis">전체 회원에게 노출되는 공지 작성</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader v-for="i in 3" :key="i" type="card" class="mb-3 rounded-xl" />
    </template>

    <template v-else-if="isAdmin">
      <v-btn color="primary" variant="tonal" rounded="lg" block prepend-icon="mdi-plus" class="mb-4" @click="openCreateDialog">
        새 공지 작성
      </v-btn>

      <div v-if="notices.length === 0" class="glass-card pa-6 text-center text-medium-emphasis">
        <v-icon size="40" class="mb-2" style="opacity:0.3">mdi-bullhorn-outline</v-icon>
        <div>등록된 공지사항이 없습니다</div>
      </div>

      <div v-else class="d-flex flex-column ga-3">
        <div v-for="n in notices" :key="n.id" class="notice-card">
          <div class="d-flex align-center ga-2 mb-2">
            <span class="date-text">{{ formatDate(n.created_at) }}</span>
            <v-spacer />
            <button class="icon-btn" @click.stop="openEditDialog(n)">
              <v-icon size="16">mdi-pencil-outline</v-icon>
            </button>
            <button class="icon-btn" @click.stop="confirmDelete(n)">
              <v-icon size="16" color="error">mdi-trash-can-outline</v-icon>
            </button>
          </div>
          <div class="d-flex align-center ga-1 cursor-pointer" @click="toggleExpand(n)">
            <v-chip v-if="n.is_test" size="x-small" color="warning" variant="tonal">테스트</v-chip>
            <span class="title-text">{{ n.title }}</span>
            <v-icon
              size="16"
              style="opacity:0.4; transition: transform 0.2s; flex-shrink:0"
              :style="expandedId === n.id ? 'transform:rotate(180deg)' : ''"
            >mdi-chevron-down</v-icon>
          </div>
          <div v-if="expandedId === n.id" class="content-box mt-2">
            <div style="white-space:pre-wrap; line-height:1.7">{{ n.content }}</div>
          </div>
        </div>
      </div>
    </template>
  </v-container>

  <!-- 작성/수정 다이얼로그 -->
  <v-dialog v-model="editDialog" max-width="420">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="font-weight-bold pt-4 px-4">
        {{ editTarget ? '공지사항 수정' : '새 공지 작성' }}
      </v-card-title>
      <v-card-text class="px-4 pb-2">
        <v-text-field
          v-model="titleDraft"
          label="제목"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          class="mb-3"
          maxlength="100"
        />
        <textarea
          v-model="contentDraft"
          class="content-textarea"
          placeholder="공지 내용을 입력하세요."
          rows="6"
        />
        <div class="toggle-row mt-3">
          <div>
            <div class="toggle-row-label">테스트 공지</div>
            <div class="toggle-row-sub">체크하면 관리자만 확인 가능 (실제 사용자에게 노출 안 됨)</div>
          </div>
          <button
            type="button"
            class="toggle-switch"
            :class="{ 'toggle-switch-active': isTestDraft }"
            @click="isTestDraft = !isTestDraft"
          >
            <span class="toggle-switch-thumb" />
          </button>
        </div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4 ga-2">
        <v-btn variant="tonal" rounded="lg" block :disabled="saving" @click="editDialog = false">취소</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          rounded="lg"
          block
          :loading="saving"
          :disabled="!titleDraft.trim() || !contentDraft.trim()"
          @click="saveNotice"
        >{{ editTarget ? '수정' : '등록' }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- 삭제 확인 -->
  <v-dialog v-model="deleteDialog" max-width="300">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-5 text-error">삭제 확인</v-card-title>
      <v-card-text class="text-center text-medium-emphasis">
        이 공지사항을 삭제하시겠습니까?<br>복구할 수 없습니다.
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn variant="text" block :disabled="deleteLoading" @click="deleteDialog = false">취소</v-btn>
        <v-btn color="error" block :loading="deleteLoading" @click="deleteNotice">삭제</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.back-btn {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.back-btn:active { opacity: 0.6; }

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 20px;
}

.glass-dialog {
  background: var(--fp-surface) !important;
  border: 1px solid var(--fp-outline) !important;
}

.notice-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  padding: 14px 16px;
}

.date-text {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.icon-btn {
  background: none;
  border: none;
  padding: 2px 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.icon-btn:active { opacity: 0.4; }

.title-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.cursor-pointer { cursor: pointer; }

.content-box {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.content-textarea {
  width: 100%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
  padding: 8px 10px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.875rem;
  line-height: 1.6;
  resize: none;
  outline: none;
  caret-color: rgb(var(--v-theme-primary));
}
.content-textarea::placeholder { color: rgba(var(--v-theme-on-surface), 0.35); }

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.toggle-row-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
.toggle-row-sub {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-top: 1px;
}
.toggle-switch {
  position: relative;
  width: 40px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 20px;
  background: rgba(var(--v-theme-on-surface), 0.15);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s ease;
}
.toggle-switch-active {
  background: rgb(var(--v-theme-primary));
}
.toggle-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease;
}
.toggle-switch-active .toggle-switch-thumb {
  transform: translateX(18px);
}
</style>
