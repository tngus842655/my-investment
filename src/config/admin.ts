export const ADMIN_EMAILS = ['tngus842655@gmail.com', 'tngus842655@naver.com']

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email)
