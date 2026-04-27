/**
 * POST /api/health/save-prescription
 *
 * JSON-friendly wrapper around `savePrescriptionToHealth` (a Next.js
 * server action) so native clients can finalize a prescription parsing
 * flow over plain HTTP. The server action itself uses FormData and is
 * not directly callable from React Native fetch without `Next-Action`
 * headers, hence this thin route.
 *
 * Body:
 *   {
 *     inferenceId: string,        // from /api/ai/parse-prescription
 *     groupId: string,
 *     childId: string,
 *     selectedIndices: number[],  // medication_parsed indices
 *     createEpisode?: boolean,    // wrap into a new illness_episodes row
 *     episodeId?: string | null,  // or link to existing episode
 *     episodeTitle?: string | null,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { savePrescriptionToHealth } from "@/actions/health";

export async function POST(req: NextRequest) {
  // Authenticate via Bearer (native) or cookie (PWA fallback).
  const authHeader = req.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) userId = data.user.id;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) userId = user.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    inferenceId,
    groupId,
    childId,
    selectedIndices,
    createEpisode,
    episodeId,
    episodeTitle,
  } = body as {
    inferenceId?: string;
    groupId?: string;
    childId?: string;
    selectedIndices?: number[];
    createEpisode?: boolean;
    episodeId?: string | null;
    episodeTitle?: string | null;
  };

  if (!inferenceId || !groupId || !childId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Re-pack into FormData so we can re-use the existing server action.
  const fd = new FormData();
  fd.set("inferenceId", inferenceId);
  fd.set("groupId", groupId);
  fd.set("childId", childId);
  fd.set("selectedMedications", JSON.stringify(selectedIndices ?? []));
  if (createEpisode) fd.set("createEpisode", "true");
  if (episodeId) fd.set("episodeId", episodeId);
  if (episodeTitle) fd.set("episodeTitle", episodeTitle);

  const result = await savePrescriptionToHealth(fd);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Falha ao salvar" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
