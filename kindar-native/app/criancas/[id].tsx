/**
 * Child Detail — delega para a pagina PWA /criancas/[id] via WebView.
 *
 * A pagina PWA tem 964 LOC com tabs ricas (Info / Saude / Educacao /
 * Documentos), edit forms per-tab, upload de documentos, growth charts,
 * listas de medicamentos/vacinas, etc. Reimplementar tudo nativo custa
 * esforco desproporcional ao ganho. Estrategia: reusar a pagina PWA
 * injetando a sessao Supabase no localStorage do WebView para auto-login.
 *
 * Mirrors the approach used for /calendario/novo.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, font } from '../../src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jquaysfeeuwvoydsgssi.supabase.co';
const SUPABASE_PROJECT_REF = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

export default function ChildDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [sessionPayload, setSessionPayload] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setFatalError('Sessao expirada. Abra fora do app para continuar.');
        return;
      }
      setSessionPayload(JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      }));
    })();
  }, []);

  function openInBrowser() {
    Linking.openURL(`${WEB_URL}/criancas/${id}`).catch(() => {
      Alert.alert('Erro', 'Nao foi possivel abrir o navegador.');
    });
  }

  function handleNavChange(nav: WebViewNavigation) {
    // If user navigates away from this child detail (e.g. to /criancas list
    // after deleting) — close the webview.
    try {
      const path = new URL(nav.url || '').pathname;
      if (path === '/criancas' && !path.includes(id || '')) {
        setTimeout(() => router.back(), 250);
      }
    } catch {
      /* ignore */
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
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
        borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
          Detalhes da crianca
        </Text>
        <TouchableOpacity onPress={openInBrowser} hitSlop={8} style={{ padding: 8 }}>
          <Ionicons name="open-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {sessionPayload ? (
        <>
          <WebView
            ref={webviewRef}
            source={{ uri: `${WEB_URL}/criancas/${id}` }}
            injectedJavaScriptBeforeContentLoaded={injectedJS}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={handleNavChange}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            originWhitelist={['*']}
            decelerationRate="normal"
            style={{ flex: 1, backgroundColor: colors.bg }}
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
