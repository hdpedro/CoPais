/**
 * POST /api/documents/[id]/sign
 *
 * Retorna uma signed URL fresca (TTL 5min) pra um documento específico.
 * Usado pelo botão "download" do DocumentViewer quando a URL inicial pode
 * já ter expirado (sessão longa, aba aberta), e pelo native quando precisa
 * reabrir o arquivo offline-first.
 *
 * Auth: dual (cookie PWA + Bearer native). Valida que o user é membro do
 * grupo dono do documento antes de assinar.
 *
 * Não retorna o path bruto — só a URL com token + expires_at, pra cliente
 * decidir se exibe ou pede refresh.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { getSignedDocumentUrl } from "@/lib/services/storage";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
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
    headers: {
      // Não cachear — TTL curto deve sempre vir do servidor.
      "Cache-Control": "no-store",
    },
  });
}
