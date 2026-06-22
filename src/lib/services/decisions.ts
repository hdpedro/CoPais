/* ------------------------------------------------------------------ */
/* services/decisions.ts                                               */
/* Single source of truth for decisions (collaborative votes between   */
/* coparents): create, vote, resolve, add argument.                    */
/* Called by: actions/decisions.ts (PWA) and tools.ts:create_decision  */
/* (future) / WhatsApp.                                                */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export type Vote = "concordo" | "discordo" | "abstencao";

export interface CreateDecisionInput {
  groupId: string;
  createdBy: string;
  title: string;
  description?: string | null;
  category?: string;
  deadline?: string | null;
}

export interface CastVoteInput {
  decisionId: string;
  userId: string;
  vote: Vote;
}

export interface AddArgumentInput {
  decisionId: string;
  userId: string;
  argumentType: string;
  text: string;
}

/* ------------------------------------------------------------------ */
/* Resolução: regra ÚNICA de status                                    */
/* ------------------------------------------------------------------ */

type DecisionMember = { user_id: string };
type DecisionVoteRow = { user_id?: string; vote: string };

/**
 * Regra ÚNICA de resolução de uma decisão, a partir dos membros do grupo e dos
 * votos lançados. É a fonte de verdade compartilhada por TODOS os caminhos de
 * resolução: auto-resolução ao votar (`resolveDecisionIfReady`), encerramento
 * manual (`closeDecision`) e a rota nativa (`api/decisions/vote`). Antes a
 * regra estava TRIPLICADA — a mesma classe dos bugs `stance`/`direction`.
 *
 * `aprovada` exige que TODOS os membros do grupo tenham votado `concordo`.
 * NUNCA aprova por maioria dos votos lançados — senão uma decisão de 2
 * participantes era aprovada com 1 voto a favor enquanto o outro nem tinha
 * votado (bug reportado 2026-06-22: status "APROVADA" com participação 1/2).
 *
 *   - algum `discordo`         → rejeitada   (um veto basta; não espera todos)
 *   - todos votaram `concordo` → aprovada
 *   - caso contrário           → `onIncomplete`:
 *       • null       no fluxo automático (a decisão segue ABERTA)
 *       • 'expirada' no encerramento manual (encerrou sem quórum)
 */
export function computeDecisionOutcome(
  members: DecisionMember[],
  votes: DecisionVoteRow[],
  onIncomplete: "expirada",
): "aprovada" | "rejeitada" | "expirada";
export function computeDecisionOutcome(
  members: DecisionMember[],
  votes: DecisionVoteRow[],
  onIncomplete: null,
): "aprovada" | "rejeitada" | null;
export function computeDecisionOutcome(
  members: DecisionMember[],
  votes: DecisionVoteRow[],
  onIncomplete: null | "expirada",
): "aprovada" | "rejeitada" | "expirada" | null {
  const hasDiscordo = votes.some((v) => v.vote === "discordo");
  if (hasDiscordo) return "rejeitada";

  const allVoted =
    members.length > 0 &&
    members.every((m) => votes.some((v) => v.user_id === m.user_id));
  const allConcordo = allVoted && votes.every((v) => v.vote === "concordo");
  if (allConcordo) return "aprovada";

  return onIncomplete;
}

