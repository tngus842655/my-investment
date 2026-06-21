<script setup lang="ts">
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'

const router = useRouter()

const signOut = async () => {
  await supabase.auth.signOut()
  router.push('/')
}
</script>

<template>
  <v-container fluid class="dashboard-page pa-6">
    <!-- 상단 -->
    <v-row class="mb-4">
      <v-col cols="12">
        <v-card rounded="xl" elevation="4">
          <v-card-text class="d-flex justify-space-between align-center">
            <div>
              <div class="text-h5 font-weight-bold">MY INVESTMENT</div>
              <div class="text-grey">투자 현황 대시보드</div>
            </div>

            <v-btn color="error" variant="outlined" @click="signOut"> 로그아웃 </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- 요약 카드 -->
    <v-row>
      <v-col cols="12" md="4">
        <v-card color="primary" rounded="xl">
          <v-card-text>
            <div class="text-overline">총 자산</div>

            <div class="text-h4 font-weight-bold">1.52억</div>

            <div>+2.3%</div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card color="success" rounded="xl">
          <v-card-text>
            <div class="text-overline">월 투자금</div>

            <div class="text-h4 font-weight-bold">500만</div>

            <div>자동 적립중</div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card color="deep-purple" rounded="xl">
          <v-card-text>
            <div class="text-overline">FIRE 달성률</div>

            <div class="text-h4 font-weight-bold">15.2%</div>

            <div>목표 10억</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- 보유종목 -->
    <v-row class="mt-2">
      <v-col cols="12" md="8">
        <v-card rounded="xl">
          <v-card-title> 보유 종목 </v-card-title>

          <v-table>
            <thead>
              <tr>
                <th>종목</th>
                <th>평가금액</th>
                <th>수익률</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>QQQM</td>
                <td>102,000,000</td>
                <td class="text-success">+12.3%</td>
              </tr>

              <tr>
                <td>BTC</td>
                <td>25,000,000</td>
                <td class="text-success">+7.8%</td>
              </tr>

              <tr>
                <td>은 ETF</td>
                <td>5,000,000</td>
                <td class="text-error">-1.4%</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card rounded="xl">
          <v-card-title> 목표 진행률 </v-card-title>

          <v-card-text>
            <v-progress-linear model-value="15.2" color="success" height="20" rounded />

            <div class="mt-4 text-center text-h6">1.52억 / 10억</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.dashboard-page {
  background: #f8fafc;
  min-height: 100vh;
}
</style>
