<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { ADMIN_EMAIL } from '@/config/admin'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()
const loading = ref(true)
const isAdmin = ref(false)

interface Feedback {
  id: string
  email: string
  category: string
  title: string
  content: string
  created_at: string
  status: 'NEW' | 'CHECKED' | 'DONE'
}

const feedbacks = ref<Feedback[]>([])
const searchQuery = ref('')
const categoryFilter = ref<string | null>(null)
const expandedId = ref<string | null>(null)
const deleteDialog = ref(false)
const deleteTarget = ref<Feedback | null>(null)
const deleteLoading = ref(false)

const categories = ['버그신고', '기능제안', '기타의견']

const statusColor: Record<string, string> = {
  NEW: 'error',
  CHECKED: 'warning',
  DONE: 'success',
}

const statusLabel: Record<string, string> = {
  NEW: '미확인',
  CHECKED: '확인',
  DONE: '완료',
}

const filtered = computed(() => {
  let list = feedbacks.value
  if (categoryFilter.value) list = list.filter(f => f.category.trim() === categoryFilter.value!.trim())
  const q = searchQuery.value.trim().toLowerCase()
  if (q) list = list.filter(f => f.email.toLowerCase().includes(q) || f.title.toLowerCase().includes(q))
  return list
})

const toggleCategory = (cat: string) => {
  categoryFilter.value = categoryFilter.value === cat ? null : cat
}

const toggleExpand = (id: string) => {
  expandedId.value = expandedId.value === id ? null : id
}

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

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    router.replace('/dashboard')
    return
  }
  isAdmin.value = true
  await loadFeedbacks()
  loading.value = false
})

const loadFeedbacks = async () => {
  const { data } = await supabase.from('feedback').select('*').order('created_at', { ascending: false })
  feedbacks.value = data ?? []
}

const updateStatus = async (id: string, status: string) => {
  const { error } = await supabase.from('feedback').update({ status }).eq('id', id)
  if (error) { showMessage('상태 변경 실패', 'error'); return }
  feedbacks.value = feedbacks.value.map(f => f.id === id ? { ...f, status: status as Feedback['status'] } : f)
}

const confirmDelete = (f: Feedback) => {
  deleteTarget.value = f
  deleteDialog.value = true
}

const deleteFeedback = async () => {
  if (!deleteTarget.value || deleteLoading.value) return
  deleteLoading.value = true
  try {
    const { error } = await supabase.from('feedback').delete().eq('id', deleteTarget.value.id)
    if (error) { showMessage('삭제 실패', 'error'); return }
    feedbacks.value = feedbacks.value.filter(f => f.id !== deleteTarget.value!.id)
    if (expandedId.value === deleteTarget.value.id) expandedId.value = null
    deleteDialog.value = false
    showMessage('삭제되었습니다.', 'success')
  } finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 700px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="text-h5 font-weight-bold">사용자 의견</div>
        <div class="text-body-2 text-medium-emphasis">접수된 피드백 관리</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader v-for="i in 3" :key="i" type="card" class="mb-3 rounded-xl" />
    </template>

    <template v-else-if="isAdmin">
      <!-- 검색 + 필터 -->
      <div class="d-flex ga-2 mb-4 flex-wrap align-center">
        <v-text-field
          v-model="searchQuery"
          placeholder="이메일 · 제목 검색"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          rounded="lg"
          hide-details
          style="min-width: 180px; flex: 1"
        />
        <div class="d-flex ga-1">
          <button
            v-for="cat in categories"
            :key="cat"
            class="filter-btn"
            :class="{ 'filter-btn--active': categoryFilter === cat }"
            @click="toggleCategory(cat)"
          >{{ cat }}</button>
        </div>
      </div>

      <!-- 빈 상태 -->
      <div v-if="filtered.length === 0" class="glass-card pa-6 text-center text-medium-emphasis">
        <v-icon size="40" class="mb-2" style="opacity:0.3">mdi-inbox-outline</v-icon>
        <div class="text-body-2">표시할 의견이 없습니다</div>
      </div>

      <!-- 카드 목록 -->
      <div v-else class="d-flex flex-column ga-3">
        <div v-for="f in filtered" :key="f.id" class="feedback-card">
          <!-- 상단 행: 상태 + 카테고리 + 날짜 + 삭제 -->
          <div class="d-flex align-center ga-2 mb-2">
            <v-chip size="x-small" color="primary" variant="outlined">{{ f.category }}</v-chip>
            <v-chip size="x-small" :color="statusColor[f.status]" variant="tonal">
              {{ statusLabel[f.status] }}
            </v-chip>
            <v-spacer />
            <span class="date-text">{{ formatDate(f.created_at) }}</span>
            <button class="delete-btn" @click.stop="confirmDelete(f)">
              <v-icon size="16" color="error">mdi-trash-can-outline</v-icon>
            </button>
          </div>

          <!-- 제목 + 펼치기 -->
          <div class="d-flex align-center ga-1 mb-1 cursor-pointer" @click="toggleExpand(f.id)">
            <span class="title-text">{{ f.title }}</span>
            <v-icon size="16" style="opacity:0.4; transition: transform 0.2s" :style="expandedId === f.id ? 'transform:rotate(180deg)' : ''">
              mdi-chevron-down
            </v-icon>
          </div>

          <!-- 이메일 -->
          <div class="email-text mb-3">{{ f.email }}</div>

          <!-- 내용 (펼침) -->
          <div v-if="expandedId === f.id" class="content-box mb-3">
            <div class="text-body-2" style="white-space:pre-wrap; line-height:1.7">{{ f.content }}</div>
          </div>

          <!-- 상태 버튼 -->
          <div class="d-flex ga-2">
            <button
              v-for="(label, key) in statusLabel"
              :key="key"
              class="status-btn"
              :class="{ [`status-btn--${key}`]: f.status === key }"
              @click="updateStatus(f.id, key)"
            >{{ label }}</button>
          </div>
        </div>
      </div>
    </template>
  </v-container>

  <!-- 삭제 확인 -->
  <v-dialog v-model="deleteDialog" max-width="300">
    <v-card rounded="xl" class="glass-dialog">
      <v-card-title class="text-center pt-5 text-error">삭제 확인</v-card-title>
      <v-card-text class="text-center text-body-2 text-medium-emphasis">
        이 의견을 삭제하시겠습니까?<br>복구할 수 없습니다.
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn variant="text" block :disabled="deleteLoading" @click="deleteDialog = false">취소</v-btn>
        <v-btn color="error" block :loading="deleteLoading" @click="deleteFeedback">삭제</v-btn>
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

/* 필터 버튼 */
.filter-btn {
  padding: 6px 12px;
  border-radius: 99px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.filter-btn--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

/* 피드백 카드 */
.feedback-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  padding: 14px 16px;
}

.date-text {
  font-size: 13px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.delete-btn {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.delete-btn:active { opacity: 0.4; }

.title-text {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.cursor-pointer { cursor: pointer; }

.email-text {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.content-box {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

/* 상태 버튼 */
.status-btn {
  padding: 5px 14px;
  border-radius: 99px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.status-btn--NEW {
  border-color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error));
}
.status-btn--CHECKED {
  border-color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.1);
  color: rgb(var(--v-theme-warning));
}
.status-btn--DONE {
  border-color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.1);
  color: rgb(var(--v-theme-success));
}
</style>
