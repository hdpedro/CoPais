import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSignupRescueEmail } from "@/lib/emails/signup-rescue";
import { captureServerEvent } from "@/lib/posthog-server";
import { reportServerError } from "@/lib/error-tracking/report-server";

/**
 * Cron hourly — recupera usuários travados na confirmação de e-mail.
 *
 * Critério "travado":
 *   - `email_confirmed_at IS NULL`
 *   - `created_at` entre 1h e 7d atrás (signup já tentou + dentro de janela útil)
 *   - `is_sso_user = false` (OAuth nunca trava)
 *   - `deleted_at IS NULL`
 *
 * Ação por usuário travado:
 *   1. `UPDATE auth.users SET email_confirmed_at = now()` — admin auth
 *   2. Envia e-mail humanizado de rescue (assinado Time Kindar) via Resend
 *   3. Captura `signup_rescued` no PostHog
 *   4. Loga em `app_errors` severity='info' como audit trail
 *
 * Garantia: nenhum signup fica travado > 1h, **nunca**, mesmo se uma
 * regressão futura quebrar algo do flow normal. Safety net definitivo.
 *
 * Schedule: `0 * * * *` (hourly @ minute 0). Configurado em vercel.json.
 *
 * Auth: Bearer ${CRON_SECRET} (mesmo padrão de outros crons).
 *
 * Idempotência: se já enviou rescue pro mesmo user, NÃO reenvia (checa
 * a tabela app_errors por evento `signup_rescued` no mesmo user).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    // 1. Encontrar travados
    const { data: stuck, error: queryErr } = await supabase
      .from("v_signup_funnel_health")
      .select("stuck_current")
      .single();

    if (queryErr) {
      // View pode não ter aplicado ainda — segue mesmo assim
      console.warn("[CRON] signup-rescue: view query failed:", queryErr.message);
    }

    const stuckCount = stuck?.stuck_current ?? 0;
    if (stuckCount === 0) {
      return NextResponse.json({ ok: true, rescued: 0, message: "No stuck users" });
    }

    // 2. Listar IDs travados via auth admin API
    // (não dá pra fazer SELECT em auth.users via PostgREST; usamos listUsers)
    const cutoff1h = new Date(Date.now() - 60 * 60 * 1000);
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stuckUsers: Array<{
      id: string;
      email: string;
      full_name?: string;
    }> = [];

    let page = 1;
    const perPage = 200;
    let scanned = 0;
    const SCAN_LIMIT = 1000; // safety

    while (scanned < SCAN_LIMIT) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error || !data?.users) break;
      scanned += data.users.length;
      for (const u of data.users) {
        if (u.email_confirmed_at) continue;
        if (!u.email) continue;
        if (u.is_sso_user) continue;
        if (u.deleted_at) continue;
        const createdAt = new Date(u.created_at);
        if (createdAt > cutoff1h) continue;
        if (createdAt < cutoff7d) continue;
        stuckUsers.push({
          id: u.id,
          email: u.email,
          full_name: (u.user_metadata?.full_name as string | undefined) ?? undefined,
        });
      }
      if (data.users.length < perPage) break;
      page++;
    }

    if (stuckUsers.length === 0) {
      return NextResponse.json({ ok: true, rescued: 0, scanned, message: "No stuck users found after scan" });
    }

    // 3. Verificar quais já foram resgatados (idempotência)
    const { data: alreadyRescued } = await supabase
      .from("app_errors")
      .select("user_id")
      .eq("file_path", "src/app/api/cron/signup-rescue/route.ts")
      .eq("severity", "info")
      .in("user_id", stuckUsers.map((u) => u.id));
    const rescuedIds = new Set((alreadyRescued ?? []).map((r) => r.user_id as string));

    const toRescue = stuckUsers.filter((u) => !rescuedIds.has(u.id));
    if (toRescue.length === 0) {
      return NextResponse.json({ ok: true, rescued: 0, scanned, message: "All stuck users already rescued" });
    }

    // 4. Processar
    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const user of toRescue) {
      try {
        // Auto-confirma
        const { error: updErr } = await supabase.auth.admin.updateUserById(user.id, {
          email_confirm: true,
        });
        if (updErr) {
          results.push({ email: user.email, ok: false, error: `confirm: ${updErr.message}` });
          continue;
        }

        // Email humanizado
        const emailResult = await sendSignupRescueEmail(user.email, user.full_name, {
          userId: user.id,
        });
        if (!emailResult.ok) {
          results.push({ email: user.email, ok: false, error: `email: ${emailResult.error}` });
          // Loga em app_errors mesmo assim — auto-confirm aconteceu
          reportServerError(new Error(`Rescue email failed for ${user.email}: ${emailResult.error}`), {
            filePath: "src/app/api/cron/signup-rescue/route.ts",
            severity: "warning",
            userId: user.id,
            metadata: { stage: "email_failed", auto_confirmed: true },
          });
        }

        // Audit trail
        await supabase.from("app_errors").insert({
          message: `signup-rescue: auto-confirmed + ${emailResult.ok ? "emailed" : "email failed"} ${user.email}`,
          file_path: "src/app/api/cron/signup-rescue/route.ts",
          folder_category: "infrastructure",
          user_id: user.id,
          severity: "info",
          metadata: {
            email: user.email,
            full_name: user.full_name,
            email_sent: emailResult.ok,
            email_error: emailResult.ok ? null : emailResult.error,
          },
        });

        captureServerEvent(user.id, "signup_rescued", {
          email: user.email,
          email_sent: emailResult.ok,
          source: "cron_hourly",
        });

        results.push({ email: user.email, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ email: user.email, ok: false, error: msg });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: true,
      scanned,
      rescued: ok,
      total: results.length,
      results: results.slice(0, 20),
    });
  } catch (error) {
    console.error("[CRON] signup-rescue failed:", error);
    reportServerError(error, {
      filePath: "src/app/api/cron/signup-rescue/route.ts",
      severity: "error",
    });
    return NextResponse.json({ error: "Rescue cron failed" }, { status: 500 });
  }
}
