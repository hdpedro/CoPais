/**
 * Extrai IP do request e gera hash estável pra usar como chave de rate-limit.
 *
 * Usa Web Crypto API (`crypto.subtle.digest`) — disponível em Edge Runtime
 * (Next middleware) E Node Runtime (route handlers). Não usar `node:crypto`
 * aqui senão middleware quebra.
 *
 * Vercel popula `x-forwarded-for` com o IP real do cliente (primeiro item),
 * seguido por proxies. Tomamos só o primeiro.
 *
 * Hash usa SHA-256 com salt em `IP_SALT` (env). Em prod, manter o salt fixo
 * — alterar invalida todos os buckets. O salt protege contra reverse-lookup
 * trivial caso a tabela rate_limit_buckets vaze.
 */

const IP_SALT = process.env.IP_SALT ?? "kindar-dev-salt-CHANGE-IN-PROD";

export function extractClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return null;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const data = new TextEncoder().encode(`${IP_SALT}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  // 128 bits — suficiente pra evitar colisões.
  return toHex(digest).slice(0, 32);
}

/** Helper combinado pros callers de rate-limit. */
export async function getIpHashFromRequest(request: Request): Promise<string | null> {
  return hashIp(extractClientIp(request));
}
