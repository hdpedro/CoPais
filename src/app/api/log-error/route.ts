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
  severity?: "warning" | "error" | "critical";
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
      console.error("[log-error] Supabase insert failed:", error);
      return NextResponse.json(
        { error: "Failed to log error" },
        { status: 500 }
      );
    }

    // Fire-and-forget Discord notification
    notifyDiscord({
      id: data.id,
      message: body.message,
      stack: body.stack,
      filePath: body.filePath,
      folderCategory,
      severity,
    }).catch((err) =>
      console.error("[log-error] Discord notification failed:", err)
    );

    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error("[log-error] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
