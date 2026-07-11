<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const category = ref<string | null>(null)
const title = ref('')
const content = ref('')
const userEmail = ref('')
const submitting = ref(false)
const listLoading = ref(true)
const expandedId = ref<string | null>(null)

const TITLE_MAX = 100
const CONTENT_MAX = 2000

interface MyFeedback {
  id: string
  category: string
  title: string
  content: string
  status: string
  admin_comment: string | null
  is_read_by_user: boolean
  created_at: string
}

const feedbacks = ref<MyFeedback[]>([])

const categories = computed(() => [
  { label: t('feedback.catBug'), value: '버그신고', icon: 'mdi-bug-outline' },
  { label: t('feedback.catFeature'), value: '기능제안', icon: 'mdi-lightbulb-outline' },
  { label: t('feedback.catOther'), value: '기타의견', icon: 'mdi-chat-outline' },
])

const statusConfig = computed<Record<string, { label: string; color: string }>>(() => ({
  RECEIVED: { label: t('feedback.statusReceived'), color: 'primary' },
  REVIEWING: { label: t('feedback.statusReviewing'), color: 'warning' },
  DONE: { label: t('feedback.statusDone'), color: 'success' },
  REJECTED: { label: t('feedback.statusRejected'), color: 'error' },
}))

const isValid = computed(
  () => !!category.value && title.value.trim().length > 0 && content.value.trim().length > 0,
)

// DB에는 category가 한글 값으로 저장되어 있어(예: '버그신고') 목록 표시 시 현재 로케일 라벨로 매핑
const categoryLabel = (value: string): string =>
  categories.value.find((c) => c.value === value)?.label ?? value

