/* ------------------------------------------------------------------ */
/* brain-purge.ts — retenção/expiração (I/O, cron com service_role)     */
/*                                                                      */
/*  - Expira intakes em awaiting_confirmation cuja confirmação venceu.   */
/*  - Apaga a MÍDIA (imagem/áudio) além da retenção de 90 dias do bucket */
/*    e audita 'media_purged'. Dados derivados ficam (provas já criadas).*/
/* LGPD: a foto pode ter rosto/voz da criança → não fica indefinidamente.*/
/* ------------------------------------------------------------------ */

import { createAdminClient } from "@/lib/supabase/admin";
import { reportServerError } from "@/lib/error-tracking/report-server";

const FILE = "src/lib/services/brain-purge.ts";

export interface PurgeResult {
  expired: number;
  purged: number;
}

export async function purgeExpiredIntakes(): Promise<PurgeResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const result: PurgeResult = { expired: 0, purged: 0 };

  try {
    // 1. Expira confirmações vencidas (awaiting_confirmation → expired).
    const { data: expiredRows } = await admin
      .from("brain_intakes")
      .update({ status: "expired", updated_at: nowIso })
      .eq("status", "awaiting_confirmation")
      .lte("confirmation_expires_at", nowIso)
      .select("id");
    result.expired = expiredRows?.length ?? 0;

    // 2. Purga mídia além da retenção (90d). Dados derivados permanecem.
    const { data: toPurge } = await admin
      .from("brain_intakes")
      .select("id, group_id, source_media_path")
      .lte("retention_expiry", nowIso)
      .not("source_media_path", "is", null)
      .limit(500);

    for (const row of toPurge ?? []) {
      const path = row.source_media_path as string;
      const { error: rmErr } = await admin.storage.from("documents").remove([path]);
      if (rmErr) continue; // tenta de novo no próximo ciclo
      await admin.from("brain_intakes").update({ source_media_path: null }).eq("id", row.id);
      await admin.from("brain_intake_audit").insert({
        intake_id: row.id,
        group_id: row.group_id,
        action: "media_purged",
        detail: { via: "cron" },
      });
      result.purged += 1;
    }
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "purge" } });
  }

  return result;
}
