/* ------------------------------------------------------------------ */
/* brain-undo.ts — undo seguro (I/O, Regra 11)                          */
/*                                                                      */
/* Carrega os artefatos do intake + a entidade viva, reconstrói o spec  */
/* (mesma normalização do commit) pra recomputar o hash, decide remover */
/* vs detach (puro, undo-decision.ts), aplica atômico via RPC           */
/* brain_intake_apply_undo, e purga a mídia do bucket. Não apaga        */
/* trabalho posterior: "7 serão removidos, 1 foi alterado e permanece". */
/* ------------------------------------------------------------------ */

import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { decideUndo, type ArtifactSnapshot } from "@/lib/ai/brain/undo-decision";
import { reconstructHashInputFromSchoolLogRow } from "@/lib/ai/brain/undo-reconstruct";
import { schoolLogPayloadHash } from "@/lib/ai/brain/materialize-payload";
import { captureServerEvent } from "@/lib/posthog-server";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;
const FILE = "src/lib/services/brain-undo.ts";

export type UndoResult =
  | { kind: "undone"; removed: number; detached: number; message: string }
  | { kind: "error"; message: string };

interface SchoolLogRow {
  id: string;
  child_id: string | null;
  log_type: string;
  title: string;
  subject: string | null;
  description: string | null;
  log_date: string;
  priority: string;
  /** Espelho 1:1 no calendário (events.school_log_id) — traz o event_time. */
  events?: { event_time: string | null }[] | null;
}