const KST = 'Asia/Seoul'
const formatDate = (iso: string) => {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}.${get('month')}.${get('day')}`
}

onMounted(async () => {
  const queryCategory = route.query.category
  if (typeof queryCategory === 'string' && categories.value.some((c) => c.value === queryCategory)) {
    category.value = queryCategory
  }
  const queryTitle = route.query.title
  if (typeof queryTitle === 'string') {
    title.value = queryTitle
  }

  const { data: { user } } = await supabase.auth.getUser()
  userEmail.value = user?.email ?? ''
  await loadFeedbacks()
  await markAllRead()
})

const loadFeedbacks = async () => {
  listLoading.value = true
  const { data } = await supabase
    .from('feedback')
    .select('id, category, title, content, status, admin_comment, is_read_by_user, created_at')
    .eq('email', userEmail.value)
    .order('created_at', { ascending: false })
  feedbacks.value = data ?? []
  listLoading.value = false
}

const markAllRead = async () => {
  const unread = feedbacks.value.filter(f => !f.is_read_by_user)
  if (unread.length === 0) return
  await supabase
    .from('feedback')
    .update({ is_read_by_user: true })
    .eq('email', userEmail.value)
    .eq('is_read_by_user', false)
  feedbacks.value = feedbacks.value.map(f => ({ ...f, is_read_by_user: true }))
}

const submit = async () => {
  if (!isValid.value) {
    showMessage(t('feedback.errors.fillAll'), 'error')
    return
  }
  submitting.value = true
  try {
    const { error } = await supabase.from('feedback').insert({
      email: userEmail.value,
      category: category.value,
      title: title.value.trim(),
      content: content.value.trim(),
      status: 'RECEIVED',
    })
    if (error) throw error
    category.value = null
    title.value = ''
    content.value = ''
    showMessage(t('feedback.errors.received'), 'success')
    await loadFeedbacks()
  } catch {
    showMessage(t('feedback.errors.sendError'), 'error')
  } finally {
    submitting.value = false
  }
}

const toggleExpand = (id: string) => {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 600px">
    <!-- 헤더 -->
    <div class="d-flex align-center ga-3 mb-5">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="font-weight-bold">{{ $t('feedback.title') }}</div>
        <div class="text-medium-emphasis">{{ $t('feedback.subtitle') }}</div>
      </div>
    </div>

    <!-- 새 의견 작성 -->
    <div class="section-label mb-2">{{ $t('feedback.newFeedback') }}</div>
    <div class="field-card mb-2">
      <div class="field-label mb-3">{{ $t('feedback.category') }} <span class="required">*</span></div>
      <div class="d-flex ga-2">
        <button
          v-for="cat in categories"
          :key="cat.value"
          class="cat-btn"
          :class="{ 'cat-btn--active': category === cat.value }"
          @click="category = cat.value"
        >
          <v-icon size="14" class="mr-1">{{ cat.icon }}</v-icon>{{ cat.label }}
        </button>
      </div>
    </div>

    <div class="field-card mb-2">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="field-label">{{ $t('feedback.titleLabel') }} <span class="required">*</span></div>
        <span class="char-count">{{ title.length }} / {{ TITLE_MAX }}</span>
      </div>
      <input
        v-model="title"
        class="plain-input"
        :placeholder="$t('feedback.titlePlaceholder')"
        :maxlength="TITLE_MAX"
      />
    </div>

    <div class="field-card mb-4">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="field-label">{{ $t('feedback.contentLabel') }} <span class="required">*</span></div>
        <span class="char-count">{{ content.length }} / {{ CONTENT_MAX }}</span>
      </div>
      <textarea
        v-model="content"
        class="plain-input plain-textarea"
        :placeholder="$t('feedback.contentPlaceholder')"
        :maxlength="CONTENT_MAX"
        rows="5"
      />
    </div>

    <button
      class="submit-btn mb-8"
      :class="{ 'submit-btn--disabled': !isValid || submitting }"
      :disabled="!isValid || submitting"
      @click="submit"
    >
      <span v-if="submitting">{{ $t('feedback.sending') }}</span>
      <span v-else>{{ $t('feedback.send') }}</span>
    </button>

    <!-- 내 의견 목록 -->
    <div class="section-label mb-2">{{ $t('feedback.myFeedback') }}</div>

    <template v-if="listLoading">
      <v-skeleton-loader v-for="i in 2" :key="i" type="card" class="mb-3 rounded-xl" />
    </template>

    <div v-else-if="feedbacks.length === 0" class="empty-state">
      <v-icon size="36" style="opacity:0.25" class="mb-2">mdi-inbox-outline</v-icon>
      <div class="text-medium-emphasis">{{ $t('feedback.emptyFeedback') }}</div>
    </div>

    <div v-else class="d-flex flex-column ga-3 pb-6">
      <div
        v-for="f in feedbacks"
        :key="f.id"
        class="feedback-card"
        :class="{ 'feedback-card--answered': !!f.admin_comment }"
      >
        <!-- 상단 행 -->
        <div class="d-flex align-center ga-2 mb-2">
          <v-chip size="x-small" color="primary" variant="outlined">{{ categoryLabel(f.category) }}</v-chip>
          <v-chip
            size="x-small"
            :color="statusConfig[f.status]?.color ?? 'default'"
            variant="tonal"
          >{{ statusConfig[f.status]?.label ?? f.status }}</v-chip>
          <v-spacer />
          <span class="date-text">{{ formatDate(f.created_at) }}</span>
        </div>

        <!-- 제목 + 작성내용 토글 -->
        <div class="d-flex align-center ga-1 cursor-pointer" @click="toggleExpand(f.id)">
          <span class="title-text">{{ f.title }}</span>
          <v-icon
            size="16"
            style="opacity:0.4; transition: transform 0.2s; flex-shrink:0; margin-left:auto"
            :style="expandedId === f.id ? 'transform:rotate(180deg)' : ''"
          >mdi-chevron-down</v-icon>
        </div>

        <!-- 작성 내용 (토글) -->
        <div v-if="expandedId === f.id" class="content-box mt-2">
          <div class="text-medium-emphasis mb-1">{{ $t('feedback.writtenContent') }}</div>
          <div style="white-space:pre-wrap; line-height:1.7">{{ f.content }}</div>
        </div>

        <!-- 관리자 답변 (항상 노출) -->
        <div v-if="f.admin_comment" class="answer-box mt-3">
          <div class="d-flex align-center ga-1 mb-1">
            <v-icon size="14" color="primary">mdi-message-reply-outline</v-icon>
            <span class="font-weight-bold text-primary">{{ $t('feedback.adminReply') }}</span>
          </div>
          <div style="white-space:pre-wrap; line-height:1.7">{{ f.admin_comment }}</div>
        </div>
      </div>
    </div>
  </v-container>
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

.section-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.4);
  padding: 0 4px;
}

.field-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  padding: 16px;
}

.field-label {
  font-size: 0.8125rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.required { color: rgb(var(--v-theme-error)); }

.cat-btn {
  flex: 1;
  padding: 8px 4px;
  border-radius: 99px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.15);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.cat-btn--active {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
}

.plain-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface));
  caret-color: rgb(var(--v-theme-primary));
  resize: none;
}
.plain-input::placeholder { color: rgba(var(--v-theme-on-surface), 0.35); }
.plain-textarea { min-height: 100px; line-height: 1.65; display: block; }

.char-count {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.35);
}

.submit-btn {
  width: 100%;
  padding: 15px;
  border: none;
  border-radius: 14px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
  letter-spacing: 0.02em;
}
.submit-btn:active { opacity: 0.8; }
.submit-btn--disabled { opacity: 0.4; cursor: default; }
.submit-btn--disabled:active { opacity: 0.4; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.feedback-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  padding: 14px 16px;
  transition: border-color 0.15s;
}
.feedback-card--answered {
  border-color: rgba(var(--v-theme-primary), 0.3);
}

.cursor-pointer { cursor: pointer; }

.date-text {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.title-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.answer-preview {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.06);
}

.content-box {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.answer-box {
  background: rgba(var(--v-theme-primary), 0.06);
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
}
</style>
