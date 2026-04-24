/**
 * Documentos — delega para /documentos do PWA via WebView.
 *
 * UX refatorada (v1.1.23): PWAWebView shared component. Usuario ve direto
 * o DocumentsDashboard do PWA (filtros, preview, upload) sem header duplicado.
 */

import PWAWebView from '../../src/components/PWAWebView';

export default function DocumentosScreen() {
  return <PWAWebView path="/documentos" />;
}
