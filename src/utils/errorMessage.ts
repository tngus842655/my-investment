// Supabase 인증 에러 코드 → i18n 메시지 키. 호출부에서 t()로 번역한다.
export const getErrorMessageKey = (code?: string): string => {
  switch (code) {
    case 'invalid_credentials':
      return 'auth.errors.invalidCredentials'

    case 'email_not_confirmed':
      return 'auth.errors.emailNotConfirmed'

    case 'user_already_exists':
      return 'auth.errors.userAlreadyExists'

    case 'weak_password':
      return 'auth.errors.weakPassword'

    case 'over_email_send_rate_limit':
      return 'auth.errors.overEmailSendRateLimit'

    default:
      return 'auth.errors.generic'
  }
}
