import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Types
// ============================================================

export interface MonthlyChildData {
  child: {
    id: string;
    full_name: string;
    birth_date: string;
    sex: string | null;
    photo_url: string | null;
  };
  period: {
    year: number;
    month: number;
    label: string; // "Marco 2026"
  };
  activities: ActivitySummary;
  checkins: CheckinSummary;
  health: HealthSummary;
  custody: CustodySummary;
  expenses: ExpenseSummary;
  decisions: DecisionSummary;
  hasData: boolean;
}

export interface ActivitySummary {
  total: number;
  completed: number;
  missed: number;
  cancelled: number;
  attendanceRate: number; // 0-100
  moodBreakdown: Record<string, number>;
  byCategory: Array<{ category: string; count: number; completedCount: number }>;
  topActivities: Array<{ name: string; count: number; completedRate: number }>;
}

export interface HealthSummary {
  appointments: Array<{ title: string; date: string; status: string; location: string | null }>;
  vaccinesAdministered: Array<{ name: string; dose: string | null; date: string }>;
  illnesses: Array<{ title: string; severity: string | null; status: string; startDate: string; endDate: string | null }>;
  symptoms: Array<{ type: string; intensity: string | null; date: string }>;
  medications: Array<{ name: string; dosage: string; status: string }>;
  growth: { weight: number | null; height: number | null; head: number | null; date: string } | null;
}

export interface CustodySummary {
  daysByParent: Array<{ userId: string; name: string; days: number }>;
  totalDays: number;
  swaps: number;
}

export interface CheckinSummary {
  total: number;
  byCategory: Record<string, number>; // health: 3, sleep: 2, food: 1, mood: 1
  entries: Array<{ date: string; category: string; title: string; description: string | null }>;
}

export interface ExpenseSummary {
  total: number;
  byCategory: Array<{ category: string; amount: number }>;
  byPayer: Array<{ userId: string; name: string; amount: number }>;
  count: number;
}

export interface DecisionSummary {
  total: number;
  byStatus: Record<string, number>; // aberta: 2, aprovada: 1, rejeitada: 1
  entries: Array<{ title: string; status: string; category: string; date: string }>;
}

// ============================================================
// Month labels in Portuguese
// ============================================================

const MONTH_LABELS = [
  "", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}

// ============================================================
// Main collector
// ============================================================

export async function collectMonthlyData(
  childId: string,
  groupId: string,
  year: number,
  month: number,
  childInfo: { full_name: string; birth_date: string; sex: string | null; photo_url: string | null }
): Promise<MonthlyChildData> {
  const { start, end } = getMonthRange(year, month);

  const [activities, checkins, health, custody, expenses, decisions] = await Promise.all([
    collectActivities(childId, groupId, start, end),
    collectCheckins(childId, groupId, start, end),
    collectHealth(childId, start, end),
    collectCustody(childId, groupId, start, end),
    collectExpenses(childId, groupId, start, end),
    collectDecisions(groupId, start, end),
  ]);

  const hasData =
    activities.total > 0 ||
    checkins.total > 0 ||
    health.appointments.length > 0 ||
    health.vaccinesAdministered.length > 0 ||
    health.illnesses.length > 0 ||
    health.symptoms.length > 0 ||
    health.medications.length > 0 ||
    health.growth !== null ||
    custody.totalDays > 0 ||
    expenses.count > 0 ||
    decisions.total > 0;

  return {
    child: { id: childId, full_name: childInfo.full_name, birth_date: childInfo.birth_date, sex: childInfo.sex, photo_url: childInfo.photo_url },
    period: { year, month, label: `${MONTH_LABELS[month]} ${year}` },
    activities,
    checkins,
    health,
    custody,
    expenses,
    decisions,
    hasData,
  };
}

// ============================================================
// Activities
// ============================================================

