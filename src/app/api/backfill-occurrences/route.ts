import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/backfill-occurrences
 * One-time backfill: generates calendar_occurrences for ALL existing activities.
 * Requires CRON_SECRET header for security.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { backfillAllOccurrences } = await import("@/lib/occurrence-generator");
  const result = await backfillAllOccurrences(supabase);

  return NextResponse.json({
    success: true,
    groups: result.groups,
    occurrences: result.occurrences,
    errors: result.errors,
  });
}
