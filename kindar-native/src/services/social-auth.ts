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

    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { success: false, error: 'Token Apple nao recebido' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    if (e.code === 'ERR_REQUEST_CANCELED' || e.code === 'ERR_CANCELED') {
      return { success: false, error: 'Cancelado' };
    }
    return { success: false, error: e.message || 'Erro no Apple Sign-In' };
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
  } catch (e: any) {
    if (e.message?.includes('cancel') || e.message?.includes('dismiss')) {
      return { success: false, error: 'Login cancelado' };
    }
    return { success: false, error: e.message || 'Erro no Google Sign-In' };
  }
}
