# CLAUDE.md

흔한 LLM 코딩 실수를 줄이기 위한 행동 지침. 프로젝트별 지침과 함께 적용할 것.

**트레이드오프:** 이 지침은 속도보다 신중함에 무게를 둔다. 사소한 작업에는 상황에 맞게 판단할 것.

## 1. 코딩 전에 먼저 생각하기

**추측하지 말 것. 혼란을 숨기지 말 것. 트레이드오프를 드러낼 것.**

구현하기 전에:

- 가정을 명시적으로 밝힐 것. 확신이 없으면 물어볼 것.
- 여러 해석이 가능하면 모두 제시할 것 - 임의로 하나를 고르지 말 것.
- 더 단순한 방법이 있으면 그렇게 말할 것. 필요하면 반박할 것.
- 불명확한 부분이 있으면 멈출 것. 무엇이 헷갈리는지 명확히 밝히고 물어볼 것.

## 2. 단순함을 우선할 것

**문제를 해결하는 최소한의 코드만. 추측성 코드는 금지.**

- 요청받지 않은 기능은 추가하지 말 것.
- 한 번만 쓰이는 코드에 추상화를 만들지 말 것.
- 요청받지 않은 "유연성"이나 "설정 가능성"을 넣지 말 것.
- 발생할 수 없는 상황에 대한 에러 처리를 하지 말 것.
- 200줄을 썼는데 50줄로 줄일 수 있다면 다시 쓸 것.

스스로에게 물어볼 것: "시니어 엔지니어가 보면 과하게 복잡하다고 할까?" 그렇다면 단순화할 것.

## 3. 필요한 부분만 수정할 것

**꼭 건드려야 하는 것만 건드릴 것. 자기가 어지른 것만 치울 것.**

기존 코드를 수정할 때:

- 주변 코드, 주석, 포맷팅을 "개선"하지 말 것.
- 문제 없는 코드를 리팩토링하지 말 것.
- 마음에 안 들어도 기존 스타일을 따를 것.
- 관련 없는 죽은 코드를 발견하면 언급만 하고 삭제하지는 말 것.

변경으로 인해 사용되지 않게 된 코드가 생기면:

- 내 변경으로 인해 쓸모없어진 import/변수/함수는 제거할 것.
- 원래부터 있던 죽은 코드는 요청받지 않는 한 제거하지 말 것.

기준: 변경한 모든 줄은 사용자의 요청과 직접 연결되어야 한다.

## 4. 목표 지향적으로 실행할 것

**성공 기준을 정의할 것. 검증될 때까지 반복할 것.**

작업을 검증 가능한 목표로 바꿀 것:

- "검증 추가" → "잘못된 입력에 대한 테스트를 작성하고, 통과시킨다"
- "버그 수정" → "버그를 재현하는 테스트를 작성하고, 통과시킨다"
- "X 리팩토링" → "리팩토링 전후로 테스트가 통과하는지 확인한다"

여러 단계로 이뤄진 작업은 간단한 계획을 먼저 밝힐 것:

```
1. [단계] → 검증: [확인 방법]
2. [단계] → 검증: [확인 방법]
3. [단계] → 검증: [확인 방법]
```

성공 기준이 명확하면 독립적으로 반복 작업할 수 있다. 기준이 모호하면("일단 되게만 해줘") 계속 확인이 필요해진다.

---

**이 지침들이 잘 작동하고 있다는 신호:** diff에 불필요한 변경이 줄어들고, 과도한 복잡화로 인한 재작업이 줄어들고, 실수가 생긴 후가 아니라 구현하기 전에 명확화 질문이 나온다.

## 0. 코딩 완료 후 필수 체크

**수정한 파일이 있으면 반드시 타입 체크를 실행하고 오류가 없는지 확인할 것.**

```bash
./node_modules/.bin/vue-tsc --noEmit
```

`npx tsc --noEmit`은 Vue SFC를 검사하지 못하므로 반드시 `vue-tsc`를 사용할 것.
오류가 있으면 커밋 전에 수정한다. 오류가 없을 때만 커밋·푸시한다.

