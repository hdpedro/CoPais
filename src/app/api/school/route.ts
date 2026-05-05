/**
 * Native-callable wrapper around `src/lib/services/school.ts`. The PWA
 * action `src/actions/school.ts` and this route delegate to the same
 * service so subtype validation, calendar mirroring, and rollback are
 * identical (paridade obrigatória — DEV/.claude/CLAUDE.md).
 *
 * POST   /api/school        → create a school log (auto-mirrors to calendar
 *                             when subtype is event-kind).
 * PATCH  /api/school        → update title/description/subject/score, or
 *                             toggle completion (homework checkbox).
 * DELETE /api/school?id=…   → delete the log (cascade removes calendar mirror).
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import {
  createSchoolLog,
  deleteSchoolLog,
  updateSchoolLog,
  toggleSchoolLogCompleted,
  isValidSubtype,
  type SchoolSubtype,
} from "@/lib/services/school";

async function verifyMember(supabase: ReturnType<typeof createAdminClient>, groupId: string, userId: string) {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string;
  const subtype = body.subtype as string;
  if (!groupId) return NextResponse.json({ error: "groupId obrigatório." }, { status: 400 });
  if (!isValidSubtype(subtype)) return NextResponse.json({ error: "subtype inválido." }, { status: 400 });

  const supabase = createAdminClient();
  if (!(await verifyMember(supabase, groupId, user.id))) {
    return NextResponse.json({ error: "Sem permissão para este grupo." }, { status: 403 });
  }

  const result = await createSchoolLog(supabase, {
    groupId,
    childId: body.childId as string,
    userId: user.id,
    subtype: subtype as SchoolSubtype,
    title: (body.title as string) || "",
    description: (body.description as string) ?? null,
    logDate: (body.logDate as string) || new Date().toISOString().split("T")[0],
    eventTime: (body.eventTime as string) || null,
    subject: (body.subject as string) || null,
    score: (body.score as string) || null,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  revalidatePath("/escola");
  revalidatePath("/calendario");
  return NextResponse.json({ success: true, ...result.data });
}

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const logId = body.logId as string;
  if (!logId) return NextResponse.json({ error: "logId obrigatório." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: log } = await supabase
    .from("school_logs")
    .select("group_id")
    .eq("id", logId)
    .maybeSingle();
  if (!log) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  if (!(await verifyMember(supabase, log.group_id, user.id))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  if (body.toggleCompleted) {
    const r = await toggleSchoolLogCompleted(supabase, logId);
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 400 });
    revalidatePath("/escola");
    return NextResponse.json({ success: true, completed: r.data.completed });
  }

  const r = await updateSchoolLog(supabase, logId, {
    title: body.title as string | undefined,
    description: body.description === undefined ? undefined : ((body.description as string | null) ?? null),
    subject: body.subject === undefined ? undefined : ((body.subject as string | null) ?? null),
    score: body.score === undefined ? undefined : ((body.score as string | null) ?? null),
  });
  if (!r.success) return NextResponse.json({ error: r.error }, { status: 400 });
  revalidatePath("/escola");
  revalidatePath("/calendario");
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const url = new URL(request.url);
  const logId = url.searchParams.get("id");
  if (!logId) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: log } = await supabase
    .from("school_logs")
    .select("group_id")
    .eq("id", logId)
    .maybeSingle();
  if (!log) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  if (!(await verifyMember(supabase, log.group_id, user.id))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const r = await deleteSchoolLog(supabase, logId);
  if (!r.success) return NextResponse.json({ error: r.error }, { status: 400 });
  revalidatePath("/escola");
  revalidatePath("/calendario");
  return NextResponse.json({ success: true });
}
