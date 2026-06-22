<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import PortfolioAddDialog from './PortfolioAddDialog.vue'
import type { PortfolioForm, PortfolioAsset } from '@/types/portfolio'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()

const loading = ref(false)

const portfolios = ref<PortfolioAsset[]>([])

const loadPortfolios = async () => {
  loading.value = true

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    portfolios.value = (data ?? []) as PortfolioAsset[]
  } catch (error) {
    console.error(error)

    showMessage('보유자산 조회 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

const dialog = ref(false)

const savePortfolio = async (item: PortfolioForm) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      showMessage('로그인이 필요합니다.', 'error')
      return
    }

    const { error } = await supabase.from('portfolios').insert({
      user_id: user.id,
      ticker: item.ticker,
      asset_type: item.asset_type,
      quantity: item.quantity,
      avg_price: item.avg_price,
      currency: item.currency,
    })

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    showMessage('자산이 등록되었습니다.', 'success')

    await loadPortfolios()
  } catch (error) {
    console.error(error)

    showMessage('자산 등록 중 오류가 발생했습니다.', 'error')
  }
}

const deleteDialog = ref(false)

const selectedPortfolioId = ref('')

const openDeleteDialog = (id: string) => {
  selectedPortfolioId.value = id
  deleteDialog.value = true
}

const deletePortfolio = async () => {
  try {
    const { error } = await supabase.from('portfolios').delete().eq('id', selectedPortfolioId.value)

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    showMessage('자산이 삭제되었습니다.', 'success')

    deleteDialog.value = false

    await loadPortfolios()
  } catch (error) {
    console.error(error)

    showMessage('자산 삭제 중 오류가 발생했습니다.', 'error')
  }
}

const formatNumber = (value: number) => {
  return value.toLocaleString()
}

const getEvaluationAmount = (item: PortfolioAsset) => {
  return item.quantity * item.avg_price
}

onMounted(() => {
  loadPortfolios()
})
</script>

<template>
  <v-container class="pa-6">
    <div class="d-flex justify-space-between align-center mb-6">
      <div>
        <div class="text-h4 font-weight-bold">보유자산 관리</div>

        <div class="text-subtitle-1 text-grey-darken-1">현재 보유중인 자산을 관리합니다.</div>
      </div>

      <v-btn color="primary" prepend-icon="mdi-plus" @click="dialog = true"> 자산 추가 </v-btn>
    </div>

    <v-card v-if="portfolios.length === 0" rounded="xl" elevation="2">
      <v-card-text class="text-center py-10"> 등록된 자산이 없습니다. </v-card-text>
    </v-card>

    <v-row v-else>
      <v-col v-for="item in portfolios" :key="item.id" cols="12">
        <v-card rounded="xl" elevation="2">
          <v-card-text>
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-h6 font-weight-bold">
                  {{ item.ticker }}
                </div>

                <div class="text-grey">
                  {{ item.asset_type }}
                </div>
              </div>

              <v-btn
                icon="mdi-delete-outline"
                variant="text"
                color="error"
                size="small"
                @click="openDeleteDialog(item.id)"
              />
            </div>

            <v-divider class="my-3" />

            <div class="d-flex justify-space-between">
              <div>
                <div class="text-grey text-caption">수량</div>

                <div class="font-weight-bold">
                  {{ formatNumber(item.quantity) }}
                </div>
              </div>

              <div class="text-center">
                <div class="text-grey text-caption">평균단가</div>

                <div class="font-weight-bold">
                  {{ formatNumber(item.avg_price) }}
                  {{ item.currency }}
                </div>
              </div>

              <div class="text-right">
                <div class="text-grey text-caption">평가금액</div>

                <div class="font-weight-bold text-primary">
                  {{ formatNumber(getEvaluationAmount(item)) }}
                  {{ item.currency }}
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-btn class="mt-6" variant="outlined" block @click="router.back()"> 뒤로가기 </v-btn>

    <v-overlay :model-value="loading">
      <v-progress-circular indeterminate size="64" />
    </v-overlay>
  </v-container>

  <PortfolioAddDialog v-model="dialog" @save="savePortfolio" />

  <v-dialog v-model="deleteDialog" max-width="320">
    <v-card rounded="xl">
      <v-card-title class="text-center pt-6"> 자산 삭제 </v-card-title>

      <v-card-text class="text-center"> 선택한 자산을 삭제하시겠습니까? </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-btn block variant="text" @click="deleteDialog = false"> 취소 </v-btn>

        <v-btn block color="error" @click="deletePortfolio"> 삭제 </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
