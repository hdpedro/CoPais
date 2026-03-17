import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Get user's groups
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(id, name)")
    .eq("user_id", user.id);

  // If no group, redirect to onboarding
  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const groupId = (memberships[0].coparenting_groups as any)?.id;

  // Get children
  const { data: children } = await supabase
    .from("children")
    .select("*")
    .eq("group_id", groupId);

  // Get upcoming custody events
  const today = new Date().toISOString().split("T")[0];
  const { data: upcomingEvents } = await supabase
    .from("custody_events")
    .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .gte("end_date", today)
    .order("start_date")
    .limit(3);

  // Get recent expenses
  const { data: recentExpenses } = await supabase
    .from("expenses")
    .select("*, profiles!expenses_paid_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(3);

  // Get group members
  const { data: members } = await supabase
    .from("group_members")
    .select("*, profiles(full_name, email)")
    .eq("group_id", groupId);

  const firstName = profile?.full_name?.split(" ")[0] || "Pai";

  return (
    <div className="space-y-6 pb-20">
      {/* Greeting */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-dark">Ola, {firstName}!</h2>
        <p className="text-muted mt-1">
          {(memberships[0].coparenting_groups as any)?.name}
        </p>
      </div>

      {/* Children */}
      {children && children.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-dark">Criancas</h3>
            <Link href="/criancas" className="text-sm text-primary font-medium">Ver todas</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {children.map((child) => {
              const age = Math.floor(
                (Date.now() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
              );
              return (
                <div key={child.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center mb-2">
                    <span className="text-lg">👶</span>
                  </div>
                  <p className="font-semibold text-dark text-sm">{child.full_name}</p>
                  <p className="text-xs text-muted">{age} {age === 1 ? "ano" : "anos"}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-dark mb-3">Acoes Rapidas</h3>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction icon="💬" label="Chat" href="/chat" />
          <QuickAction icon="📅" label="Calendario" href="/calendario" />
          <QuickAction icon="📊" label="Financeiro" href="/financeiro" />
          <QuickAction icon="🤝" label="Acordos" href="/acordos" />
          <QuickAction icon="🎉" label="Eventos" href="/eventos" />
          <QuickAction icon="✅" label="Check-in" href="/checkin" />
          <QuickAction icon="🎒" label="Escola" href="/escola" />
          <QuickAction icon="🏥" label="Saude" href="/saude" />
        </div>
      </div>

      {/* Upcoming Events */}
      {upcomingEvents && upcomingEvents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-dark">Proximos Eventos</h3>
            <Link href="/calendario" className="text-sm text-primary font-medium">Ver todos</Link>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {new Date(event.start_date).getDate()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark text-sm truncate">
                    {(event.children as any)?.full_name} - {event.custody_type}
                  </p>
                  <p className="text-xs text-muted">
                    Com {(event.profiles as any)?.full_name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Expenses */}
      {recentExpenses && recentExpenses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-dark">Despesas Recentes</h3>
            <Link href="/despesas" className="text-sm text-primary font-medium">Ver todas</Link>
          </div>
          <div className="space-y-2">
            {recentExpenses.map((expense) => (
              <div key={expense.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center">
                    <span className="text-sm">💰</span>
                  </div>
                  <div>
                    <p className="font-medium text-dark text-sm">{expense.description}</p>
                    <p className="text-xs text-muted">{(expense.profiles as any)?.full_name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-dark text-sm">
                    R$ {Number(expense.amount).toFixed(2)}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    expense.status === "approved" ? "bg-success/10 text-success" :
                    expense.status === "rejected" ? "bg-error/10 text-error" :
                    "bg-accent/10 text-accent"
                  }`}>
                    {expense.status === "approved" ? "Aprovada" :
                     expense.status === "rejected" ? "Rejeitada" :
                     expense.status === "disputed" ? "Disputada" : "Pendente"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Co-parent */}
      {members && members.length < 2 && (
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-dark mb-2">Convide o outro responsavel</h3>
          <p className="text-muted text-sm mb-4">
            Para usar todas as funcionalidades, convide o outro pai/mae.
          </p>
          <Link
            href="/convite/enviar"
            className="inline-block px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors"
          >
            Enviar Convite
          </Link>
        </div>
      )}
    </div>
  );
}

function QuickAction({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-2 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow min-h-[80px]"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-dark">{label}</span>
    </Link>
  );
}
