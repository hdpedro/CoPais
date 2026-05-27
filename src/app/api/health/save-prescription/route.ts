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
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { savePrescriptionToHealth } from "@/actions/health";

export async function POST(req: NextRequest) {
  // Dual auth via helper centralizado (Bearer pro native, cookies pro PWA).
  const user = await resolveAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // user.id passed to savePrescriptionToHealth below via the action's internal
  // auth resolution (action re-reads cookie OR uses the verified Bearer).

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
