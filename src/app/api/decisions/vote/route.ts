/**
 * POST /api/decisions/vote
 *
 * Native-callable wrapper around the cast-vote logic in
 * `src/actions/decisions.ts:castVote`. Handles vote upsert + automatic
 * resolution (rejected if any "discordo", approved if everyone voted
 * "concordo"). Native previously bypassed the resolution logic AND used
 * the wrong column name (`choice` instead of `vote`) AND the wrong vote
 * values (`sim/nao/abster` instead of `concordo/discordo/abstencao`),
 * silently dropping votes.
 *
 * Accepted vote values: `concordo` | `discordo` | `abstencao`
 * (matches `decision_votes.vote` column.)
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";
import { computeDecisionOutcome } from "@/lib/services/decisions";

const VALID_VOTES = ["concordo", "discordo", "abstencao"] as const;
type VoteValue = (typeof VALID_VOTES)[number];

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const decisionId = body.decisionId as string | undefined;
  const vote = body.vote as string | undefined;

  if (!decisionId || !vote) {
    return NextResponse.json(
      { error: "decisionId e vote obrigatórios." },
      { status: 400 },
    );
  }
  if (!VALID_VOTES.includes(vote as VoteValue)) {
    return NextResponse.json(
      { error: `Voto inválido. Valores aceitos: ${VALID_VOTES.join(", ")}.` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: decision } = await admin
    .from("decisions")
    .select("id, group_id, title, status, created_by")
    .eq("id", decisionId)
    .single();

  if (!decision) {
    return NextResponse.json({ error: "Decisão não encontrada." }, { status: 404 });
  }
  if (decision.status !== "aberta") {
    return NextResponse.json(
      { error: "Esta decisão já foi resolvida." },
      { status: 400 },
    );
  }

  // Verify membership
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", decision.group_id)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  const { error: voteError } = await admin
    .from("decision_votes")
    .upsert(
      {
        decision_id: decisionId,
        user_id: user.id,
        vote,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "decision_id,user_id" },
    );

  if (voteError) {
    return NextResponse.json({ error: voteError.message }, { status: 400 });
  }

  captureServerEvent(user.id, "decision_vote_cast", { vote });

  // Auto-resolve: any "discordo" → rejected; all members "concordo" → approved.
  const [{ data: members }, { data: votes }] = await Promise.all([
    admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", decision.group_id),
    admin
      .from("decision_votes")
      .select("user_id, vote")
      .eq("decision_id", decisionId),
  ]);

  // Regra ÚNICA compartilhada com o service (auto-resolução + encerramento):
  // só aprova quando TODOS os membros do grupo votaram concordo.
  const newStatus = computeDecisionOutcome(members ?? [], votes ?? [], null);

  if (newStatus) {
    await admin
      .from("decisions")
      .update({ status: newStatus, resolved_at: new Date().toISOString() })
      .eq("id", decisionId);

    // Push to creator (non-blocking)
    if (decision.created_by !== user.id) {
      try {
        await createNotificationWithPush(
          decision.created_by,
          "decision_resolved",
          newStatus === "aprovada" ? "Decisão aprovada" : "Decisão rejeitada",
          newStatus === "aprovada"
            ? `Sua decisão "${decision.title}" foi aprovada`
            : `Sua decisão "${decision.title}" foi rejeitada`,
          "/decisoes",
        );
      } catch {
        // ignore
      }
    }
  }

  revalidateTag(`decisions-${decision.group_id}`, "max");
  return NextResponse.json({
    success: true,
    resolved: !!newStatus,
    status: newStatus ?? "aberta",
  });
}