async function verifyMembership(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/* ------------------------------------------------------------------ */
/* Create decision                                                     */
/* ------------------------------------------------------------------ */

export async function createDecision(
  supabase: SupabaseClient,
  input: CreateDecisionInput,
): Promise<ServiceResult<{ id: string }>> {
  const title = (input.title || "").trim();
  if (!title) return { ok: false, error: "Titulo obrigatorio.", status: 400 };

  const isMember = await verifyMembership(supabase, input.groupId, input.createdBy);
  if (!isMember) {
    return { ok: false, error: "Sem permissao para este grupo.", status: 403 };
  }

  const { data, error } = await supabase
    .from("decisions")
    .insert({
      group_id: input.groupId,
      title: title.slice(0, 200),
      description: input.description?.trim() || null,
      category: input.category || null,
      deadline: input.deadline || null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "Falha ao criar decisao.", status: 400 };
  }

  captureServerEvent(input.createdBy, "decision_created", {
    category: input.category,
  });

  // Best-effort push to other members + chat broadcast.
  notifyDecisionCreated(supabase, {
    groupId: input.groupId,
    createdBy: input.createdBy,
    title,
  }).catch(() => {});

  return { ok: true, data: { id: data.id as string } };
}

/* ------------------------------------------------------------------ */
/* Cast vote                                                           */
/* ------------------------------------------------------------------ */

export async function castVote(
  supabase: SupabaseClient,
  input: CastVoteInput,
): Promise<ServiceResult<{ status: string | null }>> {
  if (!input.decisionId?.trim()) {
    return { ok: false, error: "ID da decisao obrigatorio.", status: 400 };
  }
  const validVotes: Vote[] = ["concordo", "discordo", "abstencao"];
  if (!validVotes.includes(input.vote)) {
    return { ok: false, error: "Voto invalido.", status: 400 };
  }

  const { data: decision } = await supabase
    .from("decisions")
    .select("id, group_id, title, status, created_by")
    .eq("id", input.decisionId)
    .maybeSingle();
  if (!decision) {
    return { ok: false, error: "Decisao nao encontrada.", status: 404 };
  }
  if (decision.status !== "aberta") {
    return { ok: false, error: "Esta decisao ja foi resolvida.", status: 400 };
  }

  const isMember = await verifyMembership(supabase, decision.group_id, input.userId);
  if (!isMember) {
    return { ok: false, error: "Sem permissao para este grupo.", status: 403 };
  }

  const { error } = await supabase
    .from("decision_votes")
    .upsert(
      {
        decision_id: input.decisionId,
        user_id: input.userId,
        vote: input.vote,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "decision_id,user_id" },
    );

  if (error) return { ok: false, error: error.message, status: 400 };

  captureServerEvent(input.userId, "decision_vote_cast", { vote: input.vote });

  // Resolution check.
  const newStatus = await resolveDecisionIfReady(
    supabase,
    decision.id,
    decision.group_id,
    decision.title,
    decision.created_by,
    input.userId,
  );

  return { ok: true, data: { status: newStatus } };
}

/* ------------------------------------------------------------------ */
/* Add argument                                                        */
/* ------------------------------------------------------------------ */

export async function addArgument(
  supabase: SupabaseClient,
  input: AddArgumentInput,
): Promise<ServiceResult<{ decisionId: string }>> {
  const text = (input.text || "").trim();
  if (!text) {
    return { ok: false, error: "Texto do argumento obrigatorio.", status: 400 };
  }

  const { data: decision } = await supabase
    .from("decisions")
    .select("group_id")
    .eq("id", input.decisionId)
    .maybeSingle();
  if (!decision) {
    return { ok: false, error: "Decisao nao encontrada.", status: 404 };
  }

  const isMember = await verifyMembership(supabase, decision.group_id, input.userId);
  if (!isMember) {
    return { ok: false, error: "Sem permissao para este grupo.", status: 403 };
  }

  const { error } = await supabase.from("decision_arguments").insert({
    decision_id: input.decisionId,
    user_id: input.userId,
    argument_type: input.argumentType,
    text,
  });

  if (error) return { ok: false, error: error.message, status: 400 };
  return { ok: true, data: { decisionId: input.decisionId } };
}

/* ------------------------------------------------------------------ */
/* Close decision (manual)                                             */
/* ------------------------------------------------------------------ */

export interface CloseDecisionInput {
  decisionId: string;
  userId: string;
}

/**
 * Encerramento MANUAL de uma decisão (botão "Encerrar" — feature do app).
 * Espelha a regra de `resolveDecisionIfReady`, ADICIONANDO o caminho
 * `expirada` (encerrar antes do quorum):
 *   - algum `discordo` → rejeitada
 *   - todos votaram `concordo` → aprovada
 *   - senão → expirada
 *
 * Canônico ÚNICO (consolidação 13/jun): antes o native re-implementava esta
 * regra no client (`services/decisions.ts:closeDecision`) — 2ª cópia sujeita a
 * drift, a mesma classe dos bugs `stance`/`direction`. Agora vive só aqui.
 */
export async function closeDecision(
  supabase: SupabaseClient,
  input: CloseDecisionInput,
): Promise<ServiceResult<{ status: string }>> {
  if (!input.decisionId?.trim()) {
    return { ok: false, error: "ID da decisao obrigatorio.", status: 400 };
  }

  const { data: decision } = await supabase
    .from("decisions")
    .select("id, group_id, title, status, created_by")
    .eq("id", input.decisionId)
    .maybeSingle();
  if (!decision) {
    return { ok: false, error: "Decisao nao encontrada.", status: 404 };
  }
  if (decision.status !== "aberta") {
    return { ok: false, error: "Esta decisao ja foi resolvida.", status: 400 };
  }

  const isMember = await verifyMembership(supabase, decision.group_id as string, input.userId);
  if (!isMember) {
    return { ok: false, error: "Sem permissao para este grupo.", status: 403 };
  }

  const [{ data: members }, { data: votes }] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", decision.group_id as string),
    supabase
      .from("decision_votes")
      .select("user_id, vote")
      .eq("decision_id", input.decisionId),
  ]);
  // Encerramento manual: só aprova se TODOS os membros votaram concordo; senão
  // 'expirada' (encerrou sem quórum). Antes aprovava com 1 voto a favor de 2.
  const finalStatus = computeDecisionOutcome(
    (members ?? []) as DecisionMember[],
    (votes ?? []) as DecisionVoteRow[],
    "expirada",
  );

  const { error } = await supabase
    .from("decisions")
    .update({ status: finalStatus, resolved_at: new Date().toISOString() })
    .eq("id", input.decisionId);
  if (error) return { ok: false, error: error.message, status: 400 };

  captureServerEvent(input.userId, "decision_closed", { status: finalStatus });

  // Best-effort chat broadcast + push pro criador.
  try {
    const msg =
      finalStatus === "aprovada"
        ? `✅ Decisao aprovada: ${decision.title}`
        : finalStatus === "rejeitada"
          ? `❌ Decisao rejeitada: ${decision.title}`
          : `⏳ Decisao encerrada: ${decision.title}`;
    await postChatNotification(supabase, decision.group_id as string, input.userId, msg);
  } catch {
    // ignore
  }
  try {
    if (decision.created_by !== input.userId) {
      await createNotificationWithPush(
        decision.created_by as string,
        "decision_resolved",
        "Decisao encerrada",
        `Sua decisao "${decision.title}" foi ${finalStatus}`,
        "/decisoes",
      );
    }
  } catch {
    // ignore
  }

  return { ok: true, data: { status: finalStatus } };
}

