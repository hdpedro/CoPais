import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

/**
 * Cached queries for static/slow-changing data.
 * Uses Vercel Data Cache with tag-based invalidation.
 *
 * What to cache (changes rarely):
 * - profiles (name, email)
 * - group_members (who's in the group)
 * - children (names, birth dates)
 * - child_activities (activity list — not occurrences)
 *
 * What NOT to cache (changes frequently):
 * - custody_events, swap_requests
 * - chat_messages
 * - activity_reports
 * - illness_episodes, medications
 * - daily_checkins
 * - notifications
 */

// Admin client for cache queries (bypasses RLS, doesn't need user session)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Profile ───
export const getCachedProfile = unstable_cache(
  async (userId: string) => {
    const supabase = getAdminClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, display_name, email, phone, avatar_url, locale, onboarding_step")
      .eq("id", userId)
      .single();
    return data;
  },
  ["profile"],
  { revalidate: 300, tags: ["profile"] }
);

// Wrapper with userId tag for targeted invalidation
export function getCachedProfileByUser(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = getAdminClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, email, phone, avatar_url, locale, onboarding_step")
        .eq("id", userId)
        .single();
      return data;
    },
    [`profile-${userId}`],
    { revalidate: 300, tags: [`profile-${userId}`] }
  )();
}

// ─── Group Members ───
export function getCachedMembers(groupId: string) {
  return unstable_cache(
    async () => {
      const supabase = getAdminClient();
      const { data } = await supabase
        .from("group_members")
        .select("user_id, role, joined_at, profiles(id, full_name, display_name, email)")
        .eq("group_id", groupId)
        .order("joined_at");
      return data || [];
    },
    [`members-${groupId}`],
    { revalidate: 300, tags: [`members-${groupId}`] }
  )();
}

// ─── Children ───
export function getCachedChildren(groupId: string) {
  return unstable_cache(
    async () => {
      const supabase = getAdminClient();
      const { data } = await supabase
        .from("children")
        .select("id, full_name, birth_date, sex, photo_url")
        .eq("group_id", groupId);
      return data || [];
    },
    [`children-${groupId}`],
    { revalidate: 300, tags: [`children-${groupId}`] }
  )();
}

// ─── Child Activities (list, not occurrences) ───
export function getCachedActivities(groupId: string) {
  return unstable_cache(
    async () => {
      const supabase = getAdminClient();
      const { data } = await supabase
        .from("child_activities")
        .select("id, name, category, child_id, time_start, time_end, location, recurrence_type, is_active, responsible_id, teacher_name, class_name, room, notes")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    [`activities-${groupId}`],
    { revalidate: 300, tags: [`activities-${groupId}`] }
  )();
}
