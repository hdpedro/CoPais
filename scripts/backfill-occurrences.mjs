/**
 * One-time backfill: generate calendar_occurrences for all existing activities.
 * Run: node scripts/backfill-occurrences.mjs
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Inline recurrence logic (same as src/lib/recurrence-utils.ts)
function parseDateKey(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
// Bug Hailla 2026-05-07: clients antigos salvaram strings PT-BR — normalizamos.
const DOW_MAP = { dom:0, seg:1, ter:2, qua:3, qui:4, sex:5, sab:6, domingo:0, segunda:1, terca:2, "terça":2, quarta:3, quinta:4, sexta:5, sabado:6, "sábado":6 };
function normalizeDow(v) {
  if (typeof v === "number" && v >= 0 && v <= 6) return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t in DOW_MAP) return DOW_MAP[t];
    const n = Number(t); if (Number.isFinite(n) && n >= 0 && n <= 6) return n;
  }
  return null;
}
function parseDaysOfWeek(raw) {
  if (!raw) return null;
  let arr = null;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p; } catch {}
  }
  if (!arr) return null;
  const out = [];
  for (const v of arr) { const n = normalizeDow(v); if (n != null) out.push(n); }
  return out.length ? out : null;
}
function getOccurrences(activity, rangeStart, rangeEnd) {
  const dates = [];
  const start = parseDateKey(activity.start_date);
  const rStart = parseDateKey(rangeStart);
  const rEnd = parseDateKey(rangeEnd);
  const end = activity.end_date ? parseDateKey(activity.end_date) : null;
  if (activity.recurrence_type === "never") {
    if (start >= rStart && start <= rEnd && (!end || start <= end)) dates.push(formatDateKey(start));
    return dates;
  }
  if ((activity.recurrence_type === "weekly" || activity.recurrence_type === "biweekly") && activity.days_of_week?.length > 0) {
    const allDates = new Set();
    for (const dow of activity.days_of_week) {
      const iterStart = start > rStart ? new Date(start) : new Date(rStart);
      while (iterStart.getDay() !== dow) iterStart.setDate(iterStart.getDate() + 1);
      if (activity.recurrence_type === "biweekly") {
        const weeksDiff = Math.floor((iterStart.getTime() - start.getTime()) / (7 * 86400000));
        if (weeksDiff % 2 !== 0) iterStart.setDate(iterStart.getDate() + 7);
      }
      const step = activity.recurrence_type === "biweekly" ? 14 : 7;
      const current = new Date(iterStart);
      let safety = 200;
      while (current <= rEnd && safety-- > 0) {
        if (end && current > end) break;
        if (current >= start) allDates.add(formatDateKey(current));
        current.setDate(current.getDate() + step);
      }
    }
    return Array.from(allDates).sort();
  }
  const iterStart = start > rStart ? new Date(start) : new Date(rStart);
  const current = new Date(iterStart);
  let safetyLimit = 500;
  while (current <= rEnd && safetyLimit-- > 0) {
    if (end && current > end) break;
    if (current >= start) dates.push(formatDateKey(current));
    switch (activity.recurrence_type) {
      case "daily": current.setDate(current.getDate() + 1); break;
      case "monthly":
        current.setMonth(current.getMonth() + 1);
        if (activity.day_of_month) {
          const maxDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
          current.setDate(Math.min(activity.day_of_month, maxDay));
        }
        break;
      case "yearly": current.setFullYear(current.getFullYear() + 1); break;
      case "custom": {
        const interval = activity.custom_interval || 1;
        switch (activity.custom_unit) {
          case "day": current.setDate(current.getDate() + interval); break;
          case "week": current.setDate(current.getDate() + interval * 7); break;
          case "month": current.setMonth(current.getMonth() + interval); break;
        }
        break;
      }
      default: current.setDate(current.getDate() + 1); break;
    }
  }
  return dates;
}

async function run() {
  const { data: activities, error } = await supabase
    .from("child_activities")
    .select("id, group_id, child_id, recurrence_type, start_date, end_date, days_of_week, day_of_month, custom_interval, custom_unit")
    .eq("is_active", true);

  if (error) { console.log("FETCH ERROR:", error.message); return; }
  console.log(`Found ${activities.length} active activities`);

  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 365);

  let total = 0;
  for (const act of activities) {
    await supabase.from("calendar_occurrences").delete().eq("activity_id", act.id);

    const rangeStart = act.start_date;
    const rangeEnd = act.end_date && new Date(act.end_date + "T00:00:00") < horizon ? act.end_date : formatDateKey(horizon);

    const recurrence = {
      recurrence_type: act.recurrence_type,
      start_date: act.start_date,
      end_date: act.end_date,
      days_of_week: parseDaysOfWeek(act.days_of_week),
      day_of_month: act.day_of_month,
      custom_interval: act.custom_interval || 1,
      custom_unit: act.custom_unit || "week",
    };

    const dates = getOccurrences(recurrence, rangeStart, rangeEnd);
    if (dates.length === 0) { console.log(`  ${act.id} -> 0 occurrences (skipped)`); continue; }

    const rows = dates.map(d => ({
      activity_id: act.id,
      occurrence_date: d,
      group_id: act.group_id,
      child_id: act.child_id,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error: insertErr } = await supabase.from("calendar_occurrences").insert(batch);
      if (insertErr) console.log(`  ERROR ${act.id}:`, insertErr.message);
    }
    total += dates.length;
    console.log(`  ${act.id} -> ${dates.length} occurrences`);
  }
  console.log(`\nDONE. Total: ${total} occurrences generated for ${activities.length} activities.`);
}

run();
