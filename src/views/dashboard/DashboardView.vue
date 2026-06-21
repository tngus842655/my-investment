<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { formatCurrencyWithShort } from '@/utils/numberFormat'

const router = useRouter()

const loading = ref(true)

const targetAsset = ref(0)
const currentAsset = ref(0)
const investmentPrincipal = ref(0)

const progressRate = computed(() => {
  if (!targetAsset.value) return 0

  return Math.min(Math.round((currentAsset.value / targetAsset.value) * 100), 100)
})

const profitAmount = computed(() => {
  return currentAsset.value - investmentPrincipal.value
})

const profitRate = computed(() => {
  if (!investmentPrincipal.value) return 0

  return Number(
    (((currentAsset.value - investmentPrincipal.value) / investmentPrincipal.value) * 100).toFixed(
      2,
    ),
  )
})

const loadDashboard = async () => {
  loading.value = true

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const [goalResult, assetResult] = await Promise.all([
      supabase.from('investment_goals').select('*').eq('user_id', user.id).maybeSingle(),

      supabase.from('asset_summary').select('*').eq('user_id', user.id).maybeSingle(),
    ])

    if (goalResult.data) {
      targetAsset.value = goalResult.data.target_asset ?? 0
    }

    if (assetResult.data) {
      currentAsset.value = assetResult.data.current_asset ?? 0
      investmentPrincipal.value = assetResult.data.investment_principal ?? 0
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

const moveToOnboarding = () => {
  router.push('/onboarding')
}

const moveToPortfolio = () => {
  router.push('/portfolio')
}

const moveToTransactions = () => {
  router.push('/transactions')
}

onMounted(() => {
  loadDashboard()
})
</script>

<template>
  <v-container class="pa-6">
    <div class="d-flex justify-space-between align-center mb-6">
      <div>
        <div class="text-h4 font-weight-bold">MY INVESTMENT</div>

        <div class="text-subtitle-1 text-grey-darken-1">FIRE 목표 달성 현황</div>
      </div>

      <v-btn color="primary" variant="outlined" prepend-icon="mdi-pencil" @click="moveToOnboarding">
        목표 수정
      </v-btn>
    </div>

    <!-- 현재자산 / 목표자산 -->

    <v-row>
      <v-col cols="12" md="6">
        <v-card rounded="xl" elevation="3">
          <v-card-text>
            <div class="text-grey">현재 자산</div>

            <div class="text-h6 font-weight-bold mt-2">
              {{ formatCurrencyWithShort(currentAsset) }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card rounded="xl" elevation="3">
          <v-card-text>
            <div class="text-grey">목표 자산</div>

            <div class="text-h6 font-weight-bold mt-2">
              {{ formatCurrencyWithShort(targetAsset) }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- 목표 달성률 -->

    <v-card rounded="xl" elevation="3" class="mt-4">
      <v-card-text>
        <div class="d-flex justify-space-between mb-2">
          <span>목표 달성률</span>
          <span>{{ progressRate }}%</span>
        </div>

        <v-progress-linear :model-value="progressRate" height="20" rounded color="success" />
      </v-card-text>
    </v-card>

    <!-- 투자원금 / 평가손익 -->

    <v-row class="mt-2">
      <v-col cols="6">
        <v-card rounded="xl" elevation="3">
          <v-card-text>
            <div class="text-grey">투자 원금</div>

            <div class="text-h6 font-weight-bold mt-2">
              {{ formatCurrencyWithShort(investmentPrincipal) }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="6">
        <v-card rounded="xl" elevation="3">
          <v-card-text>
            <div class="text-grey">평가 손익</div>

            <div
              class="text-h6 font-weight-bold mt-2"
              :class="profitAmount >= 0 ? 'text-success' : 'text-error'"
            >
              {{ profitAmount >= 0 ? '+' : '-' }}
              {{ formatCurrencyWithShort(Math.abs(profitAmount)) }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- 수익률 -->

    <v-row>
      <v-col cols="12">
        <v-card rounded="xl" elevation="3">
          <v-card-text>
            <div class="text-grey">수익률</div>

            <div
              class="text-h4 font-weight-bold mt-2"
              :class="profitRate >= 0 ? 'text-success' : 'text-error'"
            >
              {{ profitRate }} %
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- 메뉴 버튼 -->

    <v-row class="mt-4">
      <v-col cols="12" md="6">
        <v-btn
          block
          color="primary"
          size="large"
          prepend-icon="mdi-chart-line"
          @click="moveToPortfolio"
        >
          보유자산 관리
        </v-btn>
      </v-col>

      <v-col cols="12" md="6">
        <v-btn
          block
          color="secondary"
          size="large"
          prepend-icon="mdi-swap-horizontal"
          @click="moveToTransactions"
        >
          거래내역 관리
        </v-btn>
      </v-col>
    </v-row>

    <v-overlay :model-value="loading" class="align-center justify-center">
      <v-progress-circular indeterminate size="64" />
    </v-overlay>
  </v-container>
</template>
