import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import CheckinForm from "./CheckinForm";
import { CHECKIN_CATEGORIES } from "@/lib/constants";

export default async function CheckinPage() {
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

  // Get today's checkins
  const today = new Date().toISOString().split("T")[0];
  const { data: todayCheckins } = await supabase
    .from("daily_checkins")
    .select("*, profiles!daily_checkins_logged_by_fkey(full_name), children(full_name)")
    .eq("group_id", groupId)
    .eq("checkin_date", today)
    .order("created_at", { ascending: false });

  // Get recent checkins (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: recentCheckins } = await supabase
    .from("daily_checkins")
    .select("*, profiles!daily_checkins_logged_by_fkey(full_name), children(full_name)")
    .eq("group_id", groupId)
    .gte("checkin_date", weekAgo.toISOString().split("T")[0])
    .lt("checkin_date", today)
    .order("created_at", { ascending: false })
    .limit(20);

  const getCategoryIcon = (cat: string) => {
    const found = CHECKIN_CATEGORIES.find((c) => c.value === cat);
    return found?.icon || "📝";
  };

  const getCategoryLabel = (cat: string) => {
    const found = CHECKIN_CATEGORIES.find((c) => c.value === cat);
    return found?.label || cat;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">Check-in Rapido</h1>
          <p className="text-muted text-sm">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Link href="/dashboard" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Link>
      </div>

      {/* Quick add form */}
      <CheckinForm
        groupId={groupId}
        children={children || []}
      />

      {/* Today's checkins */}
      {todayCheckins && todayCheckins.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-dark mb-3">Hoje</h3>
          <div className="space-y-2">
            {todayCheckins.map((c) => (
              <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getCategoryIcon(c.category)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-dark text-sm">{c.title}</p>
                      <span className="text-xs text-muted">
                        {new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-xs text-muted mt-1">{c.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {getCategoryLabel(c.category)}
                      </span>
                      <span className="text-xs text-muted">
                        por {(c.profiles as any)?.full_name}
                        {(c.children as any)?.full_name ? ` • ${(c.children as any).full_name}` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent checkins */}
      {recentCheckins && recentCheckins.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-dark mb-3">Ultimos dias</h3>
          <div className="space-y-2">
            {recentCheckins.map((c) => (
              <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm opacity-80">
                <div className="flex items-start gap-3">
                  <span className="text-xl">{getCategoryIcon(c.category)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-dark text-sm">{c.title}</p>
                      <span className="text-xs text-muted">
                        {new Date(c.checkin_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-xs text-muted mt-1">{c.description}</p>
                    )}
                    <span className="text-xs text-muted">
                      por {(c.profiles as any)?.full_name}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
