<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()

const category = ref<string | null>(null)
const title = ref('')
const content = ref('')
const userEmail = ref('')
const loading = ref(false)
const submitted = ref(false)

const TITLE_MAX = 100
const CONTENT_MAX = 2000

const categories = [
  { label: '버그 신고', value: '버그신고', icon: 'mdi-bug-outline' },
  { label: '기능 제안', value: '기능제안', icon: 'mdi-lightbulb-outline' },
  { label: '기타 의견', value: '기타의견', icon: 'mdi-chat-outline' },
]

const isValid = computed(() => !!category.value && title.value.trim().length > 0 && content.value.trim().length > 0)

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  userEmail.value = user?.email ?? ''
})

const submit = async () => {
  if (!isValid.value) {
    showMessage('모든 항목을 입력해주세요.', 'error')
    return
  }
  loading.value = true
  try {
    const { error } = await supabase.from('feedback').insert({
      email: userEmail.value,
      category: category.value,
      title: title.value.trim(),
      content: content.value.trim(),
    })
    if (error) throw error
    submitted.value = true
  } catch {
    showMessage('전송 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- 전송 완료 화면 -->
  <div v-if="submitted" class="success-screen">
    <div class="success-inner">
      <div class="success-icon-wrap mb-6">
        <v-icon size="56" color="primary">mdi-check-circle-outline</v-icon>
      </div>
      <div class="text-h6 font-weight-bold mb-3">전달되었습니다!</div>
      <div class="text-body-2 text-medium-emphasis text-center" style="line-height: 1.8">
        보내주신 의견은 다음 업데이트에<br>적극 반영하겠습니다.<br>소중한 의견 감사합니다. 🙏
      </div>
      <div class="success-actions mt-8" style="width: 100%; max-width: 280px">
        <button class="action-btn action-btn--primary" @click="router.back()">
          돌아가기
        </button>
      </div>
    </div>
  </div>

  <!-- 입력 폼 -->
  <template v-else>
    <v-container class="pa-4 pa-sm-6 pb-0" style="max-width: 600px">
      <div class="d-flex align-center ga-3 mb-5">
        <button class="back-btn" @click="router.back()">
          <v-icon size="20">mdi-arrow-left</v-icon>
        </button>
        <div>
          <div class="text-h5 font-weight-bold">의견 보내기</div>
          <div class="text-body-2 text-medium-emphasis">불편한 점이나 개선 아이디어를 보내주세요.</div>
        </div>
      </div>

      <!-- 구분 -->
      <div class="field-card mb-3">
        <div class="field-label mb-3">구분 <span class="required">*</span></div>
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

      <!-- 제목 -->
      <div class="field-card mb-3">
        <div class="field-label mb-2">제목 <span class="required">*</span></div>
        <input
          v-model="title"
          class="plain-input"
          placeholder="제목을 입력해주세요"
          :maxlength="TITLE_MAX"
        />
      </div>

      <!-- 내용 -->
      <div class="field-card mb-4">
        <div class="field-label mb-2">내용 <span class="required">*</span></div>
        <textarea
          v-model="content"
          class="plain-input plain-textarea"
          placeholder="자세한 내용을 입력해주세요"
          :maxlength="CONTENT_MAX"
          rows="7"
        />
        <div class="char-count">{{ content.length }} / {{ CONTENT_MAX }}</div>
      </div>
    </v-container>

    <!-- 하단 고정 버튼 -->
    <div class="submit-bar">
      <div class="submit-bar-inner">
        <button
          class="submit-btn"
          :class="{ 'submit-btn--disabled': !isValid || loading }"
          :disabled="!isValid || loading"
          @click="submit"
        >
          <span v-if="loading">전송 중...</span>
          <span v-else>의견 보내기</span>
        </button>
      </div>
    </div>
  </template>
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

.field-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  padding: 16px;
}

.field-label {
  font-size: 13px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.required {
  color: rgb(var(--v-theme-error));
}

/* 카테고리 버튼 */
.cat-btn {
  flex: 1;
  padding: 8px 4px;
  border-radius: 99px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.15);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.cat-btn--active {
  border-color: rgb(var(--v-theme-primary));
  background: transparent;
  color: rgb(var(--v-theme-primary));
}

/* 입력 필드 */
.plain-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: rgb(var(--v-theme-on-surface));
  caret-color: rgb(var(--v-theme-primary));
  resize: none;
}
.plain-input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.35);
}
.plain-textarea {
  min-height: 140px;
  line-height: 1.65;
  display: block;
}

.char-count {
  text-align: right;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.35);
  margin-top: 8px;
}

/* 하단 버튼 바 */
.submit-bar {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgb(var(--v-theme-background));
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.submit-bar-inner {
  max-width: 568px;
  margin: 0 auto;
}

.submit-btn {
  width: 100%;
  padding: 15px;
  border: none;
  border-radius: 14px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
  letter-spacing: 0.02em;
}
.submit-btn:active { opacity: 0.8; }
.submit-btn--disabled {
  opacity: 0.4;
  cursor: default;
}
.submit-btn--disabled:active { opacity: 0.4; }

/* 완료 화면 */
.success-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 56px);
  padding: 24px;
}
.success-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.success-icon-wrap {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-btn {
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
  border: none;
}
.action-btn:active { opacity: 0.7; }
.action-btn--primary {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
</style>
