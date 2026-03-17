import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDateKey } from "@/lib/calendar-utils";
import { PARENT_COLORS, CHECKIN_CATEGORIES } from "@/lib/constants";

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

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const groupId = (memberships[0].coparenting_groups as any)?.id;
  const groupName = (memberships[0].coparenting_groups as any)?.name;

  // Get group members (ordered by join date for color assignment)
  const { data: members } = await supabase
    .from("group_members")
    .select("*, profiles(id, full_name, email)")
    .eq("group_id", groupId)
    .order("joined_at");

  // Build parent color map
  const parentColors: Record<string, { name: string; color: string }> = {};
  members?.forEach((m, i) => {
    const p = m.profiles as any;
    parentColors[m.user_id] = {
      name: p?.full_name?.split(" ")[0] || "Responsavel",
      color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
    };
  });

  // Get children
  const { data: children } = await supabase
    .from("children")
    .select("*")
    .eq("group_id", groupId);

  // Get today's custody info
  const today = formatDateKey(new Date());
  const { data: todayEvents } = await supabase
    .from("custody_events")
    .select("*, profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .lte("start_date", today)
    .gte("end_date", today);

  // Find who has the child today and next swap
  const todayEvent = todayEvents?.[0];
  const todayResponsibleId = todayEvent?.responsible_user_id;
  const todayResponsibleName = (todayEvent?.profiles as any)?.full_name?.split(" ")[0];
  const isWithMe = todayResponsibleId === user.id;

  // Get next custody change (first event starting after today with different responsible)
  const { data: futureEvents } = await supabase
    .from("custody_events")
    .select("*, profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .gt("start_date", today)
    .order("start_date")
    .limit(5);

  const nextSwapEvent = futureEvents?.find(
    (e) => e.responsible_user_id !== todayResponsibleId
  );

  // Get current month expenses for financial summary
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: monthExpenses } = await supabase
    .from("expenses")
    .select("amount, paid_by, status")
    .eq("group_id", groupId)
    .gte("expense_date", monthStart)
    .lt("expense_date", monthEnd);

  // Calculate financial summary
  let myTotal = 0;
  let otherTotal = 0;
  let otherName = "";
  if (monthExpenses) {
    for (const exp of monthExpenses) {
      const amount = Number(exp.amount);
      if (exp.paid_by === user.id) {
        myTotal += amount;
      } else {
        otherTotal += amount;
        if (!otherName && parentColors[exp.paid_by]) {
          otherName = parentColors[exp.paid_by].name;
        }
      }
    }
  }
  if (!otherName) {
    const otherMember = members?.find((m) => m.user_id !== user.id);
    otherName = parentColors[otherMember?.user_id || ""]?.name || "Outro";
  }
  const totalMonth = myTotal + otherTotal;
  const fairShare = totalMonth / 2;
  const balance = myTotal - fairShare;

  // Get latest check-ins (last 2 days)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDateKey(yesterday);

  const { data: recentCheckins } = await supabase
    .from("daily_checkins")
    .select("*, children(full_name), profiles!daily_checkins_logged_by_fkey(full_name)")
    .eq("group_id", groupId)
    .gte("checkin_date", yesterdayStr)
    .order("created_at", { ascending: false })
    .limit(4);

  // Get upcoming events (next 5 days)
  const fiveDaysLater = new Date();
  fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);
  const fiveDaysStr = formatDateKey(fiveDaysLater);

  const { data: upcomingEvents } = await supabase
    .from("custody_events")
    .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .gte("start_date", today)
    .lte("start_date", fiveDaysStr)
    .order("start_date")
    .limit(4);

  const firstName = profile?.full_name?.split(" ")[0] || "Pai";
  const childName = children?.[0]?.full_name?.split(" ")[0] || "";

  // Format next swap date
  const formatSwapDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    const dayNames = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
    const d = date.getDate();
    const m = date.getMonth() + 1;
    return `${dayNames[date.getDay()]}, ${d}/${m}`;
  };

  const myColor = parentColors[user.id]?.color || PARENT_COLORS.primary;

  return (
    <div className="space-y-4 pb-20">

      {/* === CARD 1: Hoje esta com quem === */}
      {todayEvent && childName ? (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div
            className="px-5 py-4 flex items-center gap-4"
            style={{ borderLeft: `4px solid ${isWithMe ? myColor : parentColors[todayResponsibleId]?.color || PARENT_COLORS.secondary}` }}
          >
            <div className="flex-1">
              <p className="text-muted text-xs font-medium uppercase tracking-wide">Hoje</p>
              <p className="text-dark text-lg font-bold mt-0.5">
                {childName} esta com {isWithMe ? "voce" : todayResponsibleName}
                {" "}
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: isWithMe ? myColor : parentColors[todayResponsibleId]?.color || PARENT_COLORS.secondary }}
                />
              </p>
              {nextSwapEvent && (
                <p className="text-muted text-sm mt-1">
                  Proxima troca: <span className="font-medium text-dark">{formatSwapDate(nextSwapEvent.start_date)}</span>
                </p>
              )}
            </div>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
              style={{ backgroundColor: isWithMe ? myColor : parentColors[todayResponsibleId]?.color || PARENT_COLORS.secondary }}
            >
              {isWithMe ? "V" : todayResponsibleName?.[0] || "?"}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="text-xl font-bold text-dark">Ola, {firstName}!</h2>
          <p className="text-muted text-sm mt-1">{groupName}</p>
          {children && children.length > 0 && !todayEvent && (
            <p className="text-sm text-accent mt-2">
              Nenhum evento de guarda cadastrado para hoje.{" "}
              <Link href="/calendario/escala" className="text-primary font-medium underline">Criar escala</Link>
            </p>
          )}
        </div>
      )}

      {/* === CARD 2: Saldo Financeiro === */}
      {totalMonth > 0 ? (
        <Link href="/financeiro" className="block">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted text-xs font-medium uppercase tracking-wide">Saldo do mes</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-lg font-bold text-dark">
                    R$ {Math.abs(balance).toFixed(2).replace(".", ",")}
                  </span>
                  {balance > 10 ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-medium">
                      {otherName} deve para voce
                    </span>
                  ) : balance < -10 ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-accent/10 text-accent font-medium">
                      Voce deve para {otherName}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                      Equilibrado
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted">
                <div className="text-right text-xs">
                  <p>Voce: <span className="font-medium text-dark">R$ {myTotal.toFixed(2).replace(".", ",")}</span></p>
                  <p>{otherName}: <span className="font-medium text-dark">R$ {otherTotal.toFixed(2).replace(".", ",")}</span></p>
                </div>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </Link>
      ) : (
        <Link href="/despesas/nova" className="block">
          <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-lg">💰</span>
            </div>
            <div>
              <p className="font-medium text-dark text-sm">Nenhuma despesa este mes</p>
              <p className="text-xs text-muted">Toque para registrar a primeira</p>
            </div>
          </div>
        </Link>
      )}

      {/* === CARD 3: Ultimo Check-in === */}
      {recentCheckins && recentCheckins.length > 0 && (
        <Link href="/checkin" className="block">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-muted text-xs font-medium uppercase tracking-wide">
                Ultimo check-in {recentCheckins[0].checkin_date === today ? "de hoje" : "de ontem"}
              </p>
              <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentCheckins.slice(0, 3).map((ci) => {
                const cat = CHECKIN_CATEGORIES.find((c) => c.value === ci.category);
                return (
                  <div key={ci.id} className="flex items-center gap-1.5 bg-light rounded-lg px-3 py-1.5">
                    <span className="text-sm">{cat?.icon || "📝"}</span>
                    <span className="text-xs font-medium text-dark">{ci.title}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted mt-2">
              por {(recentCheckins[0].profiles as any)?.full_name?.split(" ")[0]} sobre {(recentCheckins[0].children as any)?.full_name?.split(" ")[0]}
            </p>
          </div>
        </Link>
      )}

      {/* === CARD 4: Proximos Eventos (com contexto de quem) === */}
      {upcomingEvents && upcomingEvents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-sm font-semibold text-dark">Proximos dias</h3>
            <Link href="/calendario" className="text-xs text-primary font-medium">Ver calendario</Link>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map((event) => {
              const responsibleId = event.responsible_user_id;
              const isMe = responsibleId === user.id;
              const responsibleName = (event.profiles as any)?.full_name?.split(" ")[0];
              const color = parentColors[responsibleId]?.color || PARENT_COLORS.secondary;
              const eventDate = new Date(event.start_date + "T12:00:00");
              const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

              return (
                <div key={event.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 bg-light">
                    <span className="text-[10px] font-medium text-muted leading-none">{dayNames[eventDate.getDay()]}</span>
                    <span className="text-sm font-bold text-dark leading-tight">{eventDate.getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark text-sm">
                      Com {isMe ? "voce" : responsibleName}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {(event.children as any)?.full_name} — {event.custody_type === "regular" ? "Guarda regular" : event.custody_type === "swap" ? "Troca" : event.custody_type}
                    </p>
                  </div>
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === ACOES RAPIDAS: Principais + Secundarias === */}
      <div>
        <h3 className="text-sm font-semibold text-dark mb-2 px-1">Acoes rapidas</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Link
            href="/despesas/nova"
            className="flex flex-col items-center justify-center gap-2 bg-primary/5 border border-primary/20 rounded-xl p-4 hover:bg-primary/10 transition-colors min-h-[80px]"
          >
            <span className="text-2xl">💰</span>
            <span className="text-xs font-semibold text-primary">Nova Despesa</span>
          </Link>
          <Link
            href="/calendario"
            className="flex flex-col items-center justify-center gap-2 bg-primary/5 border border-primary/20 rounded-xl p-4 hover:bg-primary/10 transition-colors min-h-[80px]"
          >
            <span className="text-2xl">📅</span>
            <span className="text-xs font-semibold text-primary">Calendario</span>
          </Link>
          <Link
            href="/chat"
            className="flex flex-col items-center justify-center gap-2 bg-primary/5 border border-primary/20 rounded-xl p-4 hover:bg-primary/10 transition-colors min-h-[80px]"
          >
            <span className="text-2xl">💬</span>
            <span className="text-xs font-semibold text-primary">Chat</span>
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon="✅" label="Check-in" href="/checkin" />
          <QuickAction icon="🤝" label="Acordos" href="/acordos" />
          <QuickAction icon="🎒" label="Escola" href="/escola" />
          <QuickAction icon="🏥" label="Saude" href="/saude" />
        </div>
      </div>

      {/* === Criancas (compacto) === */}
      {children && children.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-sm font-semibold text-dark">Criancas</h3>
            <Link href="/criancas" className="text-xs text-primary font-medium">Ver detalhes</Link>
          </div>
          <div className="flex gap-3">
            {children.map((child) => {
              const age = Math.floor(
                (Date.now() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
              );
              return (
                <Link key={child.id} href={`/criancas/${child.id}`} className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3 flex-1">
                  <div className="w-9 h-9 bg-accent/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-base">👶</span>
                  </div>
                  <div>
                    <p className="font-semibold text-dark text-sm">{child.full_name}</p>
                    <p className="text-xs text-muted">{age} {age === 1 ? "ano" : "anos"}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite Co-parent */}
      {members && members.length < 2 && (
        <div className="bg-white rounded-xl p-5 shadow-sm text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-dark mb-1">Convide o outro responsavel</h3>
          <p className="text-muted text-sm mb-3">
            Para usar todas as funcionalidades, convide o outro pai/mae.
          </p>
          <Link
            href="/convite/enviar"
            className="inline-block px-5 py-2.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors text-sm"
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
      className="flex flex-col items-center justify-center gap-1.5 bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow min-h-[64px]"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-[11px] font-medium text-muted">{label}</span>
    </Link>
  );
}
