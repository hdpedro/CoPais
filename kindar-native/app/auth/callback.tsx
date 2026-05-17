/**
 * OAuth callback handler — kindar://auth/callback
 *
 * When a deep link hits this route (Google/Supabase email recovery), parse
 * access/refresh tokens from the URL (fragment or query) and establish the
 * Supabase session, then redirect into the app.
 *
 * Most OAuth flows complete inside expo-web-browser's openAuthSessionAsync
 * (see src/services/social-auth.ts). This route is the defense-in-depth
 * fallback for cases where the deep link reaches the app directly.
 */
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from 'src/lib/supabase';
import { colors, spacing, font } from 'src/design-system/tokens';

function extractTokensFromUrl(urlString: string): { accessToken: string | null; refreshToken: string | null; errorCode: string | null } {
  try {
    const hashIdx = urlString.indexOf('#');
    if (hashIdx >= 0) {
      const fragment = urlString.substring(hashIdx + 1);
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const errorCode = params.get('error') || params.get('error_code');
      if (accessToken || errorCode) return { accessToken, refreshToken, errorCode };
    }
    const url = new URL(urlString);
    return {
      accessToken: url.searchParams.get('access_token'),
      refreshToken: url.searchParams.get('refresh_token'),
      errorCode: url.searchParams.get('error') || url.searchParams.get('error_code'),
    };
  } catch {
    return { accessToken: null, refreshToken: null, errorCode: null };
  }
}

export default function AuthCallback() {
  const params = useLocalSearchParams<{ access_token?: string; refresh_token?: string; error?: string }>();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        let accessToken = params.access_token || null;
        let refreshToken = params.refresh_token || null;
        let errorCode: string | null = params.error || null;

        // Also look at the raw URL for fragment-encoded tokens (Supabase default)
        if (!accessToken) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            const extracted = extractTokensFromUrl(initialUrl);
            accessToken = accessToken || extracted.accessToken;
            refreshToken = refreshToken || extracted.refreshToken;
            errorCode = errorCode || extracted.errorCode;
          }
        }

        if (errorCode) {
          setErrorMsg(`Erro no login: ${errorCode}`);
          setStatus('error');
          setTimeout(() => router.replace('/auth/login'), 1500);
          return;
        }

        if (!accessToken || !refreshToken) {
          setErrorMsg('Tokens de autenticação não encontrados.');
          setStatus('error');
          setTimeout(() => router.replace('/auth/login'), 1500);
          return;
        }

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setErrorMsg(error.message);
          setStatus('error');
          setTimeout(() => router.replace('/auth/login'), 1500);
          return;
        }

        // Success — route guard in root layout will take over after session fires
        router.replace('/');
      } catch (e: unknown) {
        const err = e as { message?: string };
        setErrorMsg(err.message || 'Erro inesperado no callback');
        setStatus('error');
        setTimeout(() => router.replace('/auth/login'), 1500);
      }
    })();
  }, [params.access_token, params.refresh_token, params.error]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={{ fontSize: font.sizes.md, color: colors.text, marginTop: spacing.lg, textAlign: 'center' }}>
        {status === 'processing' ? 'Finalizando login...' : errorMsg || 'Falha na autenticacao'}
      </Text>
    </View>
  );
}
