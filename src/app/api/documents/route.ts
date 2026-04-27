/**
 * POST   /api/documents  → register an uploaded document row (file already
 *                          in `documents` bucket; native uploads first, then
 *                          POSTs the metadata).
 * DELETE /api/documents?id=xxx → remove document row + best-effort storage cleanup.
 *
 * Native-callable wrapper around `src/actions/children.ts:deleteChildDocument`
 * and the inline insert in `DocumentsDashboard`. Same admin gates the PWA
 * applies — child must belong to the group, category must match the
 * `document_category` enum, group membership required.
 */

import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";

const VALID_CATEGORIES = [
  "personal",
  "health",
  "education",
  "legal",
  "other",
] as const;

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const childId = (body.childId as string | null | undefined) ?? null;
  const category = body.category as string | undefined;
  const name = ((body.name as string | undefined) || "").trim();
  const filePath = ((body.filePath as string | undefined) || "").trim();
  const fileSize = body.fileSize == null ? null : Number(body.fileSize);
  const mimeType = (body.mimeType as string | null | undefined) ?? null;

  if (!groupId) {
    return NextResponse.json({ error: "groupId obrigatório." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Nome obrigatório." }, { status: 400 });
  }
  if (!filePath) {
    return NextResponse.json(
      { error: "file_path obrigatório." },
      { status: 400 },
    );
  }
  if (!category || !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Group-membership gate
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  // child-belongs-to-group gate (LGPD scope guarantee).
  if (childId) {
    const { data: child } = await admin
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("group_id", groupId)
      .single();
    if (!child) {
      return NextResponse.json(
        { error: "Criança não pertence a este grupo." },
        { status: 403 },
      );
    }
  }

  const { data: inserted, error } = await admin
    .from("documents")
    .insert({
      group_id: groupId,
      child_id: childId,
      category,
      name,
      file_url: filePath,
      file_size: fileSize,
      mime_type: mimeType,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "document_uploaded", {
    group_id: groupId,
    category,
  });

  revalidateTag(`documents-${groupId}`, "max");
  revalidatePath("/documentos");
  return NextResponse.json({ success: true, id: inserted?.id });
}

export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const url = new URL(request.url);
  const documentId =
    url.searchParams.get("id") ||
    (await request
      .json()
      .catch(() => ({} as Record<string, unknown>))
      .then((b) => (b as { id?: string }).id));
  if (!documentId) {
    return NextResponse.json(
      { error: "id do documento obrigatório." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: doc } = await admin
    .from("documents")
    .select("id, file_url, group_id")
    .eq("id", documentId)
    .single();
  if (!doc) {
    return NextResponse.json(
      { error: "Documento não encontrado." },
      { status: 404 },
    );
  }

  // Group-membership gate
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", doc.group_id)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  // Best-effort storage cleanup. After migration 062, file_url is path-only;
  // pre-migration rows still have absolute URLs — handle both.
  try {
    const stored = doc.file_url || "";
    let storagePath = stored;
    if (stored.startsWith("http")) {
      const u = new URL(stored);
      const parts = u.pathname.split("/storage/v1/object/public/documents/");
      if (parts[1]) storagePath = decodeURIComponent(parts[1]);
    }
    if (storagePath) {
      await admin.storage.from("documents").remove([storagePath]);
    }
  } catch {
    // ignore — storage cleanup is best-effort
  }

  const { error } = await admin
    .from("documents")
    .delete()
    .eq("id", documentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "document_deleted", { group_id: doc.group_id });
  revalidateTag(`documents-${doc.group_id}`, "max");
  revalidatePath("/documentos");
  return NextResponse.json({ success: true });
}