/* ------------------------------------------------------------------ */
/* Internal: notification helpers                                      */
/* ------------------------------------------------------------------ */

async function notifyDecisionCreated(
  supabase: SupabaseClient,
  args: { groupId: string; createdBy: string; title: string },
): Promise<void> {
  try {
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", args.groupId)
      .neq("user_id", args.createdBy);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", args.createdBy)
      .single();
    const creatorName = profile?.full_name?.split(" ")[0] || "Alguem";

    if (members) {
      await Promise.allSettled(
        members.map((m) =>
          createNotificationWithPush(
            m.user_id as string,
            "decision_created",
            "Nova Decisao",
            `${creatorName} criou: ${args.title}`,
            "/decisoes",
          ),
        ),
      );
    }
  } catch {
    // ignore
  }

  try {
    await postChatNotification(
      supabase,
      args.groupId,
      args.createdBy,
      `🗳️ Nova decisao: ${args.title}`,
    );
  } catch {
    // ignore
  }
}

async function resolveDecisionIfReady(
  supabase: SupabaseClient,
  decisionId: string,
  groupId: string,
  title: string,
  createdBy: string,
  voterId: string,
): Promise<string | null> {
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);
  const { data: votes } = await supabase
    .from("decision_votes")
    .select("user_id, vote")
    .eq("decision_id", decisionId);

  if (!members || !votes) return null;

  const newStatus = computeDecisionOutcome(
    members as DecisionMember[],
    votes as DecisionVoteRow[],
    null,
  );
  if (!newStatus) return null;

  await supabase
    .from("decisions")
    .update({ status: newStatus, resolved_at: new Date().toISOString() })
    .eq("id", decisionId);

  // Best-effort chat + push.
  try {
    const chatMsg =
      newStatus === "aprovada"
        ? `✅ Decisao aprovada: ${title}`
        : `❌ Decisao rejeitada: ${title}`;
    await postChatNotification(supabase, groupId, voterId, chatMsg);
  } catch {
    // ignore
  }

  try {
    if (createdBy !== voterId) {
      await createNotificationWithPush(
        createdBy,
        "decision_resolved",
        newStatus === "aprovada" ? "Decisao Aprovada" : "Decisao Rejeitada",
        newStatus === "aprovada"
          ? `Sua decisao "${title}" foi aprovada`
          : `Sua decisao "${title}" foi rejeitada`,
        "/decisoes",
      );
    }
  } catch {
    // ignore
  }

  return newStatus;
}
