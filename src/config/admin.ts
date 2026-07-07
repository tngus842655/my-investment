export const ADMIN_EMAILS = ['tngus842655@gmail.com']

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email)
