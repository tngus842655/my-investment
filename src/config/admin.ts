export const ADMIN_EMAILS = ['tngus842655@gmail.com']

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email)

// 가계부(비공개 기능) 미리보기를 허용할 이메일 — 관리자 권한과는 무관
export const BUDGET_PREVIEW_EMAILS = ['tngus842655@gmail.com', 'tngus842655@naver.com']

export const isBudgetPreviewAllowed = (email?: string | null): boolean =>
  !!email && BUDGET_PREVIEW_EMAILS.includes(email)
