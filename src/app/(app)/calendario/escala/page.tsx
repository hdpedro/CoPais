import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import ScheduleBuilder from "./ScheduleBuilder";

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, profiles(full_name)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  const membersList = (members || []).map((m, i) => ({
    user_id: m.user_id,
    full_name: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.full_name || "Usuario",
    color: i === 0 ? "#0EA5A0" : "#FF6B5B",
  }));

  // Check if there's already a schedule configured
  const { count: existingCount } = await supabase
    .from("custody_events")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("custody_type", "regular")
    .eq("notes", "Gerado pela escala quinzenal");

  const hasExistingSchedule = (existingCount || 0) > 0;

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/calendario" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">
            {hasExistingSchedule ? "Reconfigurar Escala" : "Configurar Escala"}
          </h1>
          <p className="text-sm text-muted">Monte o padrao de guarda quinzenal</p>
        </div>
      </div>

      {hasExistingSchedule && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">Escala ja configurada</p>
              <p className="text-xs text-amber-600 mt-1">
                Voce ja possui {existingCount} eventos de guarda gerados. Ao gerar uma nova escala, os eventos anteriores serao substituidos automaticamente.
              </p>
            </div>
          </div>
        </div>
      )}

      <ScheduleBuilder
        groupId={groupId}
        children={children || []}
        members={membersList}
        currentUserId={user.id}
        hasExistingSchedule={hasExistingSchedule}
      />
    </div>
  );
}
