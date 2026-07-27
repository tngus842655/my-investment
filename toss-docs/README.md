# toss-docs

앱인토스 개발자센터 문서 사본. 개발자센터 도메인이 Claude 세션에서 차단되어 있어, 원문 URL 끝에
`.md`를 붙여 받은 파일을 그대로 보관한다. 각 파일 첫 줄의 frontmatter에 원본 URL이 들어 있다.

| 파일 | 원본 | 내용 |
| --- | --- | --- |
| `login-intro.md` | `/login/intro.md` | 토스 로그인 소개 + **콘솔 설정**(동의 항목, 약관 등록, 연결 끊기 콜백, 복호화 키) |
| `login-develop.md` | `/login/develop.md` | 토스 로그인 개발 가이드 (`appLogin`, 토큰 발급, `login-me`, 복호화, 연결 끊기) |
| `integration-process.md` | `/development/integration-process.md` | **mTLS 인증서 발급**, 방화벽 IP, API 공통 응답 규격, 요청 제한 |
| `user-hash-key-develop.md` | `/user-hash-key/develop.md` | 사용자 식별키 (`getAnonymousKey` / `getUserKeyForGame`) |
| `user-hash-key-migration.md` | `/user-hash-key/migration.md` | 토스 로그인 → 사용자 식별키 마이그레이션 (게임 미니앱 기준) |
| `tossauth-develop.md` | `/tossauth/develop.md` | 토스 인증(실명 본인확인). **별도 서비스로, 현재 계획과 무관** |
| `framework-version.md` | `/bedrock/reference/framework/환경 확인/version.md` | `getTossAppVersion` 등 버전 확인 |

프로모션 문서는 루트의 `tossPromotion_intro.md`에 있다 (TODO.md가 행 번호로 참조하고 있어 옮기지 않음).
