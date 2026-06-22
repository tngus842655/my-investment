<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { formatShortMoney } from '@/utils/numberFormat'
import { showMessage } from '@/composables/useSnackbar'

const router = useRouter()

const targetAsset = ref('')
const monthlyInvestment = ref('')
const targetDate = ref('')

const loading = ref(false)
const isEditMode = ref(false)

const addComma = (value: string) => {
  const number = value.replace(/[^0-9]/g, '')
  return number.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const removeComma = (value: string) => {
  return Number(value.replace(/,/g, '')) || 0
}

const handleTargetAsset = (value: string) => {
  targetAsset.value = addComma(value)
}

const handleMonthlyInvestment = (value: string) => {
  monthlyInvestment.value = addComma(value)
}

const targetAssetText = computed(() => formatShortMoney(removeComma(targetAsset.value)))

const monthlyInvestmentText = computed(() => formatShortMoney(removeComma(monthlyInvestment.value)))

const loadData = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data } = await supabase
    .from('investment_goals')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) return

  isEditMode.value = true

  targetAsset.value = addComma(String(data.target_asset ?? ''))
  monthlyInvestment.value = addComma(String(data.monthly_investment ?? ''))
  targetDate.value = data.target_date ?? ''
}

const save = async () => {
  if (!targetAsset.value) {
    showMessage('목표 자산을 입력해주세요.', 'warning')
    return
  }

  loading.value = true

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return
    }

    const { error } = await supabase.from('investment_goals').upsert(
      {
        user_id: user.id,
        target_asset: removeComma(targetAsset.value),
        monthly_investment: removeComma(monthlyInvestment.value),
        target_date: targetDate.value || null,
      },
      {
        onConflict: 'user_id',
      },
    )

    if (error) {
      showMessage(error.message, 'error')
      return
    }

    if (isEditMode.value) {
      showMessage('목표 정보가 수정되었습니다.', 'success')
    } else {
      showMessage('투자 설정이 완료되었습니다.', 'success')
    }

    router.push('/dashboard')
  } catch (error) {
    console.error(error)
    showMessage('저장 중 오류가 발생했습니다.', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <v-container class="fill-height">
    <v-row justify="center" align="center">
      <v-col cols="12" sm="10" md="7" lg="5">
        <v-card rounded="xl" elevation="4">
          <v-card-title class="text-center text-h4 font-weight-bold py-8">
            {{ isEditMode ? '목표 수정' : '투자 시작하기' }}
          </v-card-title>

          <v-card-subtitle class="text-center mb-6">
            목표 자산과 투자 계획을 설정해주세요
          </v-card-subtitle>

          <v-card-text>
            <v-text-field
              :model-value="targetAsset"
              @update:model-value="handleTargetAsset"
              label="목표 자산"
              variant="outlined"
              prepend-inner-icon="mdi-target"
            >
              <template #append-inner>
                <span v-if="targetAsset" class="text-grey-darken-1 text-no-wrap">
                  ({{ targetAssetText }})
                </span>
              </template>
            </v-text-field>

            <v-text-field
              :model-value="monthlyInvestment"
              @update:model-value="handleMonthlyInvestment"
              label="월 투자금 (선택)"
              variant="outlined"
              prepend-inner-icon="mdi-cash"
              class="mt-2"
            >
              <template #append-inner>
                <span v-if="monthlyInvestment" class="text-grey-darken-1 text-no-wrap">
                  ({{ monthlyInvestmentText }})
                </span>
              </template>
            </v-text-field>

            <v-text-field
              v-model="targetDate"
              label="목표일 (선택)"
              type="date"
              variant="outlined"
              prepend-inner-icon="mdi-calendar"
              class="mt-2"
            />
          </v-card-text>

          <v-card-actions class="pa-6">
            <v-btn color="primary" size="large" block :loading="loading" @click="save">
              {{ isEditMode ? '수정하기' : '시작하기' }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
