/**
 * PWAWebView — componente compartilhado pra renderizar paginas PWA em WebView
 * com aparencia native. Substitui 4 copies quase-identicas em:
 *   - app/criancas/[id].tsx
 *   - app/calendario/novo.tsx
 *   - app/semana/index.tsx
 *   - app/documentos/index.tsx
 *
 * UX:
 *   - SEM header duplicado. Back button flutuante estilo iOS no canto superior
 *     esquerdo, com backdrop blur. Swipe-back gesture do Stack funciona normal.
 *   - Fundo branco pra nao "piscar" entre o bege native e o branco do PWA.
 *   - Skeleton discreto enquanto WebView carrega (nao um spinner enorme).
 *   - URL usa /native-bridge?next=<path>&native=1 — o bridge le a sessao do
 *     localStorage, escreve cookies via SSR browser client, e marca
 *     sessionStorage pra ResponsiveShell esconder sidebar/header no PWA.
 *
 * Props:
 *   - path: destino PWA (ex: '/criancas/abc-123'). Sem WEB_URL prefix.
 *   - onNavChange (opcional): callback pra detectar URLs especificas (ex:
 *     voltar quando usuario completa uma acao e PWA redireciona).
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, font } from '../design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jquaysfeeuwvoydsgssi.supabase.co';
const SUPABASE_PROJECT_REF = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

export interface PWAWebViewProps {
  /** Destino PWA, ex: '/criancas/abc-123'. Sem prefix WEB_URL. */
  path: string;
  /** Callback quando a URL do WebView muda (permite fechar automaticamente). */
  onNavChange?: (nav: WebViewNavigation) => void;
}

export default function PWAWebView({ path, onNavChange }: PWAWebViewProps) {
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [sessionPayload, setSessionPayload] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setFatalError('Sessao expirada. Feche e abra o app novamente.');
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

  // Route via /native-bridge — escreve cookies antes do middleware.
  // &native=1 no destino faz o ResponsiveShell do PWA esconder o shell.
  const bridgeUrl = `${WEB_URL}/native-bridge?next=${encodeURIComponent(path)}`;

  const injectedJS = sessionPayload
    ? `
      (function() {
        try {
          localStorage.setItem(${JSON.stringify(SUPABASE_STORAGE_KEY)}, ${JSON.stringify(sessionPayload)});
          sessionStorage.setItem('kindar-native-webview', '1');
        } catch (e) { /* ignore */ }
        true;
      })();
    `
    : '';

  if (fatalError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: font.sizes.md, color: colors.text, textAlign: 'center', marginBottom: spacing.md }}>
          {fatalError}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md }}
        >
          <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
            Voltar
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* WebView ocupa a tela inteira — fundo branco evita flash
          entre o bege do native e o branco do PWA */}
      {sessionPayload ? (
        <WebView
          ref={webviewRef}
          source={{ uri: bridgeUrl }}
          injectedJavaScriptBeforeContentLoaded={injectedJS}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={onNavChange}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          originWhitelist={['*']}
          decelerationRate="normal"
          style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}
          bounces={Platform.OS === 'ios'}
          // Perf: limita o scroll a 1 direcao na maioria dos casos
          allowsBackForwardNavigationGestures={false}
        />
      ) : null}

      {/* Back button flutuante estilo iOS — canto superior esquerdo,
          sobreposto ao conteudo com backdrop blur. Nunca tem header
          duplicado com o do PWA. */}
      <TouchableOpacity
        onPress={() => router.back()}
        activeOpacity={0.75}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 12,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: 'rgba(255,255,255,0.92)',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
          borderWidth: 0.5,
          borderColor: 'rgba(0,0,0,0.06)',
        }}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </TouchableOpacity>

      {/* Skeleton discreto enquanto carrega — centro tela, sem texto grande */}
      {loading && sessionPayload ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      ) : null}

      {/* Enquanto a session nao carregou ainda, mostra spinner fino */}
      {!sessionPayload ? (
        <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      ) : null}
    </View>
  );
}