export async function undoIntake(args: {
  supabase: SupabaseServer;
  intakeId: string;
  /** Ator EXPLÍCITO (WhatsApp/service_role sem JWT). Ausente (PWA/Native) →
   *  auth.uid(). A RPC usa coalesce(auth.uid(), este). Ver migration 00132. */
  actorUserId?: string;
}): Promise<UndoResult> {
  const { supabase, intakeId } = args;
  try {
    // Dispatch por docType: SAÚDE tem entity types próprios (medical_appointment/
    // active_medication/illness_episode) + RPC própria (apply_undo_health).
    const { data: dt } = await supabase.from("brain_intakes").select("doc_type").eq("id", intakeId).single();
    if ((dt?.doc_type as string | undefined) === "health_visit") {
      return await undoHealthVisit(args);
    }
    // GUARDA & ROTINA: a RPC lê a PRÓPRIA proveniência (sem arrays do client);
    // acordo já aprovado NÃO se desfaz unilateralmente (fica, conta em kept).
    if ((dt?.doc_type as string | undefined) === "custody_routine") {
      return await undoCustodyRoutine(args);
    }
    // DESPESAS (Fase 2): pendente deleta; aprovada/rejeitada = o coparente já
    // agiu → fica (kept), mesma regra da troca aprovada.
    if ((dt?.doc_type as string | undefined) === "expense") {
      return await undoExpense(args);
    }
    // CONVITES (C2): delete por proveniência (events não tem updated_at —
    // sem detach de editado; a janela de undo é curta e o preview foi visto).
    if ((dt?.doc_type as string | undefined) === "event_invite") {
      return await undoEventInvite(args);
    }

    // 1. Artefatos ainda ativos (não detached/undone) deste intake.
    const { data: artifacts, error: artErr } = await supabase
      .from("brain_intake_artifacts")
      .select("id, entity_id, original_payload_hash")
      .eq("intake_id", intakeId)
      .eq("entity_type", "school_log")
      .is("detached_at", null)
      .is("undone_at", null);
    if (artErr) {
      await reportServerError(artErr, { filePath: FILE, metadata: { step: "load_artifacts", intakeId } });
      return { kind: "error", message: "Falha ao carregar o que foi criado." };
    }
    if (!artifacts || artifacts.length === 0) {
      return { kind: "undone", removed: 0, detached: 0, message: "Nada a desfazer." };
    }

    // 2. school_logs vivos + event_time do espelho events (1:1).
    const entityIds = artifacts.map((a) => a.entity_id as string);
    const { data: rows } = await supabase
      .from("school_logs")
      .select("id, child_id, log_type, title, subject, description, log_date, priority, events!school_log_id(event_time)")
      .in("id", entityIds);
    const liveById = new Map<string, SchoolLogRow>();
    for (const r of (rows ?? []) as SchoolLogRow[]) liveById.set(r.id, r);

    // 3. Decisão pura: recomputa o hash da linha viva (mesma normalização do
    //    commit) e compara. Intocada → remove; editada/ausente → detach.
    const snapshots: ArtifactSnapshot[] = artifacts.map((a) => {
      const row = liveById.get(a.entity_id as string) ?? null;
      return {
        artifactId: a.id as string,
        entityId: a.entity_id as string,
        originalPayloadHash: (a.original_payload_hash as string) ?? "",
        currentHash: row
          ? schoolLogPayloadHash(
              reconstructHashInputFromSchoolLogRow({
                child_id: row.child_id,
                log_type: row.log_type,
                title: row.title,
                subject: row.subject,
                description: row.description,
                log_date: row.log_date,
                priority: row.priority,
                event_time: row.events?.[0]?.event_time ?? null,
              }),
            )
          : null,
      };
    });
    const decision = decideUndo(snapshots);

    // 4. Aplica atômico (delete + detach + status='undone' + audit).
    const { data: applied, error: rpcErr } = await supabase.rpc("brain_intake_apply_undo", {
      p_intake_id: intakeId,
      p_delete_entity_ids: decision.deleteEntityIds,
      p_detach_artifact_ids: decision.detachArtifactIds,
      p_actor_user_id: args.actorUserId ?? null,
    });
    if (rpcErr || (applied as { outcome?: string } | null)?.outcome !== "undone") {
      await reportServerError(rpcErr ?? new Error("undo_not_applied"), { filePath: FILE, metadata: { step: "apply_undo", intakeId } });
      return { kind: "error", message: "Falha ao desfazer." };
    }
    const removed = (applied as { removed: number }).removed;
    const detached = (applied as { detached: number }).detached;

    // 5. Purga a mídia do bucket (non-fatal) + audita.
    const { data: intake } = await supabase
      .from("brain_intakes")
      .select("group_id, source_media_path")
      .eq("id", intakeId)
      .single();
    const path = intake?.source_media_path as string | null;
    if (path) {
      // Via service_role: a RLS DELETE do bucket é owner-only, então um undo
      // por COPARENTE (não-owner) não apagaria a mídia pelo client. O
      // apply_undo já validou is_group_member; o path vem da própria linha do
      // intake (não é input do usuário). Mesmo motivo p/ o null + audit
      // (creator-update RLS bloquearia o coparente).
      const admin = createAdminClient();
      const { error: rmErr } = await admin.storage.from("documents").remove([path]);
      if (!rmErr) {
        await admin.from("brain_intakes").update({ source_media_path: null }).eq("id", intakeId);
        await admin.from("brain_intake_audit").insert({
          intake_id: intakeId,
          group_id: intake?.group_id,
          action: "media_purged",
          detail: { via: "undo" },
        });
      }
    }

    // Telemetria de undo (cobre PWA e WhatsApp; até agora invisível).
    const uid = args.actorUserId ?? (await supabase.auth.getUser()).data.user?.id;
    if (uid) captureServerEvent(uid, "brain_intake_undone", { intake_id: intakeId, removed, detached });

    const message =
      detached > 0
        ? `${removed} removido(s); ${detached} foi(ram) alterado(s) depois e permanece(m).`
        : `${removed} removido(s).`;
    return { kind: "undone", removed, detached, message };
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "undo", intakeId } });
    return { kind: "error", message: "Não consegui desfazer agora. Tente de novo." };
  }
}

/** Purga a mídia (foto/áudio) do bucket após o undo — via service_role (a RLS
 *  DELETE é owner-only; um undo por coparente não apagaria pelo client). O path
 *  vem da própria linha do intake (não é input do usuário). Non-fatal. */
