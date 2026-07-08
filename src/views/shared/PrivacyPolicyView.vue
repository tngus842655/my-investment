<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <v-container class="pa-4 pa-sm-6" style="max-width: 640px">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="font-weight-bold">개인정보처리방침</div>
        <div class="text-medium-emphasis">시행일자 2026.7.8</div>
      </div>
    </div>

    <div class="glass-card pa-4 policy-body">
      <p>
        Fire Path(이하 "서비스")는 이용자의 개인정보를 중요하게 생각하며, 아래와 같이 개인정보를 수집·이용합니다.
      </p>

      <h3>1. 수집하는 개인정보 항목</h3>
      <ul>
        <li>계정 정보: 이메일 주소, 비밀번호(암호화 저장)</li>
        <li>서비스 이용 정보: 투자 목표, 보유 자산·거래 내역, 가계부 수입·지출 내역</li>
        <li>접속 기록: 접속 일시, 접속 페이지</li>
        <li>사용자 의견: 의견 작성 시 입력한 제목·내용</li>
      </ul>

      <h3>2. 개인정보의 수집·이용 목적</h3>
      <ul>
        <li>회원 가입 및 로그인, 본인 확인</li>
        <li>투자 목표 관리, 자산·가계부 기록 등 서비스 제공</li>
        <li>서비스 이용 통계 분석 및 오류 대응</li>
        <li>사용자 의견 접수 및 답변</li>
      </ul>

      <h3>3. 개인정보의 보유 및 이용 기간</h3>
      <p>
        회원 탈퇴 시 계정 및 관련 데이터는 지체 없이 삭제됩니다. 단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관할 수 있습니다.
      </p>

      <h3>4. 개인정보의 처리 위탁</h3>
      <p>서비스는 아래 업체에 개인정보 처리를 위탁하고 있습니다.</p>
      <ul>
        <li>Supabase Inc. — 데이터베이스 저장 및 인증 처리</li>
        <li>Resend — 인증 메일 등 이메일 발송</li>
      </ul>

      <h3>5. 이용자의 권리</h3>
      <p>
        이용자는 언제든지 본인의 개인정보를 조회·수정할 수 있으며, 회원 탈퇴를 통해 개인정보 삭제를 요청할 수 있습니다.
      </p>

      <h3>6. 개인정보 보호 문의</h3>
      <p>개인정보 관련 문의사항은 아래 이메일로 연락해주시기 바랍니다.</p>
      <p class="font-weight-bold">tngus842655@gmail.com</p>
    </div>
  </v-container>
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

.glass-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 20px;
}

.policy-body h3 {
  font-size: 0.9375rem;
  font-weight: 700;
  margin-top: 20px;
  margin-bottom: 8px;
}
.policy-body h3:first-of-type {
  margin-top: 0;
}
.policy-body p {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
  line-height: 1.6;
  margin: 0 0 8px;
}
.policy-body ul {
  padding-left: 18px;
  margin: 0 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.policy-body li {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
  line-height: 1.5;
}
</style>