async function collectActivities(childId: string, groupId: string, start: string, end: string): Promise<ActivitySummary> {
  const supabase = createAdminClient();

  // Get occurrences for this child in the month
  const { data: occurrences } = await supabase
    .from("calendar_occurrences")
    .select("activity_id, occurrence_date, child_activities!inner(id, name, category)")
    .eq("group_id", groupId)
    .gte("occurrence_date", start)
    .lt("occurrence_date", end)
    .or(`child_id.eq.${childId},child_id.is.null`);

  if (!occurrences || occurrences.length === 0) {
    return { total: 0, completed: 0, missed: 0, cancelled: 0, attendanceRate: 0, moodBreakdown: {}, byCategory: [], topActivities: [] };
  }

  // Get reports for these activities in this month
  const activityIds = [...new Set(occurrences.map((o) => {
    const act = Array.isArray(o.child_activities) ? o.child_activities[0] : o.child_activities;
    return act?.id;
  }).filter(Boolean))];

  const { data: reports } = await supabase
    .from("activity_reports")
    .select("activity_id, status, child_mood")
    .in("activity_id", activityIds)
    .gte("occurrence_date", start)
    .lt("occurrence_date", end);

  const reportMap = new Map<string, { status: string; child_mood: string | null }>();
  for (const r of reports || []) {
    reportMap.set(`${r.activity_id}`, r);
  }

  // Aggregate
  let completed = 0;
  let missed = 0;
  let cancelled = 0;
  const moodBreakdown: Record<string, number> = {};
  const categoryMap = new Map<string, { count: number; completedCount: number }>();
  const activityMap = new Map<string, { name: string; count: number; completedCount: number }>();

  for (const occ of occurrences) {
    const act = Array.isArray(occ.child_activities) ? occ.child_activities[0] : occ.child_activities;
    if (!act) continue;

    const report = reportMap.get(act.id);
    if (report?.status === "completed") completed++;
    else if (report?.status === "missed") missed++;
    else if (report?.status === "cancelled") cancelled++;

    if (report?.child_mood) {
      moodBreakdown[report.child_mood] = (moodBreakdown[report.child_mood] || 0) + 1;
    }

    // By category
    const cat = categoryMap.get(act.category) || { count: 0, completedCount: 0 };
    cat.count++;
    if (report?.status === "completed") cat.completedCount++;
    categoryMap.set(act.category, cat);

    // By activity name
    const actEntry = activityMap.get(act.name) || { name: act.name, count: 0, completedCount: 0 };
    actEntry.count++;
    if (report?.status === "completed") actEntry.completedCount++;
    activityMap.set(act.name, actEntry);
  }

  const total = occurrences.length;
  const attendanceRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.count - a.count);

  const topActivities = Array.from(activityMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((a) => ({ ...a, completedRate: a.count > 0 ? Math.round((a.completedCount / a.count) * 100) : 0 }));

  return { total, completed, missed, cancelled, attendanceRate, moodBreakdown, byCategory, topActivities };
}

// ============================================================
// Health
// ============================================================

async function collectHealth(childId: string, start: string, end: string): Promise<HealthSummary> {
  const supabase = createAdminClient();

  const [appointmentsRes, vaccinesRes, illnessesRes, symptomsRes, medsRes, growthRes] = await Promise.all([
    supabase
      .from("medical_appointments")
      .select("title, appointment_date, status, location")
      .eq("child_id", childId)
      .gte("appointment_date", start)
      .lt("appointment_date", end)
      .order("appointment_date"),

    supabase
      .from("vaccination_records")
      .select("vaccine_name, dose_label, administered_date")
      .eq("child_id", childId)
      .gte("administered_date", start)
      .lt("administered_date", end)
      .order("administered_date"),

    supabase
      .from("illness_episodes")
      .select("title, severity, status, start_date, end_date")
      .eq("child_id", childId)
      .gte("start_date", start)
      .lt("start_date", end)
      .order("start_date"),

    supabase
      .from("symptom_entries")
      .select("symptom_type, intensity, recorded_at")
      .eq("child_id", childId)
      .gte("recorded_at", start)
      .lt("recorded_at", end)
      .order("recorded_at"),

    supabase
      .from("active_medications")
      .select("name, dosage, status")
      .eq("child_id", childId)
      .or(`and(start_date.lte.${end},or(end_date.is.null,end_date.gte.${start}))`),

    supabase
      .from("growth_records")
      .select("weight_kg, height_cm, head_cm, measured_date")
      .eq("child_id", childId)
      .gte("measured_date", start)
      .lt("measured_date", end)
      .order("measured_date", { ascending: false })
      .limit(1),
  ]);

  const appointments = (appointmentsRes.data || []).map((a) => ({
    title: a.title,
    date: a.appointment_date,
    status: a.status,
    location: a.location,
  }));

  const vaccinesAdministered = (vaccinesRes.data || []).map((v) => ({
    name: v.vaccine_name,
    dose: v.dose_label,
    date: v.administered_date,
  }));

  const illnesses = (illnessesRes.data || []).map((i) => ({
    title: i.title,
    severity: i.severity,
    status: i.status,
    startDate: i.start_date,
    endDate: i.end_date,
  }));

  const symptoms = (symptomsRes.data || []).map((s) => ({
    type: s.symptom_type,
    intensity: s.intensity,
    date: s.recorded_at,
  }));

  const medications = (medsRes.data || []).map((m) => ({
    name: m.name,
    dosage: m.dosage,
    status: m.status,
  }));

  const growthRow = growthRes.data?.[0];
  const growth = growthRow
    ? { weight: growthRow.weight_kg, height: growthRow.height_cm, head: growthRow.head_cm, date: growthRow.measured_date }
    : null;

  return { appointments, vaccinesAdministered, illnesses, symptoms, medications, growth };
}

// ============================================================
// Custody
// ============================================================

