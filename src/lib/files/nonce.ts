/**
 * Nonce JWT pra GET /api/files/[id] — anti-replay leve.
 *
 * Cliente autenticado pede nonce em POST /api/files/nonce, recebe JWT HS256
 * assinado com FILES_NONCE_SECRET, payload `{userId, exp: now+5min, jti}`.
 * Esse JWT vai no header `X-Files-Nonce` em cada download.
 *
 * O JTI é consumido uma única vez (Postgres function `consume_nonce`).
 * Replay do mesmo JWT → 401.
 *
 * Por que isto não é segurança absoluta:
 *   - Atacante com cliente legítimo pode pedir nonce + baixar, em loop.
 *     Cada loop precisa de 1 request extra → estoura `api-global` (200/min).
 *   - Não impede insider abuse. Combina-se com download-file rate-limit.
 *
 * Mas trava ataques tipo "abro DevTools, copio o curl, replico 36k vezes":
 * sem renovar o nonce a cada 5min, todas as réplicas falham.
 */

import { SignJWT, jwtVerify } from "jose";
import { createAdminClient } from "@/lib/supabase/admin";

const NONCE_TTL_SEC = 300; // 5 min
const ALGORITHM = "HS256";

function getSecret(): Uint8Array {
  const raw = process.env.FILES_NONCE_SECRET;
  if (!raw) {
    throw new Error("FILES_NONCE_SECRET não configurado (env var obrigatória pra /api/files)");
  }
  return new TextEncoder().encode(raw);
}

export interface NonceClaims {
  userId: string;
  jti: string;
  exp: number;
}

export interface IssuedNonce {
  token: string;
  expiresAt: string;
  ttlSec: number;
}

/** Emite um nonce JWT pra um usuário autenticado. */
export async function issueNonce(userId: string): Promise<IssuedNonce> {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + NONCE_TTL_SEC;

  const token = await new SignJWT({ userId, jti })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(jti)
    .sign(getSecret());

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    ttlSec: NONCE_TTL_SEC,
  };
}

export type VerifyOutcome =
  | { ok: true; userId: string; jti: string }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "replay" | "user_mismatch" };

/**
 * Verifica nonce + consome JTI atomicamente. Se userId expected for passado,
 * confirma que o nonce pertence ao mesmo user que está autenticado (defesa
 * contra "atacante pede nonce com conta A, usa contra arquivo da conta B").
 */
export async function verifyAndConsumeNonce(
  token: string | null | undefined,
  expectedUserId: string,
): Promise<VerifyOutcome> {
  if (!token) return { ok: false, reason: "missing" };

  let claims: NonceClaims;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALGORITHM],
    });
    if (!payload.userId || !payload.jti) {
      return { ok: false, reason: "invalid" };
    }
    claims = {
      userId: String(payload.userId),
      jti: String(payload.jti),
      exp: Number(payload.exp ?? 0),
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "ERR_JWT_EXPIRED") return { ok: false, reason: "expired" };
    return { ok: false, reason: "invalid" };
  }

  if (claims.userId !== expectedUserId) {
    return { ok: false, reason: "user_mismatch" };
  }

  // Consome JTI no banco — replay = nega.
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_nonce", {
    p_jti: claims.jti,
    p_ttl_sec: NONCE_TTL_SEC,
  });

  if (error) {
    console.error("[files/nonce] consume_nonce error:", error.message);
    // Fail-closed: se não conseguimos verificar JTI, melhor negar.
    return { ok: false, reason: "invalid" };
  }

  if (data !== true) {
    return { ok: false, reason: "replay" };
  }

  return { ok: true, userId: claims.userId, jti: claims.jti };
}
