/* ------------------------------------------------------------------ */
/* ai/rate-limit.ts                                                    */
/*                                                                     */
/* Wrapper de compatibilidade pro rate-limiter de AI assistant.        */
/* Desde a migration 077, delega pro `rateLimitCheck` Postgres-backed  */
/* (scope `ai-assistant`) que é distribuído entre Vercel instances e   */
/* persistente entre deploys.                                          */
/*                                                                     */
/* A classe `AIRateLimiter` continua exportada com a mesma forma in-   */
/* memory pra callers que precisam de uma chave fora de user_id (ex.:  */
/* `waRateLimiter` em whatsapp/processor.ts usa phone number como key  */
/* num webhook não-autenticado). Migrar esses callers caso a caso.     */
/* ------------------------------------------------------------------ */

import { rateLimitCheck } from "@/lib/rate-limit/postgres";

interface RateLimitBucket {
  timestamps: number[];
}

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 20;

/**
 * In-memory sliding window. Mantida pra callers fora de auth (webhook
 * WhatsApp por phone number, processamento em background).
 *
 * NÃO usar pra rotas autenticadas — `rateLimitCheck` (Postgres) é
 * distribuído e persistente.
 */
export class AIRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private windowMs: number;
  private maxRequests: number;

  constructor(
    windowMs = DEFAULT_WINDOW_MS,
    maxRequests = DEFAULT_MAX_REQUESTS,
  ) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(key: string): {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
  } {
    const now = Date.now();
    const bucket = this.buckets.get(key) || { timestamps: [] };

    bucket.timestamps = bucket.timestamps.filter(
      (ts) => now - ts < this.windowMs,
    );

    if (bucket.timestamps.length >= this.maxRequests) {
      const oldestInWindow = bucket.timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, this.windowMs - (now - oldestInWindow)),
      };
    }

    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);

    return {
      allowed: true,
      remaining: this.maxRequests - bucket.timestamps.length,
      retryAfterMs: 0,
    };
  }

  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, bucket] of this.buckets) {
      bucket.timestamps = bucket.timestamps.filter(
        (ts) => now - ts < this.windowMs,
      );
      if (bucket.timestamps.length === 0) {
        this.buckets.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  get userCount(): number {
    return this.buckets.size;
  }
}

/**
 * Checa rate-limit do AI assistant pra um usuário autenticado.
 * Delega pro `rateLimitCheck` Postgres (scope `ai-assistant` = 20/min user).
 *
 * Async — callers existentes precisam adicionar `await`.
 */
export const aiRateLimiter = {
  async check(userId: string, ipHash: string | null = null): Promise<{
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
  }> {
    const result = await rateLimitCheck(userId, ipHash, "ai-assistant");
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      retryAfterMs: result.retryAfterMs,
    };
  },
};