## 📋 남은 작업 목록

새 세션 시작 시 **TODO.md** 를 먼저 읽어 남은 작업을 파악할 것.

## ⚠️ 서비스 오픈 전 체크리스트

- [ ] `.env`를 `.gitignore`에 추가할 것 (현재 2PC 개발 편의상 저장소에 포함되어 있음 — API 키 노출 주의!)

## Supabase RLS 정책 작성 주의사항

RLS 정책에서 이메일로 관리자 체크할 때 `auth.users` 테이블 직접 조회는 권한 오류 발생:

```sql
-- ❌ 이렇게 하면 안 됨 (permission denied for table users)
USING ((SELECT email FROM auth.users WHERE id = auth.uid()) = 'admin@email.com')

-- ✅ 이렇게 해야 함 (JWT claims에서 직접 읽기)
USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'email') = 'admin@email.com')
```

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 커밋 메시지 규칙

**모든 커밋 메시지는 반드시 한글로 작성할 것.**

## Git Push 규칙

main 배포는 사용자가 직접 처리한다. 사용자가 "push" 또는 "main에 반영"을 요청해도 Claude는 즉시 실행하지 않는다.

Claude가 git push를 돕는 경우: **빌드 오류, 충돌 등 사용자가 직접 해결하기 어려운 상황이 생겼을 때만** 요청에 따라 지원한다.

## 프로젝트 개요

**Fire Path** - 개인 FIRE(Financial Independence, Retire Early) 목표 관리 PWA. 투자 포트폴리오 추적 및 목표 달성률을 확인하는 앱.

## 주요 명령어

```bash
npm run dev        # 개발 서버 실행 (port 3820)
npm run build      # 타입 체크 + 프로덕션 빌드
npm run lint       # oxlint → eslint 순서로 lint + auto-fix
npm run format     # Prettier 포맷
```

## 아키텍처

### 인증 및 라우팅 흐름

라우터(`src/router/index.ts`)가 Supabase 세션을 직접 확인하여 네비게이션 가드를 처리한다.

- `/` → `LoginView` (공개)
- `/goalSettings` → 로그인 필요 (`requiresAuth`)
- `/dashboard`, `/portfolio` → 로그인 + 목표 설정 완료 필요 (`requiresGoal`)

`requiresGoal` 가드는 `investment_goals` 테이블에서 사용자 레코드를 조회하고, 없으면 `/goalSettings`로 리다이렉트한다.

### 백엔드 연동

- **Supabase** (`src/services/supabase.ts`): 단일 클라이언트 인스턴스를 export하여 앱 전체에서 공유
- **Edge Functions**: `stock-price`, `exchange-rate`, `etf-info`, `etf-backtest`, `etf-dividend`, `admin-delete-user`, `admin-reset-password` 총 7개. 상세 내용은 **EDGE_FUNCTIONS.md** 참고 (새 세션 시작 시 함께 읽을 것)
- **DB 트리거 / RPC / pg_cron**: `TABLE.md` 참고

### 환경 변수

`.env` 파일에 아래 두 값이 필요하다:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Supabase 테이블 스키마

**TABLE.md** 파일 참고. 새 세션 시작 시 함께 읽을 것.

### 공통 패턴

- **스낵바 알림**: `src/composables/useSnackbar.ts`의 `showMessage(text, color)` 함수를 직접 import해서 사용 (Pinia 스토어가 아닌 모듈 레벨 ref)
- **테마**: `src/composables/useAppTheme.ts`의 `useAppTheme()` - localStorage에 `my-investment-theme` 키로 저장, 초기값은 시스템 설정 따라감
- **티커 한글명**: `src/utils/tickerNames.ts`의 `TICKER_NAMES` 매핑 테이블 - 없는 티커는 그대로 표시
- **경로 alias**: `@` → `src/`

### 상태관리

Pinia를 사용하나 현재 `src/stores/counter.ts`는 템플릿 코드(미사용). 실제 앱 상태는 대부분 컴포넌트 로컬 또는 composable에서 관리된다.
