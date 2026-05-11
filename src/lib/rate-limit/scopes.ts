/**
 * Scopes do rate limiter + helper pra construir chaves híbridas (user + IP).
 *
 * Convenção de chave:
 *   - "user:<uuid>:<scope>"  — limite por usuário autenticado
 *   - "ip:<sha256>:<scope>"  — limite por IP (hash com salt em IP_SALT env)
 *
 * Quando um request precisa ser checked, chama `rateLimitCheck` (postgres.ts)
 * para AMBAS as chaves em paralelo e aplica a mais restritiva. Limite de IP
 * é 2× o de user pra acomodar família compartilhando Wi-Fi.
 *
 * Limites em src/lib/rate-limit/postgres.ts:rateLimitCheckScope.
 */

export type RateLimitScope =
  | "preview-image"
  | "download-file"
  | "download-file-hour"
  | "heavy-export"
  | "api-global"
  | "auth-sensitive"
  | "ai-assistant";

export interface RateLimitRule {
  scope: RateLimitScope;
  /** Limite por user_id em um window. */
  userMax: number;
  /** Limite por IP — costuma ser 2× userMax pra NAT/famílias. */
  ipMax: number;
  /** Janela em segundos. */
  windowSec: number;
}

/**
 * Tabela canônica de limites. Mudar aqui = mudar pra todos os callers.
 * Racional documentado no plano `o-que-acha-quando-enchanted-eagle.md`.
 */
export const RATE_LIMITS: Record<RateLimitScope, RateLimitRule> = {
  // Thumbs / avatars em listagem — frequência alta legítima.
  "preview-image": { scope: "preview-image", userMax: 60, ipMax: 120, windowSec: 60 },

  // Download completo de doc/recibo — fluxo baixa frequência.
  "download-file": { scope: "download-file", userMax: 10, ipMax: 20, windowSec: 60 },

  // Segunda camada: drenagem sustentada por hora.
  "download-file-hour": { scope: "download-file-hour", userMax: 50, ipMax: 100, windowSec: 3600 },

  // Exports pesados — chat export, relatórios mensais, dumps.
  "heavy-export": { scope: "heavy-export", userMax: 3, ipMax: 6, windowSec: 60 },

  // Teto geral aplicado pelo middleware em qualquer /api/*.
  "api-global": { scope: "api-global", userMax: 200, ipMax: 400, windowSec: 60 },

  // Rotas sensíveis (auth, billing, IAP). Burst baixo.
  "auth-sensitive": { scope: "auth-sensitive", userMax: 10, ipMax: 20, windowSec: 60 },

  // AI assistant — Groq tem 30 rpm, fica em 20 pra folga.
  "ai-assistant": { scope: "ai-assistant", userMax: 20, ipMax: 40, windowSec: 60 },
};

export interface KeyPair {
  /** Chave user-bound. Null quando não houver userId (rota pública). */
  userKey: string | null;
  /** Chave IP-bound. Null quando ipHash for null (server-to-server/cron). */
  ipKey: string | null;
}

/**
 * Constrói o par de chaves pra uma combinação user + ip + scope. Pelo menos
 * uma das chaves precisa existir, senão o caller não deveria ter chamado o
 * rate limiter (rota não-identificada).
 */
export function buildKeys(
  userId: string | null,
  ipHash: string | null,
  scope: RateLimitScope,
): KeyPair {
  return {
    userKey: userId ? `user:${userId}:${scope}` : null,
    ipKey: ipHash ? `ip:${ipHash}:${scope}` : null,
  };
}
