/**
 * Novo Evento — delega para /calendario/novo do PWA via WebView.
 *
 * UX refatorada (v1.1.23): PWAWebView shared component. Detecta quando o PWA
 * redireciona pra /calendario (= save success) e fecha o WebView automatico.
 */

import { router } from 'expo-router';
import { type WebViewNavigation } from 'react-native-webview';
import PWAWebView from '../../src/components/PWAWebView';

export default function NovoEventoScreen() {
  function handleNavChange(nav: WebViewNavigation) {
    const url = nav.url || '';
    try {
      const path = new URL(url).pathname;
      if (path === '/calendario' || path.startsWith('/calendario?')) {
        setTimeout(() => router.back(), 250);
      }
    } catch { /* ignore */ }
  }

  return <PWAWebView path="/calendario/novo" onNavChange={handleNavChange} />;
}
