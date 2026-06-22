<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { formatCurrencyWithShort } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()

const loading = ref(true)

const targetAsset = ref(0)
const currentAsset = ref(0)

const monthlyInvestment = ref(0)
const targetDate = ref('')

const confirmDialog = ref(false)

const progressRate = computed(() => {
  if (!targetAsset.value) return 0

  return Math.min(Math.round((currentAsset.value / targetAsset.value) * 100), 100)
})

const loadDashboard = async () => {
  loading.value = true

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const [goalResult, portfolioResult] = await Promise.all([
      supabase.from('investment_goals').select('*').eq('user_id', user.id).maybeSingle(),

      supabase.from('portfolios').select('*').eq('user_id', user.id),
    ])

    if (goalResult.data) {
      targetAsset.value = goalResult.data.target_asset ?? 0
      monthlyInvestment.value = goalResult.data.monthly_investment ?? 0
      targetDate.value = goalResult.data.target_date ?? ''
    }

    if (portfolioResult.data) {
      const usdRate = 1350

      currentAsset.value = portfolioResult.data.reduce((sum, item) => {
        const amount = item.quantity * item.avg_price

        const krwAmount = item.currency === 'USD' ? amount * usdRate : amount

        return sum + krwAmount
      }, 0)
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

const moveToGoalSettings = () => {
  router.push('/goalSettings')
}

const logout = async () => {
  const { error } = await supabase.auth.signOut()

  if (error) {
    showMessage('로그아웃 중 오류가 발생했습니다.', 'error')
    return
  }

  router.replace('/')
}

const moveToPortfolio = () => {
  router.push('/portfolio')
}

const moveToTransactions = () => {
  showMessage('서비스 준비중', 'warning')
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

      <div class="d-flex ga-2">
        <v-btn
          color="primary"
          variant="outlined"
          prepend-icon="mdi-pencil"
          @click="moveToGoalSettings"
        >
          목표 수정
        </v-btn>

        <v-btn color="error" variant="text" prepend-icon="mdi-logout" @click="confirmDialog = true">
          로그아웃
        </v-btn>
      </div>
    </div>

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

    <v-card rounded="xl" elevation="3" class="mt-4">
      <v-card-text>
        <div class="d-flex justify-space-between mb-2">
          <span>목표 달성률</span>
          <span>{{ progressRate }}%</span>
        </div>

        <v-progress-linear :model-value="progressRate" height="20" rounded color="success" />
      </v-card-text>
    </v-card>

    <v-row class="mt-2">
      <v-col cols="12" md="6">
        <v-card rounded="xl" elevation="3">
          <v-card-text>
            <div class="text-grey">월 투자금</div>

            <div class="text-h6 font-weight-bold mt-2">
              {{ monthlyInvestment > 0 ? formatCurrencyWithShort(monthlyInvestment) : '-' }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card rounded="xl" elevation="3">
          <v-card-text>
            <div class="text-grey">목표일</div>

            <div class="text-h6 font-weight-bold mt-2">
              {{ targetDate || '-' }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card rounded="xl" elevation="3" class="mt-4">
      <v-card-text>
        <div class="text-grey">예상 FIRE 달성일</div>

        <div class="text-h5 font-weight-bold mt-2 text-grey">준비중 🚀</div>
      </v-card-text>
    </v-card>

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

    <v-dialog v-model="confirmDialog" max-width="320">
      <v-card rounded="xl">
        <v-card-title class="text-center pt-6"> 로그아웃 </v-card-title>

        <v-card-text class="text-center"> 정말 로그아웃 하시겠습니까? </v-card-text>

        <v-divider />

        <v-card-actions>
          <v-btn variant="text" block @click="confirmDialog = false"> 취소 </v-btn>

          <v-btn color="error" block @click="logout"> 로그아웃 </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
