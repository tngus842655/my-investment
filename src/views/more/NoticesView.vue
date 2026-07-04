<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'

const router = useRouter()
const loading = ref(true)

interface Notice {
  id: string
  title: string
  content: string
  is_test: boolean
  created_at: string
}

const notices = ref<Notice[]>([])
const expandedId = ref<string | null>(null)

const KST = 'Asia/Seoul'
const formatDate = (iso: string) => {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}.${get('month')}.${get('day')}`
}

const toggleExpand = (n: Notice) => {
  expandedId.value = expandedId.value === n.id ? null : n.id
}

onMounted(async () => {
  const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false })
  notices.value = data ?? []
  if (notices.value[0]) expandedId.value = notices.value[0].id
  loading.value = false
})
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <div class="d-flex align-center ga-3 mb-6">
      <v-btn icon variant="text" size="small" @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div>
        <div class="font-weight-bold">공지사항</div>
        <div class="text-medium-emphasis">서비스 관련 안내 및 공지</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="card" class="mb-3 rounded-xl" />
      <v-skeleton-loader type="card" class="rounded-xl" />
    </template>

    <template v-else>
      <div v-if="notices.length === 0" class="text-center py-12 text-medium-emphasis">
        <v-icon size="40" class="mb-2" style="opacity:0.3">mdi-bullhorn-outline</v-icon>
        <div>등록된 공지사항이 없습니다</div>
      </div>

      <div v-for="n in notices" :key="n.id" class="notice-card glass-card pa-4 mb-3">
        <div class="d-flex align-center justify-space-between cursor-pointer" @click="toggleExpand(n)">
          <div class="d-flex align-center ga-1 title-group">
            <v-chip v-if="n.is_test" size="x-small" color="warning" variant="tonal" class="mr-1">테스트</v-chip>
            <span class="notice-title">{{ n.title }}</span>
            <v-icon
              size="18"
              style="opacity:0.4; transition: transform 0.2s; flex-shrink:0"
              :style="expandedId === n.id ? 'transform:rotate(180deg)' : ''"
            >mdi-chevron-down</v-icon>
          </div>
          <span class="notice-date">{{ formatDate(n.created_at) }}</span>
        </div>
        <div v-if="expandedId === n.id" class="notice-content mt-3">{{ n.content }}</div>
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.glass-card {
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
  border-radius: 20px;
}

.cursor-pointer { cursor: pointer; }

.title-group {
  min-width: 0;
  overflow: hidden;
  flex: 1 1 auto;
}

.notice-title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.notice-date {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.45);
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 8px;
}

.notice-content {
  font-size: 0.875rem;
  line-height: 1.7;
  color: rgba(var(--v-theme-on-surface), 0.8);
  white-space: pre-wrap;
}
</style>
