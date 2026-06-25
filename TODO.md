# Fire Path - 남은 작업 목록

## 🔴 해야 할 것

### ETF 백테스트
- 새 Supabase Edge Function: `etf-backtest` (Yahoo Finance 일별 종가 데이터)
- 시작일 / 월 투자금 입력 → 누적 수익 시뮬레이션
- 결과: 총 투자금 vs 평가금액, CAGR, 수익률 라인 차트

### 이메일 인증 / SMTP
- 도메인 구매 후 Resend 연결 → 이메일 인증 재활성화
- 현재 임시로 이메일 인증 OFF 상태

### signup_log RLS 정책 적용
- 현재 UNRESTRICTED 상태 (RLS 비활성화)
- RLS 활성화 + 관리자 전용 조회/수정 정책 필요
- SQL 준비됨 (직전 대화 참고)

---

## ⚠️ 서비스 오픈 전 체크리스트

- [ ] `.env` `.gitignore` 추가 (현재 저장소에 포함됨 — API 키 노출 주의!)
- [ ] 이메일 인증 재활성화 (도메인 + Resend SMTP 연결 후)
- [ ] signup_log RLS 정책 적용