async function collectCustody(childId: string, groupId: string, start: string, end: string): Promise<CustodySummary> {
  const supabase = createAdminClient();

  const { data: events } = await supabase
    .from("custody_events")
    .select("responsible_user_id, start_date, end_date, profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .eq("child_id", childId)
    .lte("start_date", end)
    .gte("end_date", start);

  if (!events || events.length === 0) {
    return { daysByParent: [], totalDays: 0, swaps: 0 };
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  const parentDays = new Map<string, { name: string; days: number }>();

  // Count days per parent within the month range
  for (const evt of events) {
    const evtStart = new Date(evt.start_date) < startDate ? startDate : new Date(evt.start_date);
    const evtEnd = new Date(evt.end_date) >= endDate ? new Date(endDate.getTime() - 86400000) : new Date(evt.end_date);

    const days = Math.max(0, Math.floor((evtEnd.getTime() - evtStart.getTime()) / 86400000) + 1);
    const profile = Array.isArray(evt.profiles) ? evt.profiles[0] : evt.profiles;
    const name = (profile as { full_name: string } | null)?.full_name?.split(" ")[0] || "Responsavel";

    const existing = parentDays.get(evt.responsible_user_id) || { name, days: 0 };
    existing.days += days;
    parentDays.set(evt.responsible_user_id, existing);
  }

  const daysByParent = Array.from(parentDays.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.days - a.days);

  const totalDays = daysByParent.reduce((sum, p) => sum + p.days, 0);

  // Count swaps (transitions between different parents on consecutive days)
  const sortedEvents = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date));
  let swaps = 0;
  for (let i = 1; i < sortedEvents.length; i++) {
    if (sortedEvents[i].responsible_user_id !== sortedEvents[i - 1].responsible_user_id) {
      swaps++;
    }
  }

  return { daysByParent, totalDays, swaps };
}

// ============================================================
// Expenses
// ============================================================

async function collectExpenses(childId: string, groupId: string, start: string, end: string): Promise<ExpenseSummary> {
  const supabase = createAdminClient();

  const { data: expenses } = await supabase
    .from("expenses")
    .select("category, amount, paid_by, profiles!expenses_paid_by_fkey(full_name)")
    .eq("group_id", groupId)
    .or(`child_id.eq.${childId},child_id.is.null`)
    .gte("expense_date", start)
    .lt("expense_date", end)
    .eq("status", "approved");

  if (!expenses || expenses.length === 0) {
    return { total: 0, byCategory: [], byPayer: [], count: 0 };
  }

  let total = 0;
  const catMap = new Map<string, number>();
  const payerMap = new Map<string, { name: string; amount: number }>();

  for (const exp of expenses) {
    const amount = Number(exp.amount);
    total += amount;

    catMap.set(exp.category, (catMap.get(exp.category) || 0) + amount);

    const profile = Array.isArray(exp.profiles) ? exp.profiles[0] : exp.profiles;
    const name = (profile as { full_name: string } | null)?.full_name?.split(" ")[0] || "Responsavel";
    const payer = payerMap.get(exp.paid_by) || { name, amount: 0 };
    payer.amount += amount;
    payerMap.set(exp.paid_by, payer);
  }

  const byCategory = Array.from(catMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const byPayer = Array.from(payerMap.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.amount - a.amount);

  return { total, byCategory, byPayer, count: expenses.length };
}

// ============================================================
// Check-ins Diarios
// ============================================================

async function collectCheckins(childId: string, groupId: string, start: string, end: string): Promise<CheckinSummary> {
  const supabase = createAdminClient();

  const { data: checkins } = await supabase
    .from("daily_checkins")
    .select("checkin_date, category, title, description")
    .eq("group_id", groupId)
    .eq("child_id", childId)
    .gte("checkin_date", start)
    .lt("checkin_date", end)
    .order("checkin_date", { ascending: false });

  if (!checkins || checkins.length === 0) {
    return { total: 0, byCategory: {}, entries: [] };
  }

  const byCategory: Record<string, number> = {};
  for (const c of checkins) {
    byCategory[c.category] = (byCategory[c.category] || 0) + 1;
  }

  const entries = checkins.map((c) => ({
    date: c.checkin_date,
    category: c.category,
    title: c.title,
    description: c.description,
  }));

  return { total: checkins.length, byCategory, entries };
}

// ============================================================
// Decisoes (per group, not per child)
// ============================================================

async function collectDecisions(groupId: string, start: string, end: string): Promise<DecisionSummary> {
  const supabase = createAdminClient();

  const { data: decisions } = await supabase
    .from("decisions")
    .select("title, status, category, created_at")
    .eq("group_id", groupId)
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at");

  if (!decisions || decisions.length === 0) {
    return { total: 0, byStatus: {}, entries: [] };
  }

  const byStatus: Record<string, number> = {};
  for (const d of decisions) {
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  }

  const entries = decisions.map((d) => ({
    title: d.title,
    status: d.status,
    category: d.category,
    date: d.created_at,
  }));

  return { total: decisions.length, byStatus, entries };
}