async function purgeIntakeMedia(supabase: SupabaseServer, intakeId: string): Promise<void> {
  const { data: intake } = await supabase
    .from("brain_intakes")
    .select("group_id, source_media_path")
    .eq("id", intakeId)
    .single();
  const path = intake?.source_media_path as string | null;
  if (!path) return;
  const admin = createAdminClient();
  const { error: rmErr } = await admin.storage.from("documents").remove([path]);
  if (rmErr) return;
  await admin.from("brain_intakes").update({ source_media_path: null }).eq("id", intakeId);
  await admin.from("brain_intake_audit").insert({
    intake_id: intakeId,
    group_id: intake?.group_id,
    action: "media_purged",
    detail: { via: "undo" },
  });
}

/**
 * Undo de uma CONSULTA (docType health_visit): deleta os registros de saúde
 * criados por este intake (medical_appointments/active_medications/illness_
 * episodes) via RPC atômica apply_undo_health.
 *
 * A0 = delete-all (a janela do "Desfazer" é imediata, nada foi editado). O
 * detach-on-edit (preservar registro alterado depois, como no escolar) é refino
 * posterior — exigiria hash round-trip por tipo, e o appointment_date TIMESTAMPTZ
 * (compõe data+hora) não distingue hora-nula de meio-dia no round-trip.
 */
/** Undo de GUARDA & ROTINA: exceções/férias e leva/busca somem (o dia volta
 *  ao padrão semanal); troca ainda pendente é cancelada; troca já APROVADA é
 *  acordo bilateral — fica (a RPC conta em kept_agreements e a copy avisa). */
async function undoCustodyRoutine(args: {
  supabase: SupabaseServer;
  intakeId: string;
  actorUserId?: string;
}): Promise<UndoResult> {
  const { supabase, intakeId } = args;
  try {
    const { data: applied, error: rpcErr } = await supabase.rpc("brain_intake_apply_undo_custody", {
      p_intake_id: intakeId,
      p_actor_user_id: args.actorUserId ?? null,
    });
    if (rpcErr || (applied as { outcome?: string } | null)?.outcome !== "undone") {
      await reportServerError(rpcErr ?? new Error("undo_not_applied"), {
        filePath: FILE,
        metadata: { step: "apply_undo_custody", intakeId },
      });
      return { kind: "error", message: "Falha ao desfazer." };
    }
    const removed = (applied as { removed: number }).removed;
    const kept = (applied as { kept_agreements?: number }).kept_agreements ?? 0;

    await purgeIntakeMedia(supabase, intakeId);

    const uid = args.actorUserId ?? (await supabase.auth.getUser()).data.user?.id;
    if (uid) captureServerEvent(uid, "brain_intake_undone", { intake_id: intakeId, doc_type: "custody_routine", removed, kept });

    // `detached` transporta os acordos mantidos (a copy dos canais explica).
    return { kind: "undone", removed, detached: kept, message: `${removed} item(ns) de guarda/rotina desfeito(s).` };
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "undo_custody", intakeId } });
    return { kind: "error", message: "Não consegui desfazer agora. Tente de novo." };
  }
}

/** Undo de DESPESAS: a RPC lê a própria proveniência; só 'pending' some —
 *  aprovada/rejeitada é decisão bilateral feita (fica, conta em kept). */
async function undoExpense(args: {
  supabase: SupabaseServer;
  intakeId: string;
  actorUserId?: string;
}): Promise<UndoResult> {
  const { supabase, intakeId } = args;
  try {
    const { data: applied, error: rpcErr } = await supabase.rpc("brain_intake_apply_undo_expense", {
      p_intake_id: intakeId,
      p_actor_user_id: args.actorUserId ?? null,
    });
    if (rpcErr || (applied as { outcome?: string } | null)?.outcome !== "undone") {
      await reportServerError(rpcErr ?? new Error("undo_not_applied"), {
        filePath: FILE,
        metadata: { step: "apply_undo_expense", intakeId },
      });
      return { kind: "error", message: "Falha ao desfazer." };
    }
    const removed = (applied as { removed: number }).removed;
    const kept = (applied as { kept_agreements?: number }).kept_agreements ?? 0;

    await purgeIntakeMedia(supabase, intakeId);

    const uid = args.actorUserId ?? (await supabase.auth.getUser()).data.user?.id;
    if (uid) captureServerEvent(uid, "brain_intake_undone", { intake_id: intakeId, doc_type: "expense", removed, kept });

    return { kind: "undone", removed, detached: kept, message: `${removed} despesa(s) desfeita(s).` };
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "undo_expense", intakeId } });
    return { kind: "error", message: "Não consegui desfazer agora. Tente de novo." };
  }
}

