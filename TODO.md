# MY INVESTMENT - 남은 작업 목록

## 🔴 계정

### 회원탈퇴
- Supabase Edge Function 또는 Admin API로 유저 삭제 구현 필요
- 삭제 시 연결된 모든 테이블 데이터 CASCADE 삭제 확인 (현재 FK CASCADE 설정 있음)
- 탈퇴 전 확인 다이얼로그 (2단계: "정말 삭제?" → 이메일 재입력 등)

---

## 🟡 자산 분석

### FIRE 진행 기록
- **DB 작업 필요**: Supabase에 `asset_history` 테이블 생성
  - `user_id`, `recorded_at` (date), `current_asset`, `progress_pct` 컬럼
  - 주기적 스냅샷 저장 방식 (수동 또는 자동 트리거)
- 목표 달성률 변화 히스토리 라인 차트

### 자산 성장 리포트
- `asset_history` 테이블 필요 (위와 동일)
- 월별 자산 증가 추이 바 차트

---

## 🟡 투자 도구

> 모두 Yahoo Finance 비공식 API → Supabase Edge Function 경유 방식으로 구현
> (Finnhub 무료 플랜은 ETF 상세 데이터 지원 안 함)

### ETF 분석 & 비교
- 새 Supabase Edge Function: `etf-info` (Yahoo Finance `/v8/finance/chart`, `/v10/finance/quoteSummary`)
- 제공 지표: CAGR, MDD, 변동성, 배당률, 운용보수
- 티커 입력 → 지표 카드 표시, 2개 티커 나란히 비교 UI

### ETF 백테스트
- 새 Supabase Edge Function: `etf-backtest` (Yahoo Finance 일별 종가 데이터)
- 시작일 / 월 투자금 입력 → 누적 수익 시뮬레이션
- 결과: 총 투자금 vs 평가금액, CAGR, 수익률 라인 차트

### 배당 캘린더
- 새 Supabase Edge Function: `etf-dividend` (Yahoo Finance `/v8/finance/chart` dividends)
- 보유 종목 기준 배당락일·지급일 캘린더 표시
- 예상 배당금 합계 표시

---

## 🟢 완료된 기능

- 포트폴리오 분석 (SVG 도넛 차트, 자산군별/종목별 토글)
- 목표 달성 배지 (6단계 마일스톤)
- FIRE 시뮬레이터 (월별 복리 듀얼 라인 차트)
- 투자 도구 섹션 (준비중 메뉴 표시)
- 회원탈퇴 메뉴 (준비중 표시)
- 티커 삭제 다이얼로그 한글명 표시
- 뒤로가기 버튼 스타일 통일
