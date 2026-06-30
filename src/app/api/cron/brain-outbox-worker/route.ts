/* ------------------------------------------------------------------ */
/* GET /api/cron/brain-outbox-worker — entrega a coordenação do Brain   */
/*                                                                      */
/* Cron (Bearer CRON_SECRET). Reivindica um lote do brain_outbox e       */
/* entrega (push/in-app), com retry/backoff e DLQ. maxDuration 300s.    */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { runOutboxWorker } from "@/lib/services/brain-outbox";

export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  // Fail-closed em produção: sem CRON_SECRET configurado, a rota NÃO fica
  // aberta (503). Em dev/test segue opcional (paridade com os demais crons).
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    return NextResponse.json({ error: "Cron mal configurado." }, { status: 503 });
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const result = await runOutboxWorker(50);
  return NextResponse.json({ ok: true, ...result });
}
