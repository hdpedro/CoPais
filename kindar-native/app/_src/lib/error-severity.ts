/**
 * Classificação de severidade pra erros transientes / não-acionáveis.
 *
 * Fonte ÚNICA de verdade pra "esse throw é ruído transiente que NÃO deve
 * disparar alarme vermelho (Discord)?". Antes a regex vivia inline e duplicada:
 * `services/push-setup.ts` rebaixa `TypeError: Network request failed` pra
 * 'info', mas cada hook de fetch novo reinventava (ou esquecia) a mesma regra.
 * O `useDashboard.loadData` esquecia — falha de rede pura subia como 'error' e
 * acordava o Discord à toa (evento real 17/jun, user offline).
 *
 * `/api/log-error` só pula o ping do Discord quando `severity === 'info'`
 * (ver `DEV/src/app/api/log-error/route.ts`). Logo 'info' = telemetria
 * queryável em `app_errors` SEM falso-alarme.
 */
import type { Severity } from './error-reporter';

/**
 * Retorna `'info'` para condições conhecidas de rede/serviço/device que somem
 * sozinhas (re-tenta no próximo foreground / device sai do offline) e NÃO são
 * bug de código; `null` quando o erro não é reconhecido como transiente — aí o
 * caller decide a severidade (tipicamente `'error'`).
 *
 * Cobertura (transientes "sempre info", independem do binário):
 *  - `TimeoutError` (do `with-timeout`): a operação estourou o teto. Detectado
 *    por `name` pra não acoplar a classe a este módulo.
 *  - `TypeError: Network request failed`: o fetch do RN abortou na camada de
 *    rede (app offline / flaky / conexão resetada) antes de qualquer resposta.
 *    Só conta quando é `TypeError` — paridade com `push-setup.ts`.
 *  - FCM device/serviço (Android): `TOO_MANY_REGISTRATIONS` (teto de tokens do
 *    aparelho) e `SERVICE_NOT_AVAILABLE` (FCM/rede fora no momento).
 *
 * NÃO cobre os casos do push que dependem do binário (Firebase não-init /
 * credencial faltando — só 'info' em vc<37); esses seguem em `push-setup.ts`
 * com o gate de `buildVersion`. Quando esse gate e este helper convergirem,
 * push-setup pode chamar `transientSeverity()` pros casos comuns e manter só
 * o gate de binário próprio.
 */
export function transientSeverity(error: unknown): Severity | null {
  // Timeout do with-timeout — `name` evita importar a classe (e cobre callers
  // que não pré-filtram TimeoutError antes de reportar).
  if (error instanceof Error && error.name === 'TimeoutError') return 'info';

  const msg = error instanceof Error ? error.message : String(error);

  // Falha de rede pura do fetch RN — transiente, re-tenta no próximo foreground.
  if (error instanceof TypeError && /network request failed/i.test(msg)) return 'info';

  // Condição do aparelho/serviço FCM (Android) — some sozinha.
  if (/TOO_MANY_REGISTRATIONS|SERVICE_NOT_AVAILABLE/i.test(msg)) return 'info';

  return null;
}
