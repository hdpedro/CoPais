/**
 * Native-callable wrapper para `src/lib/services/decisions.ts:addArgument`.
 *   - POST /api/decisions/arguments  { decisionId, argumentType, text }
 *
 * Consolidação 13/jun (CLAUDE.md M2): antes o Native inseria em
 * `decision_arguments` direto (sem endpoint). Agora delega ao service
 * (membership gate + validação). `/api/decisions` (prefix) já está na
 * allowlist do middleware.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { addArgument } from "@/lib/services/decisions";

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();

  const result = await addArgument(supabase, {
    decisionId: body.decisionId as string,
    userId: user.id,
    argumentType: (body.argumentType as string) || "pro",
    text: (body.text as string) || "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  revalidatePath("/decisoes");
  return NextResponse.json({ success: true, ...result.data });
}