/** Undo de CONVITES: a RPC deleta os eventos deste intake por proveniência. */
async function undoEventInvite(args: {
  supabase: SupabaseServer;
  intakeId: string;
  actorUserId?: string;
}): Promise<UndoResult> {
  const { supabase, intakeId } = args;
  try {
    const { data: applied, error: rpcErr } = await supabase.rpc("brain_intake_apply_undo_invite", {
      p_intake_id: intakeId,
      p_actor_user_id: args.actorUserId ?? null,
    });
    if (rpcErr || (applied as { outcome?: string } | null)?.outcome !== "undone") {
      await reportServerError(rpcErr ?? new Error("undo_not_applied"), {
        filePath: FILE,
        metadata: { step: "apply_undo_invite", intakeId },
      });
      return { kind: "error", message: "Falha ao desfazer." };
    }
    const removed = (applied as { removed: number }).removed;

    await purgeIntakeMedia(supabase, intakeId);

    const uid = args.actorUserId ?? (await supabase.auth.getUser()).data.user?.id;
    if (uid) captureServerEvent(uid, "brain_intake_undone", { intake_id: intakeId, doc_type: "event_invite", removed });

    return { kind: "undone", removed, detached: 0, message: `${removed} evento(s) removido(s).` };
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "undo_invite", intakeId } });
    return { kind: "error", message: "Não consegui desfazer agora. Tente de novo." };
  }
}

async function undoHealthVisit(args: {
  supabase: SupabaseServer;
  intakeId: string;
  actorUserId?: string;
}): Promise<UndoResult> {
  const { supabase, intakeId } = args;
  try {
    const { data: artifacts, error: artErr } = await supabase
      .from("brain_intake_artifacts")
      .select("id, entity_id")
      .eq("intake_id", intakeId)
      .in("entity_type", ["medical_appointment", "active_medication", "illness_episode"])
      .is("detached_at", null)
      .is("undone_at", null);
    if (artErr) {
      await reportServerError(artErr, { filePath: FILE, metadata: { step: "load_health_artifacts", intakeId } });
      return { kind: "error", message: "Falha ao carregar o que foi criado." };
    }
    if (!artifacts || artifacts.length === 0) {
      return { kind: "undone", removed: 0, detached: 0, message: "Nada a desfazer." };
    }

    const deleteEntityIds = artifacts.map((a) => a.entity_id as string);
    const { data: applied, error: rpcErr } = await supabase.rpc("brain_intake_apply_undo_health", {
      p_intake_id: intakeId,
      p_delete_entity_ids: deleteEntityIds,
      p_detach_artifact_ids: [],
      p_actor_user_id: args.actorUserId ?? null,
    });
    if (rpcErr || (applied as { outcome?: string } | null)?.outcome !== "undone") {
      await reportServerError(rpcErr ?? new Error("undo_not_applied"), { filePath: FILE, metadata: { step: "apply_undo_health", intakeId } });
      return { kind: "error", message: "Falha ao desfazer." };
    }
    const removed = (applied as { removed: number }).removed;
    const detached = (applied as { detached: number }).detached;

    await purgeIntakeMedia(supabase, intakeId);

    const uid = args.actorUserId ?? (await supabase.auth.getUser()).data.user?.id;
    if (uid) captureServerEvent(uid, "brain_intake_undone", { intake_id: intakeId, doc_type: "health_visit", removed, detached });

    return { kind: "undone", removed, detached, message: `${removed} registro(s) da consulta removido(s).` };
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "undo_health", intakeId } });
    return { kind: "error", message: "Não consegui desfazer agora. Tente de novo." };
  }
}
