/**
 * Translate Supabase auth error messages to Portuguese.
 * Mirrors PWA `src/actions/auth.ts:translateAuthError` so users see the
 * same wording on web and native — the previous implementation leaked
 * raw English error strings on forgot-password / reset-password screens.
 */
export function translateAuthError(message: string | undefined | null): string {
  if (!message) return 'Erro inesperado.';
  const translations: Record<string, string> = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed': 'E-mail ainda não confirmado. Verifique sua caixa de entrada.',
    'User already registered': 'Este e-mail já está cadastrado.',
    'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
    'New password should be different from the old password.':
      'A nova senha deve ser diferente da senha atual.',
    'Auth session missing!': 'Sessão expirada. Faça login novamente.',
    'User not found': 'Usuário não encontrado.',
    'Email rate limit exceeded': 'Muitas tentativas. Aguarde alguns minutos.',
    'For security purposes, you can only request this once every 60 seconds':
      'Por segurança, aguarde 60 segundos entre tentativas.',
    'Invalid email': 'E-mail inválido.',
    'Email link is invalid or has expired':
      'Link inválido ou expirado. Solicite um novo.',
    'Token has expired or is invalid':
      'Token expirado ou inválido. Solicite um novo link.',
    'Signups not allowed for otp': 'Cadastro por OTP não permitido.',
  };
  return translations[message] || message;
}
