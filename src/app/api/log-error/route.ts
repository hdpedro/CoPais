/* ------------------------------------------------------------------ */
/* /api/log-error — captures and classifies application errors         */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyFolder } from "@/lib/error-tracking/classify";
import { notifyDiscord } from "@/lib/discord/discord-client";

interface LogErrorBody {
  message: string;
  stack?: string;
  filePath?: string;
  userId?: string;
  // Severity expandido em 2026-05-17 (migration 00085) — 'info' usado pelo
  // withTimeout wrapper do native pra telemetria de defesa-em-profundidade
  // (timeouts que recuperam com empty-state). Antes era apenas warning+.
  severity?: "info" | "warning" | "error" | "critical";
  sentryEventId?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const body: LogErrorBody = await req.json();

    if (!body.message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const folderCategory = classifyFolder(body.filePath);
    const severity = body.severity ?? "error";

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("app_errors")
      .insert({
        message: body.message,
        stack_trace: body.stack ?? null,
        file_path: body.filePath ?? null,
        folder_category: folderCategory,
        user_id: body.userId ?? null,
        severity,
        sentry_event_id: body.sentryEventId ?? null,
        metadata: body.metadata ?? {},
      })
      .select("id")
      .single();

    if (error) {
      // Surfacar PostgrestError completo — antes era um truncated "[log-error]
      // Supabase insert failed: [object]" sem code/hint/details. Resultado:
      // 5 erros 500 em rajada hoje (2026-05-28 10:56 UTC) que não consegui
      // diagnosticar sem reproduzir manualmente. Agora código + dica vão pro
      // log Vercel + pro response body pro caller (native) capturar.
      console.error("[log-error] Supabase insert failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        {
          error: "Failed to log error",
          code: error.code ?? null,
          detail: error.message ?? null,
        },
        { status: 500 }
      );
    }

    // Fire-and-forget Discord notification.
    // Skip Discord pra severity='info' (telemetria — não acorda ninguém).
    // 34 timeouts do withTimeout em 7 dias antes desse filtro spammavam o
    // Discord como se fossem bugs.
    if (severity !== "info") {
      notifyDiscord({
        id: data.id,
        message: body.message,
        stack: body.stack,
        filePath: body.filePath,
        folderCategory,
        severity,
        sentryEventId: body.sentryEventId,
      }).catch((err) =>
        console.error("[log-error] Discord notification failed:", err)
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (err) {
    // Surfacar tipo + mensagem pra distinguir JSON parse error, Supabase
    // client init, etc. Antes vinha truncado "[object]" sem ajuda.
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[log-error] Unexpected error:", { type: typeof err, detail });
    return NextResponse.json(
      { error: "Internal server error", detail },
      { status: 500 }
    );
  }
}
