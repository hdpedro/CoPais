/**
 * Social Auth — Apple Sign-In (iOS) + Google Sign-In.
 *
 * Copilot audit fixes:
 * - Robust URL parsing for callback tokens
 * - Handle all edge cases (cancel, missing token, deep link failure)
 * - Apple uses signInWithIdToken (Supabase native)
 * - Google uses OAuth browser flow with proper URL extraction
 */

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// ── Apple Sign-In (iOS only) ──

export async function signInWithApple(): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS !== 'ios') return { success: false, error: 'Apple Sign-In disponivel apenas no iOS' };

  try {
    const AppleAuth = await import('expo-apple-authentication');

    // 1. Check device availability first — older simulators / family-sharing
    // edge cases can fail silently on `signInAsync`.
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

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      // Common Supabase errors mapped to actionable user messages. Most
      // production failures are "provider disabled" — Apple needs to be
      // enabled in Supabase Dashboard → Authentication → Providers → Apple,
      // with Client ID = `com.kindar.app` (Bundle ID) and a JWT secret
      // generated from the Apple .p8 key + Team ID + Key ID.
      const msg = error.message || '';
      if (/provider.*not.*enabled|provider.*disabled|provider.*configured|Unsupported.*provider/i.test(msg)) {
        return {
          success: false,
          error: 'Login com Apple indisponivel no momento. Use email/senha.',
        };
      }
      if (/audience|invalid.*token|invalid.*audience|aud/i.test(msg)) {
        return {
          success: false,
          error: 'Configuracao Apple desalinhada (Bundle ID). Use email/senha por enquanto.',
        };
      }
      return { success: false, error: msg };
    }
    return { success: true };
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

// ── Google Sign-In (all platforms) ──

/**
 * Extract tokens from Supabase OAuth callback URL.
 * Supabase returns tokens as URL fragment (#access_token=...&refresh_token=...)
 * or as query params depending on configuration.
 */
function extractTokensFromUrl(urlString: string): { accessToken: string | null; refreshToken: string | null } {
  try {
    // Try fragment first (most common for Supabase OAuth)
    const hashIdx = urlString.indexOf('#');
    if (hashIdx >= 0) {
      const fragment = urlString.substring(hashIdx + 1);
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken) return { accessToken, refreshToken };
    }

    // Try query params
    const url = new URL(urlString);
    return {
      accessToken: url.searchParams.get('access_token'),
      refreshToken: url.searchParams.get('refresh_token'),
    };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
}

export async function signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
  // Platform rule: Google Sign-In is the Android/Web path. On iOS we use
  // Apple Sign-In exclusively — refuse here as defense-in-depth against UI
  // regressions that might expose the Google button on iOS.
  if (Platform.OS === 'ios') {
    return { success: false, error: 'Google Sign-In indisponivel no iOS — use Apple' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'kindar://auth/callback',
        skipBrowserRedirect: true,
      },
    });

    if (error) return { success: false, error: error.message };
    if (!data.url) return { success: false, error: 'URL de auth nao gerada' };

    // Open in system browser
    const WebBrowser = await import('expo-web-browser');
    const result = await WebBrowser.openAuthSessionAsync(data.url, 'kindar://auth/callback');

    if (result.type !== 'success' || !result.url) {
      return { success: false, error: 'Login cancelado' };
    }

    // Extract tokens from callback URL
    const { accessToken, refreshToken } = extractTokensFromUrl(result.url);

    if (!accessToken) {
      return { success: false, error: 'Token de acesso nao encontrado na resposta. Verifique a configuracao do deep link.' };
    }

    if (!refreshToken) {
      return { success: false, error: 'Refresh token nao encontrado. Tente novamente.' };
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) return { success: false, error: sessionError.message };
    return { success: true };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.message?.includes('cancel') || err.message?.includes('dismiss')) {
      return { success: false, error: 'Login cancelado' };
    }
    return { success: false, error: err.message || 'Erro no Google Sign-In' };
  }
}
