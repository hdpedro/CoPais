/**
 * Pre-compute activity occurrence dates and store in calendar_occurrences table.
 * Eliminates runtime recurrence expansion — queries become simple date range filters.
 *
 * Called on:
 * - Activity create → generateOccurrences()
 * - Activity delete → CASCADE handles cleanup (FK on child_activities)
 * - Backfill → regenerateAllOccurrences()
 *
 * Generation horizon: 365 days from today (or from start_date if future).
 * Activities without end_date generate 365 days forward.
 */

import { getOccurrences, parseDaysOfWeek, type ActivityRecurrence } from "./recurrence-utils";
import { formatDateKey } from "./calendar-utils";
import type { SupabaseClient } from "@supabase/supabase-js";

const GENERATION_HORIZON_DAYS = 365;
const BATCH_SIZE = 500;

interface ActivityRow {
  id: string;
  group_id: string;
  child_id: string | null;
  recurrence_type: string;
  start_date: string;
  end_date: string | null;
  days_of_week: string | number[] | null;
  day_of_month: number | null;
  custom_interval: number | null;
  custom_unit: string | null;
}

/**
 * Generate and insert occurrence dates for a single activity.
 * Deletes existing occurrences first (idempotent).
 */
export async function generateOccurrences(
  supabase: SupabaseClient,
  activity: ActivityRow
): Promise<{ count: number; error?: string }> {
  // Delete existing occurrences for this activity
  await supabase
    .from("calendar_occurrences")
    .delete()
    .eq("activity_id", activity.id);

  // Compute range
  const today = new Date();
  const rangeStart = activity.start_date;
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + GENERATION_HORIZON_DAYS);
  const rangeEnd = activity.end_date && new Date(activity.end_date + "T00:00:00") < horizon
    ? activity.end_date
    : formatDateKey(horizon);

  // Build recurrence object
  const recurrence: ActivityRecurrence = {
    recurrence_type: activity.recurrence_type as ActivityRecurrence["recurrence_type"],
    start_date: activity.start_date,
    end_date: activity.end_date,
    days_of_week: parseDaysOfWeek(activity.days_of_week),
    day_of_month: activity.day_of_month,
    custom_interval: activity.custom_interval || 1,
    custom_unit: (activity.custom_unit as ActivityRecurrence["custom_unit"]) || "week",
  };

  // Generate dates using existing proven logic
  const dates = getOccurrences(recurrence, rangeStart, rangeEnd);

  if (dates.length === 0) return { count: 0 };

  // Batch insert
  const rows = dates.map((date) => ({
    activity_id: activity.id,
    occurrence_date: date,
    group_id: activity.group_id,
    child_id: activity.child_id,
  }));

  // Insert in batches to avoid payload limits
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("calendar_occurrences")
      .insert(batch);

    if (error) {
      return { count: inserted, error: error.message };
    }
    inserted += batch.length;
  }

  return { count: inserted };
}

/**
 * Regenerate occurrences for ALL active activities in a group.
 * Used for backfill and after major changes.
 */
export async function regenerateGroupOccurrences(
  supabase: SupabaseClient,
  groupId: string
): Promise<{ total: number; errors: string[] }> {
  // Delete all existing occurrences for this group
  await supabase
    .from("calendar_occurrences")
    .delete()
    .eq("group_id", groupId);

  // Fetch all active activities
  const { data: activities, error } = await supabase
    .from("child_activities")
    .select("id, group_id, child_id, recurrence_type, start_date, end_date, days_of_week, day_of_month, custom_interval, custom_unit")
    .eq("group_id", groupId)
    .eq("is_active", true);

  if (error || !activities) {
    return { total: 0, errors: [error?.message || "No activities found"] };
  }

  let total = 0;
  const errors: string[] = [];

  for (const act of activities) {
    const result = await generateOccurrences(supabase, act);
    total += result.count;
    if (result.error) errors.push(`${act.id}: ${result.error}`);
  }

  return { total, errors };
}

/**
 * Regenerate occurrences for ALL groups (full backfill).
 * Uses service role client for cross-group access.
 */
export async function backfillAllOccurrences(
  supabase: SupabaseClient
): Promise<{ groups: number; occurrences: number; errors: string[] }> {
  const { data: groups } = await supabase
    .from("coparenting_groups")
    .select("id");

  if (!groups) return { groups: 0, occurrences: 0, errors: ["No groups found"] };

  let totalOccurrences = 0;
  const allErrors: string[] = [];

  for (const group of groups) {
    const result = await regenerateGroupOccurrences(supabase, group.id);
    totalOccurrences += result.total;
    allErrors.push(...result.errors);
  }

  return { groups: groups.length, occurrences: totalOccurrences, errors: allErrors };
}
