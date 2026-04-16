import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportServerError } from "@/lib/error-tracking/report-server";
import type { CronResult, CronReport } from "./types";

const MAX_ERROR_LENGTH = 500;

interface RunCronOptions {
  name: string;
  request: NextRequest;
  execute: () => Promise<CronResult>;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function errorToString(err: unknown): string {
  return truncate(
    err instanceof Error ? err.message : String(err),
    MAX_ERROR_LENGTH
  );
}

async function saveCronLog(report: CronReport): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("cron_logs").insert({
      name: report.name,
      success: report.success,
      processed: report.processed,
      sent: report.sent,
      errors: report.errors.length > 0 ? report.errors : null,
      started_at: report.startedAt.toISOString(),
      finished_at: report.finishedAt.toISOString(),
      duration_ms: report.durationMs,
    });
  } catch (err) {
    console.error(`[CRON] Failed to save log for ${report.name}:`, err);
  }
}

function buildReport(
  name: string,
  startedAt: Date,
  result: Pick<CronReport, "success" | "processed" | "sent" | "errors">
): CronReport {
  const finishedAt = new Date();
  return {
    name,
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    success: result.success,
    processed: result.processed,
    sent: result.sent,
    errors: result.errors,
  };
}

/**
 * Central cron executor with auth check, 1x retry, and persistent logging.
 * Wraps any cron execute function and returns a standardized NextResponse.
 */
export async function runCronWithReport({
  name,
  request,
  execute,
}: RunCronOptions): Promise<NextResponse> {
  // Auth check (DRY — replaces per-route duplication)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  let result: CronResult;
  let retried = false;

  // Execute with 1x automatic retry
  try {
    result = await execute();
  } catch (firstError) {
    console.error(`[CRON] ${name} failed (attempt 1):`, firstError);
    retried = true;

    try {
      result = await execute();
    } catch (secondError) {
      console.error(`[CRON] ${name} failed (attempt 2):`, secondError);

      reportServerError(secondError, {
        filePath: `src/app/api/cron/${name}/route.ts`,
        severity: "critical",
        metadata: { cronName: name, attempt: 2, firstError: errorToString(firstError) },
      });

      const report = buildReport(name, startedAt, {
        success: false,
        processed: 0,
        sent: 0,
        errors: [
          `Attempt 1: ${errorToString(firstError)}`,
          `Attempt 2: ${errorToString(secondError)}`,
        ],
      });

      await saveCronLog(report);

      return NextResponse.json(
        {
          ok: false,
          name,
          success: false,
          sent: 0,
          errors: report.errors,
          report: { durationMs: report.durationMs, retried },
          timestamp: report.finishedAt.toISOString(),
        },
        { status: 500 }
      );
    }
  }

  // Success (or success after retry)
  const report = buildReport(name, startedAt, {
    success: result.success,
    processed: result.processed,
    sent: result.sent,
    errors: result.errors ?? [],
  });

  await saveCronLog(report);

  return NextResponse.json({
    ok: true,
    ...result,
    report: { durationMs: report.durationMs, retried },
    timestamp: report.finishedAt.toISOString(),
  });
}
