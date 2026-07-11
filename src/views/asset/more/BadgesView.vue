<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { formatMoneyIn } from '@/utils/numberFormat'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { useUserDataStore } from '@/stores/userData'

const router = useRouter()
const userDataStore = useUserDataStore()
const { baseCurrency } = useBaseCurrency()
const loading = ref(true)
const targetAsset = ref(0)
const currentAsset = ref(0)

const progressPct = computed(() => {
  if (!targetAsset.value) return 0
  return Math.min((currentAsset.value / targetAsset.value) * 100, 100)
})

const BADGES = [
  {
    id: 'seed',
    emoji: '🌱',
    labelKey: 'badges.items.seed.label',
    threshold: 1,
    descKey: 'badges.items.seed.desc',
    gradient: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
    glow: 'rgba(52, 211, 153, 0.35)',
  },
  {
    id: 'sprout',
    emoji: '🌿',
    labelKey: 'badges.items.sprout.label',
    threshold: 10,
    descKey: 'badges.items.sprout.desc',
    gradient: 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)',
    glow: 'rgba(74, 222, 128, 0.35)',
  },
  {
    id: 'growth',
    emoji: '🌳',
    labelKey: 'badges.items.growth.label',
    threshold: 25,
    descKey: 'badges.items.growth.desc',
    gradient: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
    glow: 'rgba(96, 165, 250, 0.35)',
  },
  {
    id: 'halfway',
    emoji: '⚡',
    labelKey: 'badges.items.halfway.label',
    threshold: 50,
    descKey: 'badges.items.halfway.desc',
    gradient: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
    glow: 'rgba(167, 139, 250, 0.4)',
  },
  {
    id: 'firezone',
    emoji: '🔥',
    labelKey: 'badges.items.firezone.label',
    threshold: 75,
    descKey: 'badges.items.firezone.desc',
    gradient: 'linear-gradient(135deg, #fb923c 0%, #dc2626 100%)',
    glow: 'rgba(251, 146, 60, 0.4)',
  },
  {
    id: 'fire',
    emoji: '🏆',
    labelKey: 'badges.items.fire.label',
    threshold: 100,
    descKey: 'badges.items.fire.desc',
    gradient: 'linear-gradient(135deg, #fcd34d 0%, #f59e0b 50%, #d97706 100%)',
    glow: 'rgba(252, 211, 77, 0.5)',
  },
]

const badgesWithState = computed(() =>
  BADGES.map((b) => ({
    ...b,
    unlocked: progressPct.value >= b.threshold,
    isCurrent: progressPct.value >= b.threshold && (b.threshold === 100 || progressPct.value < (BADGES[BADGES.indexOf(b) + 1]?.threshold ?? 101)),
  })),
)

const unlockedCount = computed(() => badgesWithState.value.filter((b) => b.unlocked).length)
const nextBadge = computed(() => badgesWithState.value.find((b) => !b.unlocked) ?? null)

