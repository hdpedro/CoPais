/* ------------------------------------------------------------------ */
/* GET /api/cron/purge-expired-intakes — retenção/expiração do Brain    */
/*                                                                      */
/* Cron (Bearer CRON_SECRET). Expira confirmações vencidas + apaga       */
/* mídia além da retenção de 90 dias. maxDuration 120s.                 */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredIntakes } from "@/lib/services/brain-purge";

export const maxDuration = 120;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const result = await purgeExpiredIntakes();
  return NextResponse.json({ ok: true, ...result });
}
