/**
 * POST /api/expenses/[id]/sign
 *
 * @deprecated — desde 2026-05-11 esta rota é fallback durante a migração para
 * `GET /api/files/[id]?type=receipt`. Veja a doc em
 * `src/app/api/documents/[id]/sign/route.ts` para o racional.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { getSignedReceiptUrl } from "@/lib/services/storage";
import {
  rateLimitCheck,
  rateLimitHeaders,
} from "@/lib/rate-limit/postgres";
import { getIpHashFromRequest } from "@/lib/rate-limit/ip";
import { isSignedUrlsDeprecated } from "@/lib/feature-flags/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isSignedUrlsDeprecated()) {
    return NextResponse.json(
      { error: "Endpoint descontinuado. Use GET /api/files/[id]?type=receipt." },
      { status: 410 },
    );
  }

  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const ipHash = await getIpHashFromRequest(request);
  const limit = await rateLimitCheck(user.id, ipHash, "download-file");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded.", blockedBy: limit.blockedBy },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await getSignedReceiptUrl(admin, user.id, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
