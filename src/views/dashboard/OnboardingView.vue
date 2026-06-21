<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { formatShortMoney } from '@/utils/numberFormat'

const router = useRouter()

const targetAsset = ref('')
const currentAsset = ref('')
const investmentPrincipal = ref('')

const principalUnknown = ref(false)
const loading = ref(false)

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

const handleCurrentAsset = (value: string) => {
  currentAsset.value = addComma(value)

  if (principalUnknown.value) {
    investmentPrincipal.value = currentAsset.value
  }
}

const handleInvestmentPrincipal = (value: string) => {
  investmentPrincipal.value = addComma(value)
}

watch(principalUnknown, (checked) => {
  if (checked) {
    investmentPrincipal.value = currentAsset.value
  }
})

const targetAssetText = computed(() => formatShortMoney(removeComma(targetAsset.value)))

const currentAssetText = computed(() => formatShortMoney(removeComma(currentAsset.value)))

const investmentPrincipalText = computed(() =>
  formatShortMoney(removeComma(investmentPrincipal.value)),
)

const save = async () => {
  loading.value = true

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return
    }

    const { error: goalError } = await supabase.from('investment_goals').upsert({
      user_id: user.id,
      target_asset: removeComma(targetAsset.value),
    })

    if (goalError) {
      alert(goalError.message)
      return
    }

    const { error: assetError } = await supabase.from('asset_summary').upsert({
      user_id: user.id,
      current_asset: removeComma(currentAsset.value),
      investment_principal: removeComma(investmentPrincipal.value),
    })

    if (assetError) {
      alert(assetError.message)
      return
    }

    router.push('/dashboard')
  } catch (error) {
    console.error(error)
    alert('저장 중 오류가 발생했습니다.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="fill-height">
    <v-row justify="center" align="center">
      <v-col cols="12" sm="10" md="7" lg="5">
        <v-card rounded="xl" elevation="4">
          <v-card-title class="text-center text-h4 font-weight-bold py-8">
            투자 시작하기
          </v-card-title>

          <v-card-subtitle class="text-center mb-6">
            목표 자산과 현재 자산을 설정해주세요
          </v-card-subtitle>

          <v-card-text>
            <!-- 목표 자산 -->

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

            <!-- 현재 자산 -->

            <v-text-field
              :model-value="currentAsset"
              @update:model-value="handleCurrentAsset"
              label="현재 자산"
              variant="outlined"
              prepend-inner-icon="mdi-bank"
              class="mt-2"
            >
              <template #append-inner>
                <span v-if="currentAsset" class="text-grey-darken-1 text-no-wrap">
                  ({{ currentAssetText }})
                </span>
              </template>
            </v-text-field>

            <!-- 투자 원금 -->

            <v-text-field
              :model-value="investmentPrincipal"
              @update:model-value="handleInvestmentPrincipal"
              label="투자 원금"
              variant="outlined"
              prepend-inner-icon="mdi-finance"
              class="mt-2"
              :disabled="principalUnknown"
            >
              <template #append-inner>
                <span v-if="investmentPrincipal" class="text-grey-darken-1 text-no-wrap">
                  ({{ investmentPrincipalText }})
                </span>
              </template>
            </v-text-field>

            <v-checkbox
              v-model="principalUnknown"
              label="투자원금을 모르겠습니다"
              color="primary"
              hide-details
              class="mt-2"
            />
          </v-card-text>

          <v-card-actions class="pa-6">
            <v-btn color="primary" size="large" block :loading="loading" @click="save">
              시작하기
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
