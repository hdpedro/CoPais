import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron diário 03:00 BRT (06:00 UTC) — rolling horizon de calendar_occurrences.
 *
 * ═══ Por que existe ═══
 *
 * Bug histórico (#35, resolvido nessa migration 00096): atividades recorrentes
 * paravam de gerar occurrences após ~365 dias do seu INSERT/UPDATE original
 * porque `generate_activity_occurrences()` usa `v_horizon_end = CURRENT_DATE
 * + 365` avaliado **no momento da chamada**. Trigger só dispara em INSERT/
 * UPDATE → atividade criada há 1 ano simplesmente "some" do calendário.
 *
 * Solução estrutural (não band-aid): cron diário detecta atividades ativas
 * cujo MAX(occurrence_date) está a menos de 90 dias do horizon e re-chama
 * `generate_activity_occurrences(id)` — idempotente (DELETE+REINSERT),
 * estende em ~275 dias por iteração.
 *
 * Garante SEMPRE 12+ meses de runway pra atividades ativas, independente
 * de quando foram criadas.
 *
 * ═══ Schedule ═══
 *
 * `0 6 * * *` UTC = 03:00 BRT (off-peak, sem competir com:
 *   - 07:00 BRT briefing matinal
 *   - 08:00 BRT vaccine-snooze
 *   - 09:00 BRT vaccine-due-notify
 *   - 10:00 BRT custody-change
 *   - 11:00 BRT renewal-reminder
 *   - 12:00 BRT vaccine-due-notify
 *   - 14:00 BRT retention
 *   - 17:00 BRT trial-reminder)
 *
 * ═══ Idempotência ═══
 *
 * Re-rodar no mesmo dia = no-op (atividades já estendidas têm runway >90d
 * de novo). Cron failure num dia = recovery automático no próximo. Zero
 * risk de duplicar occurrences (generate_activity_occurrences faz DELETE+
 * INSERT atômico).
 *
 * ═══ Observabilidade ═══
 *
 * Returns `{ extended, totalRowsInserted, expiredRecovered, durationMs }`.
 * `expiredRecovered > 0` = atividade que JÁ SUMIU do calendário voltou —
 * sinal de bug em outro lugar (não deveria acontecer pós-fix).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .rpc("extend_due_activity_occurrences", { p_threshold_days: 90 })
      .single<{
        extended_count: number;
        total_rows_inserted: number;
        expired_recovered: number;
      }>();

    if (error) {
      console.error("[CRON regenerate-occurrences] rpc failed:", error);
      return NextResponse.json(
        { error: "Failed to extend occurrences", detail: error.message },
        { status: 500 },
      );
    }

    const durationMs = Date.now() - startMs;
    const extended = data?.extended_count ?? 0;
    const totalInserted = data?.total_rows_inserted ?? 0;
    const expiredRecovered = data?.expired_recovered ?? 0;

    // Sinal de saúde: expiredRecovered > 0 em produção estável é red flag
    // (atividade chegou a expirar antes do cron pegar). Logamos pra Sentry
    // via console.warn (Vercel Logs → Sentry inbound).
    if (expiredRecovered > 0) {
      console.warn(
        `[CRON regenerate-occurrences] ${expiredRecovered} atividades RE` +
          `CUPERADAS de estado expirado — investigar se cron rodou ontem ` +
          `+ por que threshold 90d não preveniu.`,
      );
    }

    return NextResponse.json({
      ok: true,
      extended,
      totalRowsInserted: totalInserted,
      expiredRecovered,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON regenerate-occurrences] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal error", detail: String(error) },
      { status: 500 },
    );
  }
}
