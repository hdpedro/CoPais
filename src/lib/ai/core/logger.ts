/* ------------------------------------------------------------------ */
/* AI Logger — logs all AI requests to Supabase                        */
/* ------------------------------------------------------------------ */

import { createAdminClient } from "@/lib/supabase/admin";
import { AIRequestLog } from "./types";

/**
 * Log an AI request to the ai_requests table.
 * Uses admin client to bypass RLS (server-side only).
 * Non-blocking: errors are caught and logged, never thrown.
 */
export async function logAIRequest(log: AIRequestLog): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("ai_requests").insert({
      user_id: log.userId,
      group_id: log.groupId || null,
      provider: log.provider,
      feature: log.feature,
      success: log.success,
      response_time_ms: log.responseTimeMs,
      error_message: log.errorMessage || null,
    });
  } catch (err) {
    console.error("[ai-logger] Failed to log request:", err);
  }
}
