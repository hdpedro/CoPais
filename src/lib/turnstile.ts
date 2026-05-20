import "server-only";

/**
 * Valida um token Cloudflare Turnstile contra `/siteverify`.
 *
 * Retorna `{ ok: true }` se:
 *   - `TURNSTILE_SECRET_KEY` não está configurado (modo dev/staging — bypass);
 *   - o token vale "DEV" (sentinel do widget quando NEXT_PUBLIC_TURNSTILE_SITE_KEY
 *     não está setada — par com o widget);
 *   - Cloudflare retorna `success: true`.
 *
 * Caso contrário, retorna `{ ok: false, reason: string }` com o motivo do
 * Cloudflare ou "missing-token". O caller decide se bloqueia ou só loga.
 *
 * Spec: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Dev / staging sem chave configurada → bypass total
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[Turnstile] TURNSTILE_SECRET_KEY not set in production — running unprotected");
    }
    return { ok: true };
  }

  // Widget rodando sem NEXT_PUBLIC_TURNSTILE_SITE_KEY
  if (token === "DEV") {
    if (process.env.NODE_ENV === "production") {
      console.warn("[Turnstile] DEV sentinel reached server in production — site key missing in client");
    }
    return { ok: true };
  }

  if (!token) {
    return { ok: false, reason: "missing-token" };
  }

  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp) params.set("remoteip", remoteIp);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      // 5s — Cloudflare costuma responder <200ms, mas defensivo
      signal: AbortSignal.timeout(5000),
    });

    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    if (data.success) return { ok: true };
    const reason = data["error-codes"]?.[0] ?? "turnstile-failed";
    return { ok: false, reason };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "turnstile-network";
    // Fail-open em erro de rede pra não derrubar signup em caso de outage Cloudflare.
    // Tier S faria fail-closed; pra freemium/early-paying, fail-open é trade-off correto.
    console.warn("[Turnstile] siteverify error (fail-open):", reason);
    return { ok: true };
  }
}
