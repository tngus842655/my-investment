# MY INVESTMENT - 남은 작업 목록

## ✅ 계정

### 회원탈퇴 (완료)
- Supabase RPC(`delete_user_account`)로 유저 삭제 구현
- 삭제 시 연결된 모든 테이블 데이터 CASCADE 삭제 확인
- 탈퇴 전 확인 다이얼로그 2단계 (경고 → 이메일 재입력) 구현

---

## 🟡 자산 분석

### ✅ FIRE 진행 기록 (완료)
- `asset_history` 테이블 생성 + RLS 적용
- `save_daily_asset_snapshot` RPC 함수 구현 (매일 UTC 15:00 pg_cron 자동 실행)
- 기간별 탭(1M/3M/6M/1Y/ALL) + SVG 베지어 라인 차트 + 툴팁
- 요약 카드: 현재 달성률, 기간 변화, 현재 자산(asset_summary 기준)

### ✅ 자산 성장 리포트 (완료)
- `asset_history` 테이블 활용, 월별 자산 증가 추이 바 차트
- 바 클릭 시 일별 상세 드릴다운
- 다크모드 헤더 아이콘 수정

---

## 🟡 투자 도구

> 모두 Yahoo Finance 비공식 API → Supabase Edge Function 경유 방식으로 구현
> (Finnhub 무료 플랜은 ETF 상세 데이터 지원 안 함)

### ✅ ETF 분석 & 비교 (완료)
- Supabase Edge Function `etf-info` (Yahoo Finance `/v8/finance/chart`, `/v10/finance/quoteSummary`)
- 제공 지표: CAGR, MDD, 변동성, 배당률, 운용보수, AUM, 상장일, 운용사
- 2개 티커 나란히 비교, 승/패 컬러링(초록/빨강), AI 종합 분석 카드
- 운용사 이름 말줄임 + 툴팁, 컴팩트 레이아웃
- 배포: Netlify로 플랫폼 전환 (Vercel 일일 배포 한도 초과 이슈)

### ETF 백테스트
- 새 Supabase Edge Function: `etf-backtest` (Yahoo Finance 일별 종가 데이터)
- 시작일 / 월 투자금 입력 → 누적 수익 시뮬레이션
- 결과: 총 투자금 vs 평가금액, CAGR, 수익률 라인 차트

### ✅ 배당 캘린더 (완료)
- Supabase Edge Function `etf-dividend` (Yahoo Finance `/v8/finance/chart` dividends)
- 보유 종목 기준 배당락일·지급일 캘린더 표시
- 예상 배당금 합계, 과거 배당 이력 기반 다음 배당 예측

---

## 🟢 완료된 기능

- 포트폴리오 분석 (SVG 도넛 차트, 자산군별/종목별 토글)
- 목표 달성 배지 (6단계 마일스톤)
- FIRE 시뮬레이터 (월별 복리 듀얼 라인 차트)
- 투자 도구 섹션 (준비중 메뉴 표시)
- 회원탈퇴 기능 (2단계 확인 다이얼로그 + RPC 삭제)
- 티커 삭제 다이얼로그 한글명 표시
- 뒤로가기 버튼 스타일 통일
- FIRE 진행 기록 (기간별 탭 + SVG 라인 차트 + 툴팁 + pg_cron 일일 스냅샷)
- 포트폴리오 수정 시 currency 덮어쓰기 버그 수정 (USD→KRW 오류)
- 현금 통화 수정 모드 잠금 처리
- GoalSettingsView 초기 렌더링 깜빡임 수정
- 자산 성장 리포트 (월별 바 차트 + 일별 드릴다운)
- ETF 분석 & 비교 (CAGR·MDD·변동성·배당률·운용보수, 승/패 컬러링, AI 분석 카드)
- 배당 캘린더 (보유 종목 배당 이력 + 다음 배당 예측)
- 배포 플랫폼 Vercel → Netlify 전환