const loadData = async () => {
  loading.value = true
  try {
    const [goal, summary] = await Promise.all([userDataStore.ensureGoals(), userDataStore.ensureAssetSummary()])
    targetAsset.value = goal?.target_asset ?? 0
    currentAsset.value = summary?.current_asset ?? 0
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <v-container class="pa-4 pa-sm-6">
    <!-- 헤더 -->
    <div class="d-flex align-center ga-2 mb-6">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" class="mr-1" style="color: rgb(var(--v-theme-on-surface))" @click="router.back()" />
      <div>
        <div class="font-weight-bold">{{ $t('badges.title') }}</div>
        <div class="text-medium-emphasis">{{ $t('badges.subtitle') }}</div>
      </div>
    </div>

    <template v-if="loading">
      <v-skeleton-loader type="card" class="rounded-2xl mb-4" />
      <v-skeleton-loader type="card" class="rounded-2xl" />
    </template>

    <template v-else>
      <!-- 진행 상황 카드 -->
      <div class="progress-card mb-5">
        <div class="d-flex justify-space-between align-end mb-3">
          <div>
            <div class="text-medium-emphasis mb-1">{{ $t('badges.fireRate') }}</div>
            <div class="progress-pct">{{ progressPct.toFixed(1) }}<span class="progress-pct-unit">%</span></div>
          </div>
          <div class="text-right">
            <div class="text-medium-emphasis mb-1">{{ $t('badges.badgeCount') }}</div>
            <div class="badge-count">{{ unlockedCount }} <span class="text-medium-emphasis">/ {{ BADGES.length }}</span></div>
          </div>
        </div>

        <!-- 진행 바 -->
        <div class="prog-bar-bg">
          <div class="prog-bar-fill" :style="{ width: progressPct + '%' }" />
          <!-- 마일스톤 마커 -->
          <div v-for="b in BADGES.slice(0, -1)" :key="b.id" class="milestone-marker" :style="{ left: b.threshold + '%' }" :title="$t(b.labelKey) + ' ' + b.threshold + '%'" />
        </div>

        <!-- 다음 배지 힌트 -->
        <div v-if="nextBadge" class="next-badge-hint mt-3">
          <span class="next-badge-emoji">{{ nextBadge.emoji }}</span>
          <i18n-t keypath="badges.nextHint" tag="span" class="text-medium-emphasis" scope="global">
            <template #label><span class="font-weight-medium" style="color: rgb(var(--v-theme-on-surface))">{{ $t(nextBadge.labelKey) }}</span></template>
            <template #n>{{ (nextBadge.threshold - progressPct).toFixed(1) }}</template>
          </i18n-t>
        </div>
        <div v-else class="next-badge-hint mt-3">
          <span>🎉</span>
          <span class="font-weight-medium" style="color: rgb(var(--v-theme-primary))">{{ $t('badges.allUnlocked') }}</span>
        </div>

        <div class="asset-summary mt-3">
          <span class="text-medium-emphasis">{{ $t('badges.currentAsset') }}</span>
          <span class="font-weight-bold">{{ formatMoneyIn(currentAsset, baseCurrency, 'bare') }}</span>
          <span class="text-medium-emphasis mx-1">/</span>
          <span class="text-medium-emphasis">{{ $t('badges.target') }}</span>
          <span class="font-weight-medium">{{ formatMoneyIn(targetAsset, baseCurrency, 'bare') }}</span>
        </div>
      </div>

      <!-- 배지 그리드 -->
      <div class="badges-grid">
        <div v-for="badge in badgesWithState" :key="badge.id" class="badge-card" :class="{ locked: !badge.unlocked }">
          <!-- 배지 아이콘 영역 -->
          <div class="badge-icon-wrap" :style="badge.unlocked ? { background: badge.gradient, boxShadow: `0 8px 24px ${badge.glow}` } : {}">
            <span class="badge-emoji">{{ badge.emoji }}</span>
            <div v-if="!badge.unlocked" class="lock-overlay">
              <v-icon size="20" style="opacity:0.6">mdi-lock</v-icon>
            </div>
          </div>

          <!-- 배지 정보 -->
          <div class="badge-label">{{ $t(badge.labelKey) }}</div>
          <div class="badge-desc">{{ $t(badge.descKey) }}</div>
          <div class="badge-threshold" :style="badge.unlocked ? { color: 'rgb(var(--v-theme-primary))' } : {}">{{ $t('badges.thresholdReached', { n: badge.threshold }) }}</div>

          <!-- 달성 표시 -->
          <div v-if="badge.unlocked" class="badge-check">
            <v-icon size="14" color="white">mdi-check</v-icon>
          </div>
        </div>
      </div>
    </template>
  </v-container>
</template>

<style scoped>

.progress-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 24px;
  padding: 20px;
}

.progress-pct {
  font-size: 2.25rem;
  font-weight: 800;
  line-height: 1;
  color: rgb(var(--v-theme-primary));
}
.progress-pct-unit {
  font-size: 1.25rem;
  font-weight: 600;
}
.badge-count {
  font-size: 1.5rem;
  font-weight: 700;
}

.prog-bar-bg {
  position: relative;
  height: 8px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 4px;
  overflow: visible;
}
.prog-bar-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--fp-primary) 0%, var(--fp-secondary) 100%);
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
  max-width: 100%;
}
.milestone-marker {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 12px;
  background: rgb(var(--v-theme-surface));
  border-radius: 1px;
  transform: translateX(-50%);
}

.next-badge-hint {
  display: flex;
  align-items: center;
  gap: 8px;
}
.next-badge-emoji {
  font-size: 1.125rem;
}
.asset-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* 배지 그리드 */
.badges-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.badge-card {
  position: relative;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  border-radius: 20px;
  padding: 20px 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: transform 0.2s ease;
}
.badge-card:not(.locked):active {
  transform: scale(0.97);
}
.badge-card.locked {
  opacity: 0.55;
}

.badge-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  position: relative;
  transition: box-shadow 0.3s ease;
}
.badge-emoji {
  font-size: 2.25rem;
  line-height: 1;
}
.lock-overlay {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  background: rgba(var(--v-theme-surface), 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.badge-label {
  font-size: 0.8125rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.badge-desc {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 6px;
  line-height: 1.4;
}
.badge-threshold {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.badge-check {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
