/**
 * Social Auth — Apple Sign-In (iOS) + Google Sign-In (iOS native).
 *
 * 2026-04-29 rewrite: switched from `supabase.auth.signInWithIdToken`
 * (which depends on the Supabase Dashboard's Apple/Google providers
 * being configured) to a custom backend flow that mirrors GripFlow:
 *
 *   1. Native obtains the upstream `idToken`:
 *        - Apple: `expo-apple-authentication` → identityToken
 *        - Google: `expo-auth-session/providers/google` → id_token
 *   2. Native POSTs the token to the PWA backend
 *      (`/api/auth/{apple,google}-native`)
 *   3. Backend verifies the JWT against the upstream JWKS, finds/creates
 *      the Supabase user, and mints a session via the magiclink+verifyOtp
 *      pattern.
 *   4. Native receives `{access_token, refresh_token}` and calls
 *      `supabase.auth.setSession(...)` to log in.
 *
 * This eliminates the dependency on Supabase's provider config — works
 * regardless of whether Apple/Google are enabled there.
 */

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

// iOS Google OAuth Client ID (matches the reversed scheme registered in
// app.json → ios.infoPlist.CFBundleURLTypes). Must match the audience the
// backend's `/api/auth/google-native` accepts.
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  || '855915326367-eiinspdtmmf3u63sfj4kj8ghn2d6p7ie.apps.googleusercontent.com';

interface BackendSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user_id: string;
  is_new?: boolean;
}

async function postToBackend(path: string, body: Record<string, unknown>): Promise<BackendSession> {
  const res = await fetch(`${WEB_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* */ }
  if (!res.ok) {
    const reason = (json.reason as string) || (json.error as string) || `http_${res.status}`;
    throw new Error(reason);
  }
  return json as unknown as BackendSession;
}

async function applyBackendSession(s: BackendSession): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.auth.setSession({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Apple Sign-In (iOS only) ────────────────────────────────────────────────
export async function signInWithApple(): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS !== 'ios') {
    return { success: false, error: 'Apple Sign-In disponivel apenas no iOS' };
  }

  try {
    const AppleAuth = await import('expo-apple-authentication');

    const isAvailable = await AppleAuth.isAvailableAsync();
    if (!isAvailable) {
      return {
        success: false,
        error: 'Apple Sign-In indisponivel neste dispositivo. Verifique se o iCloud esta logado.',
      };
    }

    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return {
        success: false,
        error: 'Token Apple nao recebido. Tente sair e entrar novamente no iCloud.',
      };
    }

    const fullName = credential.fullName
      ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
      : undefined;

    let session: BackendSession;
    try {
      session = await postToBackend('/api/auth/apple-native', {
        idToken: credential.identityToken,
        email: credential.email || undefined,
        name: fullName || undefined,
      });
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('missing_email')) {
        return {
          success: false,
          error: 'Apple só envia email no primeiro login. Tente "Esqueci a senha" ou cadastre por email.',
        };
      }
      return { success: false, error: `Falha no servidor: ${msg}` };
    }

    return applyBackendSession(session);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'ERR_REQUEST_CANCELED' || err.code === 'ERR_CANCELED') {
      return { success: false, error: 'Cancelado' };
    }
    if (err.code === 'ERR_REQUEST_NOT_HANDLED') {
      return {
        success: false,
        error: 'Apple Sign-In nao configurado no app. Reinstale a versao mais recente.',
      };
    }
    return { success: false, error: err.message || 'Erro no Apple Sign-In' };
  }
}

// ── Google Sign-In (iOS native via expo-auth-session) ───────────────────────
//
// React hook style is not exported from this module — `expo-auth-session`'s
// `useIdTokenAuthRequest` is a hook and must live inside a component.
// We expose `getGoogleIdTokenIos()` that components call after the hook
// returns success.
//
// Recommended UI pattern in the login screen:
//   const [, gResp, prompt] = Google.useIdTokenAuthRequest({ iosClientId: GOOGLE_IOS_CLIENT_ID });
//   useEffect(() => {
//     if (gResp?.type === 'success' && gResp.params?.id_token) {
//       signInWithGoogleToken(gResp.params.id_token);
//     }
//   }, [gResp]);
//   <Button onPress={() => prompt()} ... />

export const GOOGLE_IOS_CLIENT_ID_EXPORTED = GOOGLE_IOS_CLIENT_ID;

/**
 * Exchange a Google id_token (obtained via expo-auth-session in the UI
 * layer) for a Supabase session via the backend.
 */
export async function signInWithGoogleToken(idToken: string): Promise<{ success: boolean; error?: string }> {
  if (!idToken) {
    return { success: false, error: 'Google nao retornou id_token' };
  }
  let session: BackendSession;
  try {
    session = await postToBackend('/api/auth/google-native', { idToken });
  } catch (err) {
    return { success: false, error: `Falha no servidor: ${(err as Error).message}` };
  }
  return applyBackendSession(session);
}

/**
 * @deprecated Use `useIdTokenAuthRequest` + `signInWithGoogleToken` from a
 * component instead. Kept only so existing call sites (e.g. screens that
 * imported the old browser-flow function) keep typechecking. They will
 * receive an explanatory error and prompt for migration.
 */
export async function signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error: 'Google Sign-In foi migrado pro fluxo nativo. Atualize a tela de login pra usar useIdTokenAuthRequest + signInWithGoogleToken.',
  };
}
