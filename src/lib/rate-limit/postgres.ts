/**
 * Wrapper TS pra função PL/pgSQL `check_and_increment_rate_limit`.
 *
 * Faz um round-trip pro Supabase com a chave + limite + janela. Para cada
 * scope avaliamos AMBAS as chaves (user + IP) em paralelo e devolvemos a
 * mais restritiva — assim atacante com várias contas no mesmo IP esbarra
 * no limite de IP.
 *
 * O kill switch `RATE_LIMIT_ENFORCED` é aplicado AQUI: quando desligado,
 * ainda rodamos os checks (audit log preservado) mas mascaramos
 * `allowed=true` no retorno. `RATE_LIMIT_IP_ENFORCED` ignora só a chave IP.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RATE_LIMITS,
  RateLimitScope,
  buildKeys,
} from "./scopes";
import {
  isRateLimitEnforced,
  isRateLimitIpEnforced,
} from "@/lib/feature-flags/rate-limit";

export interface RateLimitResult {
  /** True quando pelo menos uma chave permitiu E nenhuma negou (após flags). */
  allowed: boolean;
  /** Remaining = mínimo entre as chaves. */
  remaining: number;
  /** Retry-after em ms = máximo entre as chaves bloqueadas. */
  retryAfterMs: number;
  /** Strike count máximo entre as chaves (usado pra decidir alerta). */
  strikeCount: number;
  /** Qual chave causou o bloqueio (debug). */
  blockedBy: "user" | "ip" | "none";
  /** Snapshot das flags no momento do check (debug). */
  enforced: boolean;
}

interface RpcResult {
  allowed: boolean;
  remaining: number;
  retry_after_ms: number;
  blocked_until: string | null;
  strike_count: number;
}

async function callRpc(
  admin: SupabaseClient,
  key: string,
  max: number,
  windowSec: number,
  userId: string | null,
): Promise<RpcResult | null> {
  const { data, error } = await admin.rpc("check_and_increment_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_sec: windowSec,
    p_user_id: userId,
  });

  if (error) {
    console.error("[rate-limit] RPC error:", error.message, { key });
    // Fail-open: erro no Postgres NÃO deve travar o app. Audit log perde
    // este evento, mas alerta de Sentry pega via app_errors do RPC.
    return null;
  }

  // RPC retorna array com 1 row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return row as RpcResult;
}

/**
 * Roda o rate-limit pra um scope, considerando user + IP.
 *
 * Convenções:
 *   - userId null = rota não autenticada (caller deve ter motivo).
 *   - ipHash null = server-to-server/cron — pula chave de IP.
 *   - Quando ambos null → noop, retorna allowed=true (chamada inválida, mas
 *     fail-open).
 */
export async function rateLimitCheck(
  userId: string | null,
  ipHash: string | null,
  scope: RateLimitScope,
  adminOverride?: SupabaseClient,
): Promise<RateLimitResult> {
  const enforced = isRateLimitEnforced();
  const rule = RATE_LIMITS[scope];
  const admin = adminOverride ?? createAdminClient();

  const { userKey, ipKey } = buildKeys(userId, ipHash, scope);
  const ipEnforced = isRateLimitIpEnforced();

  const promises: Array<Promise<RpcResult | null>> = [];
  const meta: Array<"user" | "ip"> = [];

  if (userKey) {
    promises.push(callRpc(admin, userKey, rule.userMax, rule.windowSec, userId));
    meta.push("user");
  }
  if (ipKey && ipEnforced) {
    promises.push(callRpc(admin, ipKey, rule.ipMax, rule.windowSec, userId));
    meta.push("ip");
  }

  if (promises.length === 0) {
    return {
      allowed: true,
      remaining: rule.userMax,
      retryAfterMs: 0,
      strikeCount: 0,
      blockedBy: "none",
      enforced,
    };
  }

  const results = await Promise.all(promises);

  let allowed = true;
  let remaining = Infinity;
  let retryAfterMs = 0;
  let strikeCount = 0;
  let blockedBy: "user" | "ip" | "none" = "none";

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r) continue; // erro no RPC = fail-open pra essa chave
    if (!r.allowed) {
      allowed = false;
      if (r.retry_after_ms > retryAfterMs) {
        retryAfterMs = r.retry_after_ms;
        blockedBy = meta[i];
      }
    }
    if (r.remaining < remaining) remaining = r.remaining;
    if (r.strike_count > strikeCount) strikeCount = r.strike_count;
  }

  if (remaining === Infinity) remaining = rule.userMax;

  // Kill switch: se enforcement desligado, ainda computamos os contadores
  // (audit fica preservado) mas devolvemos allowed=true.
  if (!enforced) {
    return {
      allowed: true,
      remaining,
      retryAfterMs: 0,
      strikeCount,
      blockedBy: "none",
      enforced: false,
    };
  }

  return {
    allowed,
    remaining: Math.max(0, remaining),
    retryAfterMs,
    strikeCount,
    blockedBy,
    enforced,
  };
}

/**
 * Helper: monta os headers padronizados que o handler retorna no 429.
 */
export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.retryAfterMs / 1000)),
    "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
  };
}
