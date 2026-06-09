import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getRequestLocale } from "@/i18n/server";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getGroupSubscription } from "@/lib/billing";
import { getDisplayName } from "@/lib/constants";
import { computeCorresponsibility, type RoutineLogEntry } from "@/lib/care-routine-metrics";
import type { RoutineSlot, RoutineOverride } from "@/lib/care-routine-resolve";
import dynamic from "next/dynamic";
import type { RoutineSlotRow } from "@/lib/services/care-routine";

const RoutineBuilder = dynamic(() => import("./RoutineBuilder"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});
const CorresponsibilityCard = dynamic(() => import("./CorresponsibilityCard"));

export default async function RoutinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId)
    .order("birth_date", { ascending: true });

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role, profiles(full_name, display_name)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  const membersList = (members || [])
    .filter((m) => m.role === "admin" || m.role === "member")
    .slice(0, 2)
    .map((m, i) => {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        user_id: m.user_id,
        full_name: prof?.display_name || prof?.full_name || "Responsável",
        color: i === 0 ? "#5B9E85" : "#D4735A",
      };
    });

  const { data: slots } = await supabase
    .from("care_routine_slots")
    .select(
      "id, group_id, child_id, weekday, leg, pattern_type, week_parity, responsible_id, time_of_day, label, reminder_lead_minutes, is_active, created_by, created_at, updated_at",
    )
    .eq("group_id", groupId)
    .eq("is_active", true);

  // === Corresponsabilidade do mês (Fase 2) — contagens neutras ===
  const locale = await getRequestLocale();
  const bcp47 =
    ({ pt: "pt-BR", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE" } as Record<string, string>)[locale] ?? "pt-BR";
  const todayStr = getBrazilToday();
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const monthLabel = new Intl.DateTimeFormat(bcp47, { month: "long", year: "numeric" }).format(
    new Date(todayStr + "T12:00:00"),
  );
  const [{ data: monthLogs }, { data: monthOverrides }, subscription, { data: groupRow }] = await Promise.all([
    supabase
      .from("care_routine_logs")
      .select("child_id, occurrence_date, leg, status")
      .eq("group_id", groupId)
      .gte("occurrence_date", monthStart)
      .lte("occurrence_date", todayStr),
    supabase
      .from("care_routine_overrides")
      .select("id, child_id, occurrence_date, leg, responsible_id")
      .eq("group_id", groupId)
      .gte("occurrence_date", monthStart)
      .lte("occurrence_date", todayStr),
    getGroupSubscription(supabase, groupId),
    supabase.from("coparenting_groups").select("arrangement").eq("id", groupId).maybeSingle(),
  ]);
  const arrangement = ((groupRow?.arrangement as string) ?? "rotating") as
    | "rotating"
    | "together"
    | "single"
    | "custom";
  const metricRows = computeCorresponsibility(
    (slots || []) as unknown as RoutineSlot[],
    (monthOverrides || []) as unknown as RoutineOverride[],
    (monthLogs || []) as unknown as RoutineLogEntry[],
    membersList.map((m) => ({ id: m.user_id, name: getDisplayName(m.full_name, true) })),
  );
  // Harmonia (premium) ou Jurídico (premium_juridico) ativos/em trial = premium.
  const routinePremium =
    subscription.tier !== "free" && ["active", "trialing"].includes(subscription.status);

  return (
    <div className="max-w-lg mx-auto pb-24 px-4 space-y-5">
      <RoutineBuilder
        groupId={groupId}
        childrenList={children || []}
        members={membersList}
        currentUserId={user.id}
        initialSlots={(slots || []) as unknown as RoutineSlotRow[]}
        currentArrangement={arrangement}
      />
      <CorresponsibilityCard rows={metricRows} premium={routinePremium} monthLabel={monthLabel} />
    </div>
  );
}
