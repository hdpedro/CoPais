/**
 * GET /api/files/[id]?type=document|receipt[&preview=1]
 *
 * Stream proxy autenticado: baixa o arquivo do Supabase Storage server-side
 * e streama o blob pro cliente. Cada download passa por:
 *   1. Validação de auth (resolveAuthenticatedUser).
 *   2. Validação de X-Kindar-Client header.
 *   3. (Quando FILES_NONCE_REQUIRED=true) verifica X-Files-Nonce.
 *   4. Rate-limit em paralelo nas chaves user + IP (scope download-file ou
 *      preview-image conforme `?preview=1`).
 *   5. Validação de group membership (services/storage).
 *   6. Download server-side + audit em usage_events.
 *
 * Substitui o uso direto de signed URLs em produção. Os endpoints /sign
 * continuam vivos pra compatibilidade durante rollout (ver feature flags).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import {
  streamDocumentForUser,
  streamReceiptForUser,
} from "@/lib/services/storage";
import { readClientHeader } from "@/lib/files/client-header";
import { verifyAndConsumeNonce } from "@/lib/files/nonce";
import {
  rateLimitCheck,
  rateLimitHeaders,
} from "@/lib/rate-limit/postgres";
import { getIpHashFromRequest } from "@/lib/rate-limit/ip";
import {
  isFilesNonceRequired,
  isFilesProxyEnabled,
} from "@/lib/feature-flags/rate-limit";
import type { RateLimitScope } from "@/lib/rate-limit/scopes";

export const dynamic = "force-dynamic";

type FileType = "document" | "receipt";

function parseType(value: string | null): FileType | null {
  if (value === "document" || value === "receipt") return value;
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isFilesProxyEnabled()) {
    return NextResponse.json(
      { error: "Files proxy temporarily disabled." },
      { status: 503 },
    );
  }

  const client = readClientHeader(request);
  if (!client) {
    return NextResponse.json(
      { error: "X-Kindar-Client header obrigatório." },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const fileType = parseType(url.searchParams.get("type"));
  if (!fileType) {
    return NextResponse.json(
      { error: "?type=document|receipt obrigatório." },
      { status: 400 },
    );
  }
  const isPreview = url.searchParams.get("preview") === "1";

  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  // Nonce (fase 5 do rollout — atrás da flag por enquanto).
  if (isFilesNonceRequired()) {
    const nonceToken = request.headers.get("x-files-nonce");
    const nonceCheck = await verifyAndConsumeNonce(nonceToken, user.id);
    if (!nonceCheck.ok) {
      return NextResponse.json(
        { error: "Nonce inválido.", reason: nonceCheck.reason },
        { status: 401 },
      );
    }
  }

  const ipHash = await getIpHashFromRequest(request);

  // Rate-limit: scope depende do tipo de download.
  const primaryScope: RateLimitScope = isPreview ? "preview-image" : "download-file";
  const limit = await rateLimitCheck(user.id, ipHash, primaryScope);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded.", blockedBy: limit.blockedBy },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  // Segunda camada: limite por hora pra downloads completos (não pra preview).
  if (!isPreview) {
    const hourLimit = await rateLimitCheck(user.id, ipHash, "download-file-hour");
    if (!hourLimit.allowed) {
      return NextResponse.json(
        { error: "Limite diário aproximado.", blockedBy: hourLimit.blockedBy },
        { status: 429, headers: rateLimitHeaders(hourLimit) },
      );
    }
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();
  const result =
    fileType === "document"
      ? await streamDocumentForUser(admin, user.id, id)
      : await streamReceiptForUser(admin, user.id, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Audit log — bate `feature=file_download` + metadata. Não bloqueia a
  // resposta (await é rápido mas erro aqui não é fatal pro cliente).
  void admin.from("usage_events").insert({
    user_id: user.id,
    feature: "file_download",
    metadata: {
      type: fileType,
      file_id: id,
      bucket: result.data.bucket,
      bytes: result.data.bytes,
      preview: isPreview,
      client: client.raw,
      ip_hash: ipHash,
    },
  });

  const headers = new Headers({
    "Content-Type": result.data.mimeType,
    "Content-Length": String(result.data.bytes),
    "Cache-Control": "private, no-store",
    "X-RateLimit-Remaining": String(limit.remaining),
  });

  if (!isPreview) {
    // Força download em vez de inline pra arquivos completos.
    headers.set(
      "Content-Disposition",
      `attachment; filename="${sanitizeFilename(result.data.name)}"`,
    );
  } else {
    headers.set("Content-Disposition", "inline");
  }

  return new NextResponse(result.data.blob, { status: 200, headers });
}

function sanitizeFilename(raw: string): string {
  // Remove caracteres que quebram headers HTTP. Mantém UTF-8 básico.
  return raw.replace(/[\r\n"\\]/g, "_").slice(0, 200) || "file";
}
