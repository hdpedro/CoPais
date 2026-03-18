import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDateKey, computeSwapBalance, buildCustodyMap, type CustodyEvent, type ParentColorMap } from "@/lib/calendar-utils";
import { PARENT_COLORS, CHECKIN_CATEGORIES } from "@/lib/constants";
import { getHolidaysForYear } from "@/lib/brazilian-holidays";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(id, name)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const groupId = (memberships[0].coparenting_groups as any)?.id;
  const groupName = (memberships[0].coparenting_groups as any)?.name;

  const { data: members } = await supabase
    .from("group_members")
    .select("*, profiles(id, full_name, email)")
    .eq("group_id", groupId)
    .order("joined_at");

  const parentColors: ParentColorMap = {};
  members?.forEach((m, i) => {
    const p = m.profiles as any;
    parentColors[m.user_id] = {
      name: p?.full_name?.split(" ")[0] || "Responsavel",
      color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
    };
  });

  const { data: children } = await supabase
    .from("children")
    .select("*")
    .eq("group_id", groupId);

  const today = formatDateKey(new Date());
  const { data: todayEvents } = await supabase
    .from("custody_events")
    .select("*, profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .lte("start_date", today)
    .gte("end_date", today);

  const todayCustodyByChild: Record<string, { responsibleId: string; responsibleName: string; isWithMe: boolean }> = {};
  if (todayEvents) {
    for (const event of todayEvents) {
      const childId = event.child_id;
      if (!childId || todayCustodyByChild[childId]) continue;
      const responsibleName = (event.profiles as any)?.full_name?.split(" ")[0] || "?";
      todayCustodyByChild[childId] = {
        responsibleId: event.responsible_user_id,
        responsibleName,
        isWithMe: event.responsible_user_id === user.id,
      };
    }
  }
  const hasTodayCustody = Object.keys(todayCustodyByChild).length > 0;

  // Find current custody streak
  let streakDays = 0;
  let streakTotal = 0;
  if (hasTodayCustody && children && children.length > 0) {
    const firstChild = children[0];
    const custody = todayCustodyByChild[firstChild.id];
    if (custody) {
      const { data: streakEvents } = await supabase
        .from("custody_events")
        .select("start_date, end_date")
        .eq("group_id", groupId)
        .eq("child_id", firstChild.id)
        .eq("responsible_user_id", custody.responsibleId)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("start_date", { ascending: false })
        .limit(1);

      if (streakEvents && streakEvents.length > 0) {
        const startDate = new Date(streakEvents[0].start_date + "T12:00:00");
        const endDate = new Date(streakEvents[0].end_date + "T12:00:00");
        const todayDate = new Date(today + "T12:00:00");
        streakTotal = Math.round((endDate.getTime() - startDate.getTime()) / (86400000)) + 1;
        streakDays = Math.round((todayDate.getTime() - startDate.getTime()) / (86400000)) + 1;
      }
    }
  }

  const { data: futureEvents } = await supabase
    .from("custody_events")
    .select("*, profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .gt("start_date", today)
    .order("start_date")
    .limit(5);

  const nextSwapEvent = futureEvents?.find((e) => {
    const todayInfo = todayCustodyByChild[e.child_id];
    return todayInfo ? e.responsible_user_id !== todayInfo.responsibleId : true;
  });

  // Financial
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

  // Recent check-ins
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

  // Upcoming events
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const sevenDaysStr = formatDateKey(sevenDaysLater);

  const { data: upcomingEvents } = await supabase
    .from("custody_events")
    .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .gte("start_date", today)
    .lte("start_date", sevenDaysStr)
    .order("start_date")
    .limit(3);

  const firstName = profile?.full_name?.split(" ")[0] || "Pai";

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  // Format date
  const dayNames = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
  const monthNames = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const todayDate = new Date();
  const formattedDate = `${dayNames[todayDate.getDay()]}, ${todayDate.getDate()} de ${monthNames[todayDate.getMonth()]}`;

  // First child custody summary
  const firstChild = children && children.length > 0 ? children[0] : null;
  const firstCustody = firstChild ? todayCustodyByChild[firstChild.id] : null;
  const custodySummary = firstCustody
    ? `${firstChild!.full_name?.split(" ")[0]} esta com ${firstCustody.isWithMe ? "voce" : firstCustody.responsibleName} hoje`
    : null;

  const formatSwapDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    const d = date.getDate();
    const m = date.getMonth() + 1;
    return `${dayNames[date.getDay()]}, ${d}/${m}`;
  };

  // Week view
  const weekStart = new Date();
  const dayOfWeek = weekStart.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + mondayOffset);

  const weekDays: { date: Date; dateKey: string; label: string; isToday: boolean }[] = [];
  const shortDayLabels = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dk = formatDateKey(d);
    weekDays.push({ date: d, dateKey: dk, label: shortDayLabels[i], isToday: dk === today });
  }

  // Week custody map
  const weekCustodyMap: Record<string, { responsibleId: string; color: string }> = {};
  if (children && children.length > 0) {
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEndStr = formatDateKey(weekEndDate);
    const { data: weekEvents } = await supabase
      .from("custody_events")
      .select("start_date, end_date, responsible_user_id, child_id")
      .eq("group_id", groupId)
      .eq("child_id", children[0].id)
      .lte("start_date", weekEndStr)
      .gte("end_date", formatDateKey(weekStart));

    if (weekEvents) {
      for (const ev of weekEvents) {
        const start = new Date(ev.start_date + "T12:00:00");
        const end = new Date(ev.end_date + "T12:00:00");
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dk = formatDateKey(d);
          weekCustodyMap[dk] = {
            responsibleId: ev.responsible_user_id,
            color: parentColors[ev.responsible_user_id]?.color || PARENT_COLORS.primary,
          };
        }
      }
    }
  }

  // Holidays
  const holidays = getHolidaysForYear(now.getFullYear());
  const todayHoliday = holidays.find((h) => h.date === today);

  // Swap balance
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const threeMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 4, 0);

  const { data: swapEvents } = await supabase
    .from("custody_events")
    .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .gte("end_date", formatDateKey(threeMonthsAgo))
    .lte("start_date", formatDateKey(threeMonthsAhead))
    .order("start_date");

  const custodyEvents = (swapEvents || []) as CustodyEvent[];
  const swapBalance = computeSwapBalance(
    custodyEvents,
    parentColors,
    formatDateKey(threeMonthsAgo),
    formatDateKey(threeMonthsAhead)
  );

  const mySwapDays = swapBalance.balanceByUser[user.id] || 0;

  const myColor = parentColors[user.id]?.color || PARENT_COLORS.primary;

  return (
    <div className="space-y-5 pb-4">

      {/* === GREETING === */}
      <div>
        <h1 className="text-2xl font-bold text-[#1A3B3A]">
          {greeting}, {firstName} &#128075;
        </h1>
        <p className="text-sm text-[#7A8C8B] mt-0.5">
          {formattedDate}
          {custodySummary && <span> &middot; {custodySummary}</span>}
        </p>
      </div>

      {/* === HERO CARD === */}
      {hasTodayCustody && firstChild && firstCustody ? (
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1A3B3A] via-[#1A3B3A] to-[#0D2525] p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex items-center gap-1.5 text-xs font-medium bg-white/15 backdrop-blur-sm rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              {todayHoliday ? todayHoliday.name : "Dia tranquilo hoje"}
            </span>
          </div>

          <h2 className="text-2xl font-bold mb-1">
            {firstChild.full_name?.split(" ")[0]} esta com {firstCustody.isWithMe ? "voce" : firstCustody.responsibleName}
          </h2>
          {nextSwapEvent && (
            <p className="text-white/70 text-sm mb-4">
              Proxima troca: <span className="text-white font-medium">{formatSwapDate(nextSwapEvent.start_date)} com {(nextSwapEvent.profiles as any)?.full_name?.split(" ")[0]}</span>
            </p>
          )}

          <div className="flex items-center justify-between mt-2">
            <span className="flex items-center gap-1.5 text-xs font-medium bg-white/15 backdrop-blur-sm rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: firstCustody.isWithMe ? myColor : parentColors[firstCustody.responsibleId]?.color }} />
              Guarda ativa
            </span>
            {streakTotal > 0 && (
              <span className="text-xs text-white/60">Dia {streakDays} de {streakTotal}</span>
            )}
          </div>

          {children && children.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-4">
              {children.map((c, i) => (
                <span key={c.id} className={`w-2.5 h-2.5 rounded-full ${i === 0 ? "bg-[#E8734A]" : "bg-white/30"}`} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-gradient-to-br from-[#1A3B3A] to-[#0D2525] p-5 text-white">
          <h2 className="text-xl font-bold">Ola, {firstName}!</h2>
          <p className="text-white/70 text-sm mt-1">{groupName}</p>
          {children && children.length > 0 && !hasTodayCustody && (
            <p className="text-sm text-amber-300 mt-3">
              Nenhum evento de guarda hoje.{" "}
              <Link href="/calendario/escala" className="underline text-white">Criar escala</Link>
            </p>
          )}
        </div>
      )}

      {/* === INSIGHT DA SEMANA === */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#E8734A]/10 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">&#128161;</span>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[#E8734A] uppercase tracking-wider mb-0.5">Insight da semana</p>
          {!hasTodayCustody ? (
            <p className="text-sm text-[#1A3B3A]">
              Cadastre a <span className="font-semibold">escala de guarda</span> para acompanhar insights automaticos sobre a rotina.
            </p>
          ) : Math.abs(balance) > 10 ? (
            <p className="text-sm text-[#1A3B3A]">
              {otherName} esta com <span className="font-semibold">R$ {Math.abs(balance).toFixed(0)}</span> a {balance > 0 ? "menos" : "mais"} em despesas este mes.
            </p>
          ) : (
            <p className="text-sm text-[#1A3B3A]">
              Fins de semana estao <span className="font-semibold">equilibrados entre voces</span> este mes. Saldo de trocas zerado &#128077;
            </p>
          )}
        </div>
      </div>

      {/* === WEEK VIEW === */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex justify-between">
          {weekDays.map((day) => {
            const wCustody = weekCustodyMap[day.dateKey];
            return (
              <Link
                key={day.dateKey}
                href="/calendario"
                className={`flex flex-col items-center gap-1 py-2 px-2 rounded-xl transition-colors ${
                  day.isToday ? "bg-[#E8734A] text-white" : "text-[#7A8C8B] hover:bg-gray-50"
                }`}
              >
                <span className={`text-[10px] font-semibold uppercase ${day.isToday ? "text-white/80" : ""}`}>
                  {day.label}
                </span>
                <span className={`text-base font-bold ${day.isToday ? "text-white" : "text-[#1A3B3A]"}`}>
                  {day.date.getDate()}
                </span>
                {wCustody && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: day.isToday ? "white" : wCustody.color }}
                  />
                )}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-100">
          {Object.entries(parentColors).map(([uid, { name, color }]) => (
            <div key={uid} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-[#7A8C8B] font-medium">{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* === SALDO + PROXIMOS DIAS === */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/financeiro" className="block">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 h-full">
            <p className="text-[10px] font-bold text-[#7A8C8B] uppercase tracking-wider mb-2">Saldo do mes</p>
            <p className="text-2xl font-bold text-[#1A3B3A]">
              R$ {totalMonth > 0 ? Math.abs(balance).toFixed(2).replace(".", ",") : "0,00"}
            </p>
            {totalMonth > 0 ? (
              <>
                {balance > 10 ? (
                  <span className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E8734A]/10 text-[#E8734A]">
                    {otherName} deve
                  </span>
                ) : balance < -10 ? (
                  <span className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Voce deve
                  </span>
                ) : (
                  <span className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Equilibrado
                  </span>
                )}
                <div className="mt-3 space-y-1.5 text-xs text-[#7A8C8B]">
                  <div className="flex justify-between">
                    <span>Voce pagou</span>
                    <span className="font-semibold text-[#E8734A]">R$ {myTotal.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{otherName}</span>
                    <span className="font-semibold text-[#1A3B3A]">R$ {otherTotal.toFixed(0)}</span>
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mt-1">
                    {totalMonth > 0 && (
                      <>
                        <div className="h-full bg-[#E8734A] rounded-l-full" style={{ width: `${(myTotal / totalMonth) * 100}%` }} />
                        <div className="h-full bg-[#1A3B3A] rounded-r-full" style={{ width: `${(otherTotal / totalMonth) * 100}%` }} />
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#7A8C8B] mt-2">Nenhuma despesa</p>
            )}
          </div>
        </Link>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-[10px] font-bold text-[#7A8C8B] uppercase tracking-wider mb-2">Proximos dias</p>
          {upcomingEvents && upcomingEvents.length > 0 ? (
            <div className="space-y-3">
              {upcomingEvents.map((event) => {
                const responsibleId = event.responsible_user_id;
                const isMe = responsibleId === user.id;
                const responsibleName = (event.profiles as any)?.full_name?.split(" ")[0];
                const color = parentColors[responsibleId]?.color || PARENT_COLORS.secondary;
                const eventDate = new Date(event.start_date + "T12:00:00");
                const shortDays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
                const typeLabels: Record<string, string> = { regular: "Regular", swap: "Troca", holiday: "Feriado", vacation: "Ferias", special: "Especial" };

                return (
                  <Link key={event.id} href="/calendario" className="flex items-center gap-2.5">
                    <div className="w-11 h-11 rounded-xl bg-[#1A3B3A] flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-bold text-white/60 uppercase leading-none">{shortDays[eventDate.getDay()]}</span>
                      <span className="text-sm font-bold text-white leading-tight">{eventDate.getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1A3B3A] text-sm truncate">{isMe ? "Com voce" : responsibleName}</p>
                      <p className="text-[11px] text-[#7A8C8B] truncate">{typeLabels[event.custody_type] || event.custody_type}</p>
                    </div>
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#7A8C8B]">Sem eventos proximos</p>
          )}
        </div>
      </div>

      {/* === ACOES RAPIDAS === */}
      <div>
        <h3 className="text-base font-bold text-[#1A3B3A] mb-3">Acoes rapidas</h3>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction icon="💸" label="Despesa" href="/despesas/nova" bg="bg-[#E8F5E9]" iconBg="bg-[#4CAF50]" />
          <QuickAction icon="📅" label="Agenda" href="/calendario" bg="bg-[#E3F2FD]" iconBg="bg-[#2196F3]" />
          <QuickAction icon="💬" label="Chat" href="/chat" bg="bg-[#F3E5F5]" iconBg="bg-[#9C27B0]" />
          <QuickAction icon="✅" label="Check-in" href="/checkin" bg="bg-[#E0F2F1]" iconBg="bg-[#0EA5A0]" />
          <QuickAction icon="🤝" label="Acordos" href="/acordos" bg="bg-[#FFF3E0]" iconBg="bg-[#FF9800]" />
          <QuickAction icon="🏫" label="Escola" href="/escola" bg="bg-[#FFEBEE]" iconBg="bg-[#F44336]" />
          <QuickAction icon="🩺" label="Saude" href="/saude" bg="bg-[#EDE7F6]" iconBg="bg-[#673AB7]" />
          <QuickAction icon="📁" label="Docs" href="/documentos" bg="bg-[#FFF8E1]" iconBg="bg-[#E8734A]" />
        </div>
      </div>

      {/* === CRIANCAS === */}
      {children && children.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-[#1A3B3A]">Criancas</h3>
            <Link href="/criancas" className="text-sm text-[#E8734A] font-medium">Ver detalhes &rarr;</Link>
          </div>
          <div className="space-y-3">
            {children.map((child) => {
              const custody = todayCustodyByChild[child.id];
              const age = Math.floor(
                (Date.now() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
              );
              const birthDate = new Date(child.birth_date);
              const birthMonthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
              const childCheckin = recentCheckins?.find((ci) => (ci.children as any)?.full_name === child.full_name);

              return (
                <Link key={child.id} href={`/criancas/${child.id}`} className="block bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-[#FFF3E0] rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">👶</span>
                    </div>
                    <div>
                      <p className="font-bold text-[#1A3B3A] text-base">{child.full_name}</p>
                      <p className="text-xs text-[#7A8C8B]">
                        {age} {age === 1 ? "ano" : "anos"} &middot; nasceu em {birthMonthNames[birthDate.getMonth()]}/{birthDate.getFullYear()}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {custody && (
                      <div className="flex items-center justify-between bg-[#FFF9F5] rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{custody.isWithMe ? "💚" : "💙"}</span>
                          <span className="text-sm text-[#1A3B3A]">Hoje esta com {custody.isWithMe ? "voce" : custody.responsibleName}</span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0EA5A0]/10 text-[#0EA5A0]">Guarda ativa</span>
                      </div>
                    )}
                    {childCheckin && (
                      <div className="flex items-center justify-between bg-[#FFF9F5] rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{CHECKIN_CATEGORIES.find((c) => c.value === childCheckin.category)?.icon || "📝"}</span>
                          <span className="text-sm text-[#1A3B3A]">{childCheckin.title}</span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E8734A]/10 text-[#E8734A]">Check-in</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* === SALDO DE TROCAS === */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
        <span className="text-sm text-[#7A8C8B]">Saldo de trocas</span>
        <div className="text-right">
          <p className="text-xl font-bold text-[#1A3B3A]">
            {mySwapDays > 0 ? "+" : ""}{mySwapDays} {Math.abs(mySwapDays) === 1 ? "dia" : "dias"}
          </p>
          {mySwapDays === 0 ? (
            <p className="text-xs text-[#0EA5A0] font-medium">Tudo em dia &#10003;</p>
          ) : mySwapDays > 0 ? (
            <p className="text-xs text-[#E8734A] font-medium">A seu favor</p>
          ) : (
            <p className="text-xs text-amber-600 font-medium">Voce deve dias</p>
          )}
        </div>
      </div>

      {/* Invite Co-parent */}
      {members && members.length < 2 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
          <div className="w-14 h-14 bg-[#E8734A]/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-[#E8734A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-[#1A3B3A] mb-1">Convide o outro responsavel</h3>
          <p className="text-[#7A8C8B] text-sm mb-4">Para usar todas as funcionalidades, convide o outro pai/mae.</p>
          <Link href="/convite/enviar" className="inline-block px-6 py-2.5 bg-[#E8734A] text-white font-semibold rounded-xl hover:bg-[#D4623E] transition-colors text-sm">
            Enviar Convite
          </Link>
        </div>
      )}
    </div>
  );
}

function QuickAction({ icon, label, href, bg, iconBg }: { icon: string; label: string; href: string; bg: string; iconBg: string }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-2 ${bg} rounded-2xl p-3 hover:shadow-md transition-shadow min-h-[80px]`}
    >
      <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center shadow-sm`}>
        <span className="text-lg">{icon}</span>
      </div>
      <span className="text-[11px] font-semibold text-[#1A3B3A]">{label}</span>
    </Link>
  );
}
