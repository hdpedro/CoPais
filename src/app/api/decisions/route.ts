/**
 * Native-callable wrapper para `src/lib/services/decisions.ts`.
 *   - POST  /api/decisions  → createDecision  { groupId, title, description?, category?, deadline? }
 *   - PATCH /api/decisions  → closeDecision   { decisionId }
 *
 * Consolidação 13/jun (CLAUDE.md M2): antes o Native criava decisão via
 * `safeWrite` cru e re-implementava a regra de encerramento no client. Agora
 * delega ao service (membership gate, notificações, regra única). O endpoint
 * de VOTO já existia em `/api/decisions/vote`; o de ARGUMENTO em
 * `/api/decisions/arguments`. `/api/decisions` está na allowlist do middleware
 * (prefix startsWith → cobre POST/PATCH/vote/arguments).
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createDecision, closeDecision } from "@/lib/services/decisions";

function unauthorized() {
  return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
}

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();

  const result = await createDecision(supabase, {
    groupId: body.groupId as string,
    createdBy: user.id,
    title: (body.title as string) || "",
    description: (body.description as string | null) ?? null,
    category: (body.category as string) || undefined,
    deadline: (body.deadline as string | null) ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  revalidatePath("/decisoes");
  return NextResponse.json({ success: true, ...result.data });
}

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();

  const result = await closeDecision(supabase, {
    decisionId: body.decisionId as string,
    userId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  revalidatePath("/decisoes");
  return NextResponse.json({ success: true, ...result.data });
}
