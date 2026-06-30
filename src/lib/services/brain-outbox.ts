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
}

/** Entrega um item. Lança em qualquer falha (o caller faz retry/DLQ). */
async function deliver(row: OutboxRow): Promise<void> {
  if (row.event_type !== "collab_notify") {
    throw new Error(`unknown event_type: ${row.event_type}`);
  }
  const p = row.payload ?? {};
  const recipientId = p.recipient_id as string | undefined;
  if (!recipientId) throw new Error("missing recipient_id");
  const count = Number(p.created_count) || 1;

  const localeMap = await getUsersLocale([recipientId]);
  const t = await getServerT(localeMap.get(recipientId));
  const title = t("notifications.brain.schoolCalendarTitle");
  const body = t("notifications.brain.schoolCalendarBody", { count });
  await createNotificationWithPush(recipientId, "brain_school_calendar", title, body, "/escola");
  captureServerEvent(recipientId, "brain_outbox_delivered", {
    intake_id: (p.intake_id as string | undefined) ?? null,
    event_type: row.event_type,
  });
}

/**
 * Processa um lote do outbox. Idempotente o suficiente: o claim com lease
 * evita dupla-pega; o dedupe_key UNIQUE evitou linhas duplicadas na origem.
 */
export async function runOutboxWorker(limit = 20): Promise<OutboxWorkerResult> {
  const admin = createAdminClient();
  const result: OutboxWorkerResult = { claimed: 0, delivered: 0, failed: 0, dead: 0 };

  const { data: rows, error } = await admin.rpc("brain_outbox_claim_batch", { p_limit: limit });
  if (error) {
    await reportServerError(error, { filePath: FILE, metadata: { step: "claim" } });
    return result;
  }
  const batch = (rows ?? []) as OutboxRow[];
  result.claimed = batch.length;

  for (const row of batch) {
    try {
      await deliver(row);
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
