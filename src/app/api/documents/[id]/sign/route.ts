/**
 * POST /api/documents/[id]/sign
 *
 * @deprecated — desde 2026-05-11 esta rota é fallback durante a migração para
 * `GET /api/files/[id]?type=document`. O stream proxy é mais seguro: cada
 * download passa por rate-limit + audit, em vez de devolver uma signed URL
 * que vive 300s sem controle do Vercel.
 *
 * Mantida para clientes que ainda não migraram (apps EAS antigos). Quando
 * `SIGNED_URLS_DEPRECATED=true`, retorna 410 Gone — só ligar após zero hits
 * por 30 dias.
 *
 * Auth: dual (cookie PWA + Bearer native).
 * Rate-limit: `download-file` (10 req/min user, 20 IP).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { getSignedDocumentUrl } from "@/lib/services/storage";
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
      { error: "Endpoint descontinuado. Use GET /api/files/[id]?type=document." },
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
  const result = await getSignedDocumentUrl(admin, user.id, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
