/**
 * Kill switches do sistema de rate-limit + files proxy.
 *
 * Todas as flags são lidas de env vars em runtime (sem rebuild). Vercel
 * suporta env por environment (preview/production) — habilite em staging
 * antes de prod.
 *
 * Defaults documentados na coluna "Default prod" do plano. Mudar com cuidado:
 * desligar `RATE_LIMIT_ENFORCED` deixa o sistema vulnerável ao ataque
 * original; só usar em emergência.
 */

function readBool(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "true" || raw === "1";
}

/** Quando false: checks ainda rodam (audit preservado) mas nunca retornam 429. */
export function isRateLimitEnforced(): boolean {
  return readBool("RATE_LIMIT_ENFORCED", true);
}

/** Quando false: GET /api/files/[id] retorna 503 → cliente cai no fallback /sign. */
export function isFilesProxyEnabled(): boolean {
  return readBool("FILES_PROXY_ENABLED", true);
}

/** Quando true: endpoints /sign retornam 410 Gone. Só ativar pós-migração total. */
export function isSignedUrlsDeprecated(): boolean {
  return readBool("SIGNED_URLS_DEPRECATED", false);
}

/** Quando false: desliga só a chave por IP (mantém user-key). Pra debug de FP. */
export function isRateLimitIpEnforced(): boolean {
  return readBool("RATE_LIMIT_IP_ENFORCED", true);
}

/** Quando true: GET /api/files exige X-Files-Nonce. Fase 5 do rollout. */
export function isFilesNonceRequired(): boolean {
  return readBool("FILES_NONCE_REQUIRED", false);
}

/** Snapshot pra logs/debug. */
export function rateLimitFlagsSnapshot() {
  return {
    enforced: isRateLimitEnforced(),
    proxyEnabled: isFilesProxyEnabled(),
    signedUrlsDeprecated: isSignedUrlsDeprecated(),
    ipEnforced: isRateLimitIpEnforced(),
    nonceRequired: isFilesNonceRequired(),
  };
}
