/**
 * lock-telemetry.ts — telemetria centralizada do sistema de bloqueio
 * biométrico (lock store + LockGate component + LockScreen component).
 *
 * Centraliza:
 *   - Severity (sempre 'info' — não acorda Discord)
 *   - Filtro de alto volume (HIGH_VOLUME set) quando LOCK_VERBOSE=false
 *   - Source tag (lock/lockgate/lockscreen) no message + filePath
 *
 * Modo verbose é OFF por padrão. O instrumento detalhado foi crítico em
 * 2026-05-16/05-18 pra diagnosticar Face ID loop (commit `34188c9`); bug
 * resolvido e confirmado em prod. Manter logging detalhado em prod custa
 * ~3000 inserts/semana em `app_errors` sem entrega de valor diagnóstico
 * novo. Pra investigar regressão futura: trocar LOCK_VERBOSE=true + OTA.
 *
 * Eventos preservados (mesmo em modo normal) são DECISÕES raras com valor
 * diagnóstico real: RELOCK, requestUnlock.failure, cooldown, failsafe,
 * alreadyLocked, isAuthenticating, skip.in_flight.
 */

import { Platform } from 'react-native';
import { reportError } from './error-reporter';

/**
 * Telemetria só roda no iOS (loop de Face ID é específico do iOS;
 * Android não tem o mesmo problema arquitetural).
 */
const TELEMETRY_ENABLED = Platform.OS === 'ios';

/**
 * Verbose logging — quando true, registra TODOS os eventos (incluindo
 * transições esperadas). Mantenha false em produção; ligue em dev quando
 * investigar comportamento do lock biométrico.
 */
const LOCK_VERBOSE = false;

/**
 * Eventos de alto volume (transições esperadas, não-decisão). Silenciados
 * quando LOCK_VERBOSE=false. Lista derivada de medição em prod (7 dias):
 *   appstate.change       1371   transição esperada toda volta foreground
 *   requestUnlock.success   162   Face ID OK, caso comum
 *   requestUnlock.start     171   par com .finally, redundante
 *   requestUnlock.finally   169   ↑
 *   tryUnlock.start         171   par com .result, redundante
 *   tryUnlock.result        169   ↑
 *   markBackground.set      286   transição esperada toda ida pra background
 *   mount/unmount      172/167   ciclo do LockScreen, esperado
 *   skip.withinWindow       106   no-op feliz (dentro da janela)
 *   skip.grace_consumed     157   no-op feliz (cooldown consumido)
 *   skip.noBackground        70   no-op (cold start sem bg prévio)
 */
const HIGH_VOLUME: ReadonlySet<string> = new Set([
  // lock store (lock.ts)
  'requestUnlock.start',
  'requestUnlock.finally',
  'requestUnlock.success',
  'markBackground.set',
  'markBackground.skip.grace_consumed',
  'evaluateOnForeground.skip.grace_consumed',
  'evaluateOnForeground.skip.withinWindow',
  'evaluateOnForeground.skip.noBackground',
  // LockGate.tsx
  'appstate.change',
  // LockScreen.tsx
  'mount',
  'unmount',
  'tryUnlock.start',
  'tryUnlock.result',
]);

type LockSource = 'lock' | 'lockgate' | 'lockscreen';

const FILE_PATHS: Record<LockSource, string> = {
  lock: 'app/_src/store/lock.ts',
  lockgate: 'app/_src/components/LockGate.tsx',
  lockscreen: 'app/_src/components/LockScreen.tsx',
};

/**
 * Loga um evento de telemetria do sistema de lock. Idempotente per-call;
 * filtragem por volume é decidida aqui, callers nunca precisam saber.
 */
export function logLockTelemetry(
  source: LockSource,
  event: string,
  extra?: Record<string, unknown>,
): void {
  if (!TELEMETRY_ENABLED) return;
  if (!LOCK_VERBOSE && HIGH_VOLUME.has(event)) return;
  const ts = Date.now();
  reportError(new Error(`[${source}] ${event} @ ${ts}`), {
    severity: 'info',
    filePath: FILE_PATHS[source],
    metadata: { event, ts, ...(extra ?? {}) },
  });
}

/**
 * Test-only: expõe lista de eventos high-volume e flag verbose pra unit
 * tests assertarem comportamento sem mock global.
 */
export const __internals = {
  HIGH_VOLUME,
  LOCK_VERBOSE,
  TELEMETRY_ENABLED,
};
