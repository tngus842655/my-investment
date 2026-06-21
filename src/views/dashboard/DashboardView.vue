<script setup lang="ts">
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'

const router = useRouter()

const logout = async () => {
  await supabase.auth.signOut()

  router.push('/')
}
</script>

<template>
  <v-container>
    <h1>대시보드</h1>

    <p>로그인 성공!</p>

    <v-btn color="error" @click="logout"> 로그아웃 </v-btn>
  </v-container>
</template>
