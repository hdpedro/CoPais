/**
 * Analise da Semana — delega para /semana do PWA via WebView.
 *
 * UX refatorada (v1.1.23): PWAWebView shared component com back button
 * flutuante. Sem mais header nativo + PWA duplicados.
 */

import PWAWebView from '../../src/components/PWAWebView';

export default function SemanaScreen() {
  return <PWAWebView path="/semana" />;
}
