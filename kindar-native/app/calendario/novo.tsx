/**
 * Novo Evento — delega para a pagina PWA /calendario/novo via WebView.
 *
 * Motivo: a pagina PWA tem 1167 LOC com features ricas (recorrencia
 * customizada, split de custody, approval workflow, screenshot, etc).
 * Portar tudo no native custa muito esforco por pouco ganho em UX.
 * Estrategia: reusar a pagina PWA injetando a sessao Supabase no
 * localStorage do WebView para que o usuario ja fique logado.
 *
 * Quando o usuario cria com sucesso o PWA redireciona para /calendario;
 * detectamos essa URL e voltamos para o native router.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, font } from '../../src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jquaysfeeuwvoydsgssi.supabase.co';

// Project ref = subdomain of the supabase URL (jquaysfeeuwvoydsgssi)
const SUPABASE_PROJECT_REF = SUPABASE_URL
  .replace('https://', '')
  .replace('.supabase.co', '');
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

export default function NovoEventoScreen() {
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [sessionPayload, setSessionPayload] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Grab the current session so we can bootstrap the WebView with an
  // authenticated Supabase instance — same project ref as the native app.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setFatalError('Sessao expirada. Abra fora do app para continuar.');
        return;
      }
      // Shape expected by supabase-js when reading from storage
      const payload = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      };
      setSessionPayload(JSON.stringify(payload));
    })();
  }, []);

  function openInBrowser() {
    Linking.openURL(`${WEB_URL}/calendario/novo`).catch(() => {
      Alert.alert('Erro', 'Nao foi possivel abrir o navegador.');
    });
  }

  function handleNavChange(nav: WebViewNavigation) {
    // PWA redirects to /calendario after successful save → close WebView
    const url = nav.url || '';
    try {
      const path = new URL(url).pathname;
      if (path === '/calendario' || path.startsWith('/calendario?')) {
        // Small delay so the redirect finishes rendering before we pop
        setTimeout(() => router.back(), 250);
      }
    } catch {
      // Invalid URL — ignore
    }
  }

  if (fatalError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: font.sizes.md, color: colors.text, textAlign: 'center', marginBottom: spacing.md }}>
          {fatalError}
        </Text>
        <TouchableOpacity
          onPress={openInBrowser}
          style={{ backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: 12 }}
        >
          <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
            Abrir no navegador
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Injected JS runs BEFORE the PWA's own JS. We write the Supabase session
  // into localStorage so the @supabase/supabase-js client picks it up on init.
  const injectedJS = sessionPayload
    ? `
      (function() {
        try {
          localStorage.setItem(${JSON.stringify(SUPABASE_STORAGE_KEY)}, ${JSON.stringify(sessionPayload)});
        } catch (e) { /* ignore */ }
        true;
      })();
    `
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {/* Header with close + reload + open-in-browser */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
        borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={{ padding: 8 }}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
          Novo evento
        </Text>
        <TouchableOpacity onPress={openInBrowser} hitSlop={8} style={{ padding: 8 }}>
          <Ionicons name="open-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {sessionPayload ? (
        <>
          <WebView
            ref={webviewRef}
            // Route via /native-bridge so the SSR browser client writes
            // auth cookies BEFORE middleware runs on the target page.
            source={{ uri: `${WEB_URL}/native-bridge?next=${encodeURIComponent('/calendario/novo')}` }}
            injectedJavaScriptBeforeContentLoaded={injectedJS}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={handleNavChange}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            originWhitelist={['*']}
            decelerationRate="normal"
            style={{ flex: 1, backgroundColor: colors.bg }}
            // iOS only — avoid weird bounce
            bounces={Platform.OS === 'ios'}
          />
          {loading ? (
            <View style={{ position: 'absolute', top: 80, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={colors.brand} />
            </View>
          ) : null}
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      )}
    </View>
  );
}
