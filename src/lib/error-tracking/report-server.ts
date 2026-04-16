/* ------------------------------------------------------------------ */
/* Server-side error reporter                                          */
/* Use in Server Actions, API routes, cron jobs                        */
/* Inserts directly into Supabase + notifies Discord (non-blocking)    */
/* ------------------------------------------------------------------ */

import { createAdminClient } from "@/lib/supabase/admin";
import { classifyFolder } from "./classify";
import { notifyDiscord } from "@/lib/discord/discord-client";

/**
 * Report an error from server-side code.
 * Non-blocking, never throws — safe to call in any catch block.
 */
export async function reportServerError(
  error: unknown,
  context: {
    filePath: string;
    severity?: "warning" | "error" | "critical";
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
      }).catch(() => {});
    }
  } catch {
    // Never throw — error reporting must not cause cascading failures
  }
}
