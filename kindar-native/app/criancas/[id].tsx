/**
 * Child Detail — delega para /criancas/[id] do PWA via WebView.
 *
 * UX refatorada (v1.1.23): usa PWAWebView shared component com back button
 * flutuante estilo iOS + ?native=1 que faz PWA esconder sidebar/header.
 * Sem mais header duplicado (nativo + PWA juntos).
 */

import { useLocalSearchParams, router } from 'expo-router';
import { type WebViewNavigation } from 'react-native-webview';
import PWAWebView from '../../src/components/PWAWebView';

export default function ChildDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  function handleNavChange(nav: WebViewNavigation) {
    // Se usuario voltar pra lista de criancas (ex: apos deletar), fecha o WebView
    try {
      const path = new URL(nav.url || '').pathname;
      if (path === '/criancas' && !path.includes(id || '')) {
        setTimeout(() => router.back(), 250);
      }
    } catch { /* ignore */ }
  }

  return <PWAWebView path={`/criancas/${id}`} onNavChange={handleNavChange} />;
}
