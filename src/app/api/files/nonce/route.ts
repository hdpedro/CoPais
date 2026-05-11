/**
 * POST /api/files/nonce
 *
 * Emite um JWT HS256 de 5min com JTI único pra ser usado como `X-Files-Nonce`
 * em GET /api/files/[id]. Cliente chama isto a cada janela curta (ex.: ao
 * abrir lista de documentos), guarda em memória, envia em cada download.
 *
 * Camadas de rate-limit aplicadas:
 *   - `auth-sensitive` (10 req/min user, 20 req/min IP). Pedir nonce em loop
 *     é o ataque #1 caso atacante tente bypassar o nonce; aqui já cortamos.
 *
 * Headers exigidos:
 *   - `Authorization: Bearer ...` ou cookie de sessão Supabase
 *   - `X-Kindar-Client` (ex.: `web-pwa@1.0`, `native-ios@1.2`)
 */

import { NextResponse } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { issueNonce } from "@/lib/files/nonce";
import { readClientHeader } from "@/lib/files/client-header";
import { rateLimitCheck, rateLimitHeaders } from "@/lib/rate-limit/postgres";
import { getIpHashFromRequest } from "@/lib/rate-limit/ip";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = readClientHeader(request);
  if (!client) {
    return NextResponse.json(
      { error: "X-Kindar-Client header obrigatório." },
      { status: 400 },
    );
  }

  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const ipHash = await getIpHashFromRequest(request);
  const limit = await rateLimitCheck(user.id, ipHash, "auth-sensitive");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded.", blockedBy: limit.blockedBy },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  try {
    const nonce = await issueNonce(user.id);
    return NextResponse.json(nonce, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/files/nonce] issue failed:", err);
    return NextResponse.json(
      { error: "Falha ao gerar nonce." },
      { status: 500 },
    );
  }
}
