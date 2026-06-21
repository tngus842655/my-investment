export const getErrorMessage = (code?: string) => {
  switch (code) {
    case 'invalid_credentials':
      return '가입되지 않은 계정이거나 비밀번호가 올바르지 않습니다.'

    case 'email_not_confirmed':
      return '이메일 인증 후 로그인해주세요.'

    case 'user_already_exists':
      return '이미 가입된 이메일입니다.'

    case 'weak_password':
      return '비밀번호는 6자 이상 입력해주세요.'

    case 'over_email_send_rate_limit':
      return '인증 메일 발송 횟수가 초과되었습니다. 잠시 후 다시 시도해주세요.'

    default:
      return '오류가 발생했습니다.'
  }
}
