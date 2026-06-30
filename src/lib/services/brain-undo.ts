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
}): Promise<UndoResult> {
  const { supabase, intakeId } = args;
  try {
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
