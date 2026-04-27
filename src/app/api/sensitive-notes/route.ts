/**
 * POST   /api/sensitive-notes  → create sensitive note
 * DELETE /api/sensitive-notes  → delete sensitive note (owner or admin)
 *
 * Native-callable wrapper around `src/actions/sensitive.ts:createSensitiveNote`.
 * Critical because sensitive notes can reference a `child_id` and the PWA
 * action has a `child belongs to group` check (LGPD scope guarantee) that
 * native previously skipped — letting a member upload sensitive content
 * pointing to a child outside their own group.
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";

const VALID_TOPICS = [
  "gender_violence",
  "sexual_violence",
  "bullying",
  "mental_health",
  "substance_abuse",
  "safety",
  "other",
] as const;

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const childId = (body.childId as string | undefined) || null;
  const topic = (body.topic as string | undefined) || "other";
  const title = (body.title as string | undefined) || "";
  const content = (body.content as string | undefined) || "";
  const sourceUrl = (body.sourceUrl as string | undefined) || null;
  const isUrgent = !!body.isUrgent;

  if (!groupId) {
    return NextResponse.json({ error: "groupId obrigatório." }, { status: 400 });
  }
  if (!title.trim()) {
    return NextResponse.json({ error: "Título obrigatório." }, { status: 400 });
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

  // Child-belongs-to-group gate (LGPD scope guarantee).
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
    .from("sensitive_notes")
    .insert({
      group_id: groupId,
      child_id: childId,
      topic: VALID_TOPICS.includes(topic as (typeof VALID_TOPICS)[number])
        ? topic
        : "other",
      title,
      content,
      source_url: sourceUrl,
      is_urgent: isUrgent,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "sensitive_topic_created", { topic });
  revalidateTag(`sensitive-${groupId}`, "max");
  return NextResponse.json({ success: true, id: inserted?.id });
}

export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const url = new URL(request.url);
  const noteId = url.searchParams.get("id");
  if (!noteId) {
    return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: note } = await admin
    .from("sensitive_notes")
    .select("group_id, created_by")
    .eq("id", noteId)
    .single();

  if (!note) {
    return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  }

  // Allow author OR admin to delete.
  if (note.created_by !== user.id) {
    const { data: membership } = await admin
      .from("group_members")
      .select("role")
      .eq("group_id", note.group_id)
      .eq("user_id", user.id)
      .single();
    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Apenas o autor ou administradores podem remover." },
        { status: 403 },
      );
    }
  }

  const { error } = await admin
    .from("sensitive_notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  revalidateTag(`sensitive-${note.group_id}`, "max");
  return NextResponse.json({ success: true });
}
