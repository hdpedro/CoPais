/**
 * withTimeout — Promise.race com TimeoutError + telemetria.
 *
 * Motivo: hooks de fetch da UI (useDashboard, useCalendar, useHealth) usam
 * `await Promise.all([supabase.from(...)...])`. Supabase queries normalmente
 * RESOLVEM com `{ data, error }` ao falhar — nao rejeitam. Mas em algumas
 * condicoes (TLS handshake travado, token expirado em refresh storm, DNS
 * lento no Android) a request pendura indefinidamente e o user fica preso
 * em "Carregando..." pra sempre (bug 2026-05-11 — Aline, Android #11).
 *
 * Envolva Promise.all em withTimeout(p, 15_000, 'useDashboard:queries') pra
 * garantir que o hook sempre termina. O TimeoutError eh capturado pelo
 * try/catch do caller — o finally chama setLoading(false) e a tela mostra
 * skeleton/empty state em vez de bloquear.
 */

import { reportError } from './error-reporter';

export class TimeoutError extends Error {
  constructor(public readonly label: string, public readonly ms: number) {
    super(`Timeout (${ms}ms): ${label}`);
    this.name = 'TimeoutError';
  }
}

// Aceita PromiseLike pq o query builder do Supabase implementa thenable
// (com .then) mas nao tem .catch/.finally — TS reclama se pedirmos Promise.
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); });
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      const err = new TimeoutError(label, ms);
      reportError(err, { severity: 'warning', filePath: `with-timeout:${label}` }).catch(() => {});
      reject(err);
    }, ms);
  });
  return Promise.race([wrapped, timeout]);
}
