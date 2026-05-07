/**
 * Biometric Lock — Face ID / Touch ID via expo-local-authentication.
 *
 * Padrao usado por WhatsApp, apps bancarios, 1Password.
 * - hasHardware: dispositivo tem sensor biometrico
 * - isEnrolled: usuario cadastrou Face ID/Touch ID nos ajustes do iOS
 * - authenticate: dispara o prompt nativo + retorna sucesso/erro
 *
 * Fallback: se biometria falhar 3x, iOS oferece automaticamente a senha
 * do dispositivo (LocalAuthentication.disableDeviceFallback=false).
 */
import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricKind = 'faceId' | 'touchId' | 'iris' | 'none';

export interface BiometricCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  kind: BiometricKind;
  /** Label legivel pra UI: "Face ID" / "Touch ID" / "Reconhecimento de iris" */
  label: string;
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const [hasHardware, isEnrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  let kind: BiometricKind = 'none';
  let label = 'Biometria';

  // Ordem de preferencia: Face ID > Touch ID > iris (Android)
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    kind = 'faceId';
    label = 'Face ID';
  } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    kind = 'touchId';
    label = 'Touch ID';
  } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    kind = 'iris';
    label = 'Reconhecimento de íris';
  }

  return { hasHardware, isEnrolled, kind, label };
}

export interface AuthenticateResult {
  success: boolean;
  /** Codigo do erro (`user_cancel`, `system_cancel`, `user_fallback`, `lockout`, etc).
   *  Vem do expo-local-authentication. So definido se success=false. */
  error?: string;
}

/**
 * Dispara o prompt biometrico nativo. Bloqueia ate o usuario autorizar
 * ou cancelar. NAO chama de dentro de useEffect sem control de
 * concorrencia — multipla chamada pode resultar em prompts empilhados.
 */
export async function authenticate(promptMessage: string = 'Desbloquear Kindar'): Promise<AuthenticateResult> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancelar',
      // disableDeviceFallback=false permite "Usar senha do iPhone" como
      // fallback quando Face ID falha 3x. Nivel banco.
      disableDeviceFallback: false,
      // requireConfirmation: pra Face ID nao precisar tocar duas vezes.
      // (Apenas Android — iOS ignora.)
      requireConfirmation: false,
    });
    if (r.success) return { success: true };
    return { success: false, error: 'error' in r && typeof r.error === 'string' ? r.error : 'cancel' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}
