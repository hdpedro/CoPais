/* ------------------------------------------------------------------ */
/* brain-outbox.ts — worker de entrega da coordenação (I/O)             */
/*                                                                      */
/* Roda como cron (service_role). Reivindica um lote do brain_outbox    */
/* (claim atômico com lease), entrega cada item e atualiza o status:    */
/* delivered | failed (+backoff 1/5/30) | dead (esgotou → DLQ). A       */
/* entrega é localizada POR DESTINATÁRIO (getServerT + locale). Reusa    */
/* createNotificationWithPush (padrão de notificação de atividade, NÃO   */
/* a Foundation Collab — atividades não têm CollabRecordType).          */
/* ------------------------------------------------------------------ */

import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithPush } from "@/lib/push";
import { getServerT } from "@/i18n/server";
import { getUsersLocale } from "@/lib/locale-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";
import { isDeadLettered, nextRetryDelayMs } from "@/lib/ai/brain/outbox-retry";
import { buildCustodyCoordinationBody } from "@/lib/ai/brain/custody-preview";
import type { MaterializationPlan } from "@/lib/ai/brain/types";

const FILE = "src/lib/services/brain-outbox.ts";

interface OutboxRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  attempts: number;
}

export interface OutboxWorkerResult {
  claimed: number;
  delivered: number;
  failed: number;
  dead: number;
  cancelled: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** Primeiro nome da criança (pro resumo de coordenação). Fallback calmo. */
async function childFirstName(admin: AdminClient, childId: string | undefined): Promise<string> {
  if (!childId) return "seu filho(a)";
  const { data } = await admin.from("children").select("full_name").eq("id", childId).single();
  const full = (data as { full_name?: string } | null)?.full_name ?? "";
  return full.split(" ")[0] || "seu filho(a)";
}

/** R3 — corpo contextual da coordenação de guarda: busca o plano do intake e
 *  o transforma nas combinações em si, ditas PRO destinatário ("fica com
 *  você"). As linhas nascem em pt (idioma do plano) → só substitui o corpo
 *  genérico quando o destinatário lê pt. Qualquer falha → null (fail-open). */
async function custodyContextualBody(
  admin: AdminClient,
  intakeId: string | undefined,
  recipientId: string,
  locale: string | undefined,
): Promise<string | null> {
  if (!intakeId) return null;
  if (locale && !locale.startsWith("pt")) return null;
  const { data: intake } = await admin
    .from("brain_intakes")
    .select("plan, group_id")
    .eq("id", intakeId)
    .single();
  const row = intake as { plan?: MaterializationPlan | null; group_id?: string } | null;
  const custody = row?.plan?.custody;
  if (!custody || !row?.group_id) return null;

  const { data: kids } = await admin
    .from("children")
    .select("id, full_name")
    .eq("group_id", row.group_id);
  const names = new Map(
    ((kids ?? []) as Array<{ id: string; full_name: string | null }>).map((k) => [
      k.id,
      (k.full_name ?? "").split(" ")[0],
    ]),
  );
  const body = buildCustodyCoordinationBody(
    custody,
    (id) => names.get(id) ?? "",
    names.size,
    recipientId,
  );
  return body || null;
}

/** Entrega um item. Lança em qualquer falha (o caller faz retry/DLQ). Localiza
 *  POR DESTINATÁRIO e ramifica pelo `kind` do payload (escolar vs saúde). */
async function deliver(admin: AdminClient, row: OutboxRow): Promise<void> {
  if (row.event_type !== "collab_notify") {
    throw new Error(`unknown event_type: ${row.event_type}`);
  }
  const p = row.payload ?? {};
  const recipientId = p.recipient_id as string | undefined;
  if (!recipientId) throw new Error("missing recipient_id");

  const localeMap = await getUsersLocale([recipientId]);
  const t = await getServerT(localeMap.get(recipientId));

  if (p.kind === "health_visit") {
    // Resumo pro coparente: título com o nome da criança, corpo com a contagem
    // de medicações. O DIAGNÓSTICO fica FORA do push (privacidade na tela de
    // bloqueio) — o detalhe completo está no app (/saude). Transportador.
    const childName = await childFirstName(admin, p.child_id as string | undefined);
    const medCount = Number(p.medication_count) || 0;
    const title = t("notifications.brain.healthVisitTitle", { child: childName });
    const body = t("notifications.brain.healthVisitBody", { count: medCount });
    await createNotificationWithPush(recipientId, "brain_health_visit", title, body, "/saude");
  } else if (p.kind === "custody_routine") {
    // Coordenação de GUARDA & ROTINA: o que valeu agora (exceção/férias/leva-
    // busca — notifica-e-vale) + o que está PROPOSTO aguardando resposta
    // (troca / mudança permanente). Detalhe no app (/calendario).
    const applied = Number(p.applied_count) || 0;
    const proposed = (Number(p.swap_proposal_count) || 0) + (Number(p.slot_proposal_count) || 0);
    const title = t("notifications.brain.custodyRoutineTitle");
    let body = t("notifications.brain.custodyRoutineBody", { applied, proposed });
    // R3: o corpo vira as combinações em si, ditas pro destinatário ("fica
    // com você"). Falha/locale não-pt/plano vazio → corpo genérico acima.
    try {
      const contextual = await custodyContextualBody(
        admin,
        p.intake_id as string | undefined,
        recipientId,
        localeMap.get(recipientId),
      );
      if (contextual) body = contextual;
    } catch {
      // fail-open: a coordenação nunca deixa de sair por causa do contexto
    }
    await createNotificationWithPush(recipientId, "brain_custody_routine", title, body, "/calendario");
  } else if (p.kind === "expense") {
    // Coordenação de DESPESA: quantas e o total — o detalhe (e a APROVAÇÃO,
    // que segue o fluxo normal do módulo) fica no app (/despesas).
    const count = Number(p.count) || 1;
    const total = Number(p.total_amount) || 0;
    const title = t("notifications.brain.expenseTitle");
    const body = t("notifications.brain.expenseBody", { count, total: total.toFixed(2).replace(".", ",") });
    await createNotificationWithPush(recipientId, "brain_expense", title, body, "/despesas");
  } else {
    const count = Number(p.created_count) || 1;
    const title = t("notifications.brain.schoolCalendarTitle");
    const body = t("notifications.brain.schoolCalendarBody", { count });
    await createNotificationWithPush(recipientId, "brain_school_calendar", title, body, "/escola");
  }

  captureServerEvent(recipientId, "brain_outbox_delivered", {
    intake_id: (p.intake_id as string | undefined) ?? null,
    event_type: row.event_type,
    kind: (p.kind as string | undefined) ?? "school_calendar",
  });
}

/**
 * Processa um lote do outbox. Idempotente o suficiente: o claim com lease
 * evita dupla-pega; o dedupe_key UNIQUE evitou linhas duplicadas na origem.
 */
export async function runOutboxWorker(limit = 20): Promise<OutboxWorkerResult> {
  const admin = createAdminClient();
  const result: OutboxWorkerResult = { claimed: 0, delivered: 0, failed: 0, dead: 0, cancelled: 0 };

  const { data: rows, error } = await admin.rpc("brain_outbox_claim_batch", { p_limit: limit });
  if (error) {
    await reportServerError(error, { filePath: FILE, metadata: { step: "claim" } });
    return result;
  }
  const batch = (rows ?? []) as OutboxRow[];
  result.claimed = batch.length;

  for (const row of batch) {
    try {
      // Guarda (defesa em profundidade): não entrega coordenação de um intake
      // que não está mais 'executed' — ex.: desfeito entre o claim e a entrega.
      // O undo já marca o outbox 'cancelled' (00129); isto cobre a corrida em
      // que esta linha foi reivindicada um instante ANTES do undo.
      const intakeId = (row.payload as { intake_id?: string } | null)?.intake_id;
      if (intakeId) {
        const { data: intake } = await admin
          .from("brain_intakes")
          .select("status")
          .eq("id", intakeId)
          .single();
        if (intake && intake.status !== "executed") {
          await admin
            .from("brain_outbox")
            .update({ status: "cancelled", last_error: `intake_${intake.status}` })
            .eq("id", row.id);
          result.cancelled += 1;
          continue;
        }
      }
      await deliver(admin, row);
      await admin
        .from("brain_outbox")
        .update({ status: "delivered", delivered_at: new Date().toISOString() })
        .eq("id", row.id);
      result.delivered += 1;
    } catch (err) {
      const lastError = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      if (isDeadLettered(row.attempts)) {
        await admin.from("brain_outbox").update({ status: "dead", last_error: lastError }).eq("id", row.id);
        result.dead += 1;
        // DLQ não some em silêncio: registra pro painel de falhas.
        await reportServerError(err, { filePath: FILE, severity: "warning", metadata: { step: "dead_letter", outboxId: row.id, attempts: row.attempts } });
      } else {
        const nextAt = new Date(Date.now() + nextRetryDelayMs(row.attempts)).toISOString();
        await admin
          .from("brain_outbox")
          .update({ status: "failed", last_error: lastError, next_attempt_at: nextAt })
          .eq("id", row.id);
        result.failed += 1;
      }
    }
  }

  return result;
}
