/* ------------------------------------------------------------------ */
/* Server-side error reporter                                          */
/* Use in Server Actions, API routes, cron jobs                        */
/* Inserts directly into Supabase + notifies Discord + envia ao Sentry */
/* Non-blocking, never throws                                          */
/* ------------------------------------------------------------------ */

import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyFolder } from "./classify";
import { notifyDiscord } from "@/lib/discord/discord-client";

/**
 * Report an error from server-side code.
 *
 * Cross-link com Sentry (configurado em 2026-05-17):
 *  1. Captura no Sentry com tags (folder_category, severity) + extra (file_path,
 *     app_error_id) — permite buscar a row do Postgres a partir do issue Sentry.
 *  2. Insere no Supabase `app_errors` com `sentry_event_id` populado — permite
 *     ir do Discord/admin UI direto pro stack symbolicated no Sentry.
 *  3. Notifica Discord (com botão de auto-fix Claude+GitHub).
 *
 * Non-blocking, never throws.
 */
export async function reportServerError(
  error: unknown,
  context: {
    filePath: string;
    severity?: "info" | "warning" | "error" | "critical";
    userId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const message =
      error instanceof Error ? error.message : String(error);
    const stack =
      error instanceof Error ? error.stack ?? null : null;
    const folderCategory = classifyFolder(context.filePath);
    const severity = context.severity ?? "error";

    // Sentry capture FIRST — pra ter o event_id pra linkar no Postgres.
    // `info` no Sentry vira `level: "info"`; resto bate com Sentry severities.
    let sentryEventId: string | null = null;
    try {
      sentryEventId = Sentry.captureException(error, {
        level: severity === "critical" ? "fatal" : severity === "info" ? "info" : severity,
        tags: {
          folder_category: folderCategory,
          severity,
          source: "report-server",
        },
        extra: {
          file_path: context.filePath,
          ...(context.metadata ?? {}),
        },
        user: context.userId ? { id: context.userId } : undefined,
      });
    } catch {
      // Sentry pode falhar (sem DSN em dev, network, etc.) — não bloqueia
      // o insert no Postgres.
    }

    const supabase = createAdminClient();
    const { data } = await supabase
      .from("app_errors")
      .insert({
        message,
        stack_trace: stack,
        file_path: context.filePath,
        folder_category: folderCategory,
        user_id: context.userId ?? null,
        severity,
        sentry_event_id: sentryEventId,
        metadata: context.metadata ?? {},
      })
      .select("id")
      .single();

    if (data?.id) {
      notifyDiscord({
        id: data.id,
        message,
        stack: stack ?? undefined,
        filePath: context.filePath,
        folderCategory,
        severity,
        sentryEventId: sentryEventId ?? undefined,
      }).catch(() => {});
    }
  } catch {
    // Never throw — error reporting must not cause cascading failures
  }
}
