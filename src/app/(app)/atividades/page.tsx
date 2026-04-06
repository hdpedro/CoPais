import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getDisplayName, ACTIVITY_CATEGORIES } from "@/lib/constants";
import { getBrazilToday, formatDateKey } from "@/lib/calendar-utils";
import Link from "next/link";

export default async function AtividadesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const todayStr = getBrazilToday();
  const todayParts = todayStr.split("-").map(Number);
  const sevenDaysOut = new Date(todayParts[0], todayParts[1] - 1, todayParts[2] + 7, 12, 0, 0);
  const sevenDaysKey = formatDateKey(sevenDaysOut);

  // Fetch activities + upcoming occurrences in parallel
  const [{ data: activities }, { data: occurrences }] = await Promise.all([
    supabase
      .from("child_activities")
      .select("id, name, category, time_start, time_end, location, is_active, recurrence_type, child_id, children(full_name), responsible_id, profiles!child_activities_responsible_id_fkey(full_name)")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("calendar_occurrences")
      .select("id, occurrence_date, activity_id")
      .eq("group_id", groupId)
      .gte("occurrence_date", todayStr)
      .lte("occurrence_date", sevenDaysKey)
      .limit(100),
  ]);

  // Count occurrences per activity
  const occCountMap: Record<string, number> = {};
  const nextOccMap: Record<string, string> = {};
  if (occurrences) {
    for (const occ of occurrences) {
      occCountMap[occ.activity_id] = (occCountMap[occ.activity_id] || 0) + 1;
      if (!nextOccMap[occ.activity_id] || occ.occurrence_date < nextOccMap[occ.activity_id]) {
        nextOccMap[occ.activity_id] = occ.occurrence_date;
      }
    }
  }

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#2C2C2C]">Atividades</h1>
        {!isReadonly && (
          <Link
            href="/calendario/novo"
            className="px-4 py-2 bg-[#C07055] text-white text-sm font-semibold rounded-lg hover:bg-[#A85D47] transition-colors"
          >
            + Nova atividade
          </Link>
        )}
      </div>

      {activities && activities.length > 0 ? (
        <div className="space-y-2">
          {activities.map((act) => {
            const cat = ACTIVITY_CATEGORIES.find(c => c.value === act.category);
            const childName = (act.children as unknown as { full_name: string } | null)?.full_name?.split(" ")[0] || "Todos";
            const responsibleName = (act.profiles as unknown as { full_name: string } | null)?.full_name;
            const nextOcc = nextOccMap[act.id];
            const occCount = occCountMap[act.id] || 0;

            let nextLabel = "";
            if (nextOcc) {
              if (nextOcc === todayStr) {
                nextLabel = "Hoje";
              } else {
                const d = new Date(nextOcc + "T12:00:00");
                const diffDays = Math.round((d.getTime() - new Date(todayStr + "T12:00:00").getTime()) / 86400000);
                if (diffDays === 1) nextLabel = "Amanha";
                else nextLabel = `${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
              }
            }

            return (
              <div key={act.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#C07055]/10 flex items-center justify-center text-lg flex-shrink-0">
                    {cat?.icon || "📋"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#2C2C2C] truncate">{act.name}</p>
                    <p className="text-[11px] text-[#9A8878]">
                      {cat?.label || act.category} · {childName}
                      {act.time_start && ` · ${act.time_start.slice(0, 5)}`}
                      {act.location && ` · ${act.location}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {nextLabel && (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        nextLabel === "Hoje"
                          ? "bg-[#C07055]/10 text-[#C07055]"
                          : nextLabel === "Amanha"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-[#9A8878]"
                      }`}>
                        {nextLabel}
                      </span>
                    )}
                    {occCount > 0 && (
                      <p className="text-[10px] text-[#9A8878] mt-1">{occCount}x esta semana</p>
                    )}
                  </div>
                </div>
                {responsibleName && (
                  <p className="text-[10px] text-[#9A8878] mt-2 pl-[52px]">
                    Responsavel: {getDisplayName(responsibleName, true)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
          <p className="text-[#9A8878]">Nenhuma atividade cadastrada</p>
          {!isReadonly && (
            <Link href="/calendario/novo" className="text-[#C07055] font-medium mt-2 inline-block">
              Criar primeira atividade
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
