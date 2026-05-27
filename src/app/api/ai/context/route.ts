import { NextRequest, NextResponse } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lightweight endpoint that returns children and member names
 * for the local AI parser. No Groq calls — just a quick DB lookup.
 *
 * Auth: dual via resolveAuthenticatedUser (Bearer pro native, cookies PWA).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await resolveAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groupId = req.nextUrl.searchParams.get("groupId");
    if (!groupId) {
      return NextResponse.json(
        { error: "groupId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify user belongs to group
    const { data: membership } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch children and members in parallel
    const [childrenRes, membersRes] = await Promise.all([
      supabase
        .from("children")
        .select("full_name")
        .eq("group_id", groupId),
      supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId),
    ]);

    const memberIds = (membersRes.data || []).map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("full_name")
      .in("id", memberIds);

    return NextResponse.json({
      children: (childrenRes.data || []).map((c) => c.full_name),
      members: (profiles || []).map((p) => p.full_name),
    });
  } catch (error: unknown) {
    console.error("AI context error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
