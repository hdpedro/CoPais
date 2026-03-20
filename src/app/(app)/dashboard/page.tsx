import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDateKey, computeSwapBalance, getBrazilNow, type CustodyEvent, type ParentColorMap } from "@/lib/calendar-utils";
import { PARENT_COLORS, EXPENSE_CATEGORIES } from "@/lib/constants";
import { getHolidaysForYear } from "@/lib/brazilian-holidays";

export default async function DashboardPage() {
  const supabase = await createClient();
  // Use getSession() (reads JWT locally, no network call) instead of getUser() (network call ~500ms)
  // Auth is already verified by the layout's middleware
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const user = session.user;

  // === BATCH 1: profile + memberships (parallel, only need user.id) ===
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("group_members").select("group_id, role, coparenting_groups(id, name)").eq("user_id", user.id),
  ]);

  if (!memberships || memberships.length === 0) redirect("/onboarding");

  const groupId = (memberships[0].coparenting_groups as any)?.id;
  const groupName = (memberships[0].coparenting_groups as any)?.name;

  // === BATCH 2: members + children (parallel, need groupId) ===
  const [{ data: members }, { data: children }] = await Promise.all([
    supabase.from("group_members").select("*, profiles(id, full_name, email)").eq("group_id", groupId).order("joined_at"),
    supabase.from("children").select("*").eq("group_id", groupId),
  ]);

  const parentColors: ParentColorMap = {};
  members?.forEach((m, i) => {
    const p = m.profiles as any;
    parentColors[m.user_id] = {
      name: p?.full_name?.split(" ")[0] || "Responsavel",
      color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
    };
  });

  // === BATCH 3: ALL remaining queries in parallel (need groupId + user.id) ===
  const today = formatDateKey(new Date());
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const fourteenDays = new Date(); fourteenDays.setDate(fourteenDays.getDate() + 14);
  const sevenDaysAhead = new Date(); sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const threeMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 4, 0);
  const weekStart = new Date();
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);

  const [
    { data: todayEvents },
    { data: futureEvents },
    { data: monthExpenses },
    { data: pendingSwaps },
    { data: activeMedications },
    { data: criticalAllergies },
    { data: upcomingAppointments },
    { data: activeIllnesses },
    { data: recentCheckins },
    { data: upcomingEvents },
    { data: swapEvents },
    { data: weekEvents },
    { data: pendingExpenses },
  ] = await Promise.all([
    // Today custody
    supabase.from("custody_events")
      .select("*, profiles!custody_events_responsible_user_id_fkey(full_name)")
      .eq("group_id", groupId).lte("start_date", today).gte("end_date", today),
    // Future events
    supabase.from("custody_events")
      .select("*, profiles!custody_events_responsible_user_id_fkey(full_name)")
      .eq("group_id", groupId).gt("start_date", today).order("start_date").limit(5),
    // Monthly expenses
    supabase.from("expenses")
      .select("amount, paid_by, status, split_ratio")
      .eq("group_id", groupId).gte("expense_date", monthStart).lt("expense_date", monthEnd),
    // Pending swaps
    supabase.from("swap_requests")
      .select("*, requester:profiles!swap_requests_requester_id_fkey(full_name)")
      .eq("group_id", groupId).eq("status", "pending").eq("target_user_id", user.id)
      .order("created_at", { ascending: false }).limit(3),
    // Active medications
    supabase.from("active_medications")
      .select("id, name, dosage, frequency, child_id, children(full_name)")
      .eq("group_id", groupId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(5),
    // Critical allergies
    supabase.from("child_allergies")
      .select("id, name, severity, allergy_type, child_id, children(full_name)")
      .eq("group_id", groupId).in("severity", ["severe", "moderate"]).limit(5),
    // Upcoming appointments
    supabase.from("medical_appointments")
      .select("id, title, appointment_date, status, child_id, children(full_name), medical_professionals(name, specialty)")
      .eq("group_id", groupId).eq("status", "scheduled")
      .gte("appointment_date", now.toISOString()).lte("appointment_date", sevenDaysAhead.toISOString())
      .order("appointment_date").limit(3),
    // Active illnesses
    supabase.from("illness_episodes")
      .select("id, title, symptoms, start_date, child_id, children(full_name)")
      .eq("group_id", groupId).eq("status", "active")
      .order("start_date", { ascending: false }).limit(3),
    // Recent check-ins
    supabase.from("daily_checkins")
      .select("*, children(full_name), profiles!daily_checkins_logged_by_fkey(full_name)")
      .eq("group_id", groupId).gte("checkin_date", formatDateKey(yesterday))
      .order("created_at", { ascending: false }).limit(4),
    // Upcoming agenda events
    supabase.from("custody_events")
      .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
      .eq("group_id", groupId).gte("start_date", today).lte("start_date", formatDateKey(fourteenDays))
      .order("start_date").limit(4),
    // Swap balance events
    supabase.from("custody_events")
      .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
      .eq("group_id", groupId).gte("end_date", formatDateKey(threeMonthsAgo))
      .lte("start_date", formatDateKey(threeMonthsAhead)).order("start_date"),
    // Week custody events
    children && children.length > 0
      ? supabase.from("custody_events")
          .select("start_date, end_date, responsible_user_id, child_id")
          .eq("group_id", groupId).eq("child_id", children[0].id)
          .lte("start_date", formatDateKey(weekEnd)).gte("end_date", formatDateKey(weekStart))
      : Promise.resolve({ data: null }),
    // Pending expenses awaiting MY approval (created by others, status=pending)
    supabase.from("expenses")
      .select("id, description, amount, category, expense_date, paid_by, profiles!expenses_paid_by_fkey(full_name)")
      .eq("group_id", groupId).eq("status", "pending").neq("paid_by", user.id)
      .order("created_at", { ascending: false }).limit(5),
  ]);

  // Process today custody
  const todayCustodyByChild: Record<string, { responsibleId: string; responsibleName: string; isWithMe: boolean; endDate: string; custodyType: string }> = {};
  if (todayEvents) {
    for (const event of todayEvents) {
      const childId = event.child_id;
      if (!childId || todayCustodyByChild[childId]) continue;
      const responsibleName = (event.profiles as any)?.full_name?.split(" ")[0] || "?";
      todayCustodyByChild[childId] = {
        responsibleId: event.responsible_user_id,
        responsibleName,
        isWithMe: event.responsible_user_id === user.id,
        endDate: event.end_date,
        custodyType: event.custody_type,
      };
    }
  }
  const hasTodayCustody = Object.keys(todayCustodyByChild).length > 0;

  // Streak (uses todayCustody result — one extra query only if needed)
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
        streakTotal = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
        streakDays = Math.round((todayDate.getTime() - startDate.getTime()) / 86400000) + 1;
      }
    }
  }

  const nextSwapEvent = futureEvents?.find((e) => {
    const todayInfo = todayCustodyByChild[e.child_id];
    return todayInfo ? e.responsible_user_id !== todayInfo.responsibleId : true;
  });

  // Process financial (exclude rejected expenses, consistent with Financeiro page)
  let myTotal = 0;
  let otherTotal = 0;
  let myShouldPay = 0;
  let otherName = "";
  if (monthExpenses) {
    for (const exp of monthExpenses) {
      if (exp.status === "rejected") continue;
      const amount = Number(exp.amount);
      if (exp.paid_by === user.id) myTotal += amount;
      else {
        otherTotal += amount;
        if (!otherName && parentColors[exp.paid_by]) otherName = parentColors[exp.paid_by].name;
      }
      // Calculate what user should pay based on split_ratio
      const sr = exp.split_ratio as Record<string, number> | null;
      if (sr && sr[user.id] !== undefined) {
        myShouldPay += (sr[user.id] / 100) * amount;
      } else {
        myShouldPay += amount / 2; // default 50/50
      }
    }
  }
  if (!otherName) {
    const otherMember = members?.find((m) => m.user_id !== user.id);
    otherName = parentColors[otherMember?.user_id || ""]?.name || "Outro";
  }
  const totalMonth = myTotal + otherTotal;
  const balance = myTotal - myShouldPay;

  // Health alerts flag
  const hasHealthAlerts = (activeMedications && activeMedications.length > 0) ||
    (criticalAllergies && criticalAllergies.length > 0) ||
    (upcomingAppointments && upcomingAppointments.length > 0) ||
    (activeIllnesses && activeIllnesses.length > 0);

  // UI constants
  const nameParts = profile?.full_name?.split(" ") || [];
  // Handle prefixes like "Dr.", "Dra.", "Sr.", "Sra." — use prefix + next word
  const prefixes = ["dr.", "dra.", "sr.", "sra.", "prof."];
  const firstName = nameParts.length > 1 && prefixes.includes(nameParts[0].toLowerCase())
    ? `${nameParts[0]} ${nameParts[1]}`
    : nameParts[0] || "Pai";
  const isReadonly = memberships[0].role === "readonly";
  const brazilNow = getBrazilNow();
  const hour = brazilNow.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const dayNames = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
  const dayNamesShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const monthNames = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const todayDateObj = brazilNow;
  const formattedDate = `${dayNames[todayDateObj.getDay()]}, ${todayDateObj.getDate()} de ${monthNames[todayDateObj.getMonth()]}`;

  const firstChild = children && children.length > 0 ? children[0] : null;
  const firstCustody = firstChild ? todayCustodyByChild[firstChild.id] : null;
  const custodySummary = firstCustody
    ? `${firstChild!.full_name?.split(" ")[0]} com ${firstCustody.isWithMe ? "voce" : firstCustody.responsibleName} hoje`
    : null;

  // End date label for hero
  const endDateLabel = firstCustody ? (() => {
    const end = new Date(firstCustody.endDate + "T12:00:00");
    return `Guarda ${firstCustody.custodyType === "regular" ? "regular" : firstCustody.custodyType} ate ${dayNamesShort[end.getDay()].toLowerCase()}`;
  })() : "";

  // Week view
  const weekDays: { date: Date; dateKey: string; label: string; isToday: boolean }[] = [];
  const wLabels = ["S", "T", "Q", "Q", "S", "S", "D"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDays.push({ date: d, dateKey: formatDateKey(d), label: wLabels[i], isToday: formatDateKey(d) === today });
  }

  // Week custody map
  const weekCustodyMap: Record<string, { responsibleId: string; color: string }> = {};
  if (weekEvents) {
    for (const ev of weekEvents) {
      const s = new Date(ev.start_date + "T12:00:00");
      const e = new Date(ev.end_date + "T12:00:00");
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        weekCustodyMap[formatDateKey(d)] = {
          responsibleId: ev.responsible_user_id,
          color: parentColors[ev.responsible_user_id]?.color || PARENT_COLORS.primary,
        };
      }
    }
  }

  // Swap balance
  const custodyEvents = (swapEvents || []) as CustodyEvent[];
  const swapBalance = computeSwapBalance(custodyEvents, parentColors, formatDateKey(threeMonthsAgo), formatDateKey(threeMonthsAhead));
  const mySwapDays = swapBalance.balanceByUser[user.id] || 0;
  const myColor = parentColors[user.id]?.color || PARENT_COLORS.primary;
  const otherColor = parentColors[members?.find(m => m.user_id !== user.id)?.user_id || ""]?.color || PARENT_COLORS.secondary;

  const typeConfig: Record<string, { label: string; color: string }> = {
    regular: { label: "Regular", color: "#0EA5A0" },
    swap: { label: "Troca", color: "#E8734A" },
    holiday: { label: "Feriado", color: "#8B5CF6" },
    vacation: { label: "Ferias", color: "#3B82F6" },
    special: { label: "Especial", color: "#F59E0B" },
  };

  // Format next swap date
  const formatSwapDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return `${dayNamesShort[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div className="space-y-5 pb-4">

      {/* === GREETING === */}
      <div>
        <h1 className="text-[26px] font-bold text-[#1A3B3A] tracking-tight leading-tight">
          {greeting}, {firstName}
        </h1>
        <p className="text-[13px] text-[#7A8C8B] mt-0.5">
          {formattedDate}
          {custodySummary && <span> &middot; {custodySummary}</span>}
        </p>
      </div>

      {/* === PRIORITY ALERTS === */}
      {pendingSwaps && pendingSwaps.length > 0 && (
        <div className="space-y-2">
          {pendingSwaps.map((swap) => {
            const requesterName = (swap.requester as any)?.full_name?.split(" ")[0] || "Alguem";
            const swapDate = new Date(swap.original_date + "T12:00:00");
            return (
              <Link key={swap.id} href="/calendario" prefetch={false} className="block">
                <div className="bg-[#E8734A]/[0.08] border border-[#E8734A]/20 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#E8734A]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8734A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1A3B3A]">{requesterName} solicitou troca de dia</p>
                    <p className="text-[11px] text-[#7A8C8B]">{dayNamesShort[swapDate.getDay()]}, {swapDate.getDate()}/{swapDate.getMonth() + 1} &middot; Pendente</p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* === HERO CARD === */}
      {hasTodayCustody && firstChild && firstCustody ? (
        <div className="relative rounded-2xl overflow-hidden bg-[#1A3B3A] p-5 text-white">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent" />
          <div className="relative">
            {/* Top badges */}
            <div className="flex items-center justify-between mb-4">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold bg-white/10 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Guarda ativa
              </span>
              {nextSwapEvent && (
                <span className="text-[11px] text-white/50 uppercase tracking-wide font-medium">
                  Proxima troca<br />
                  <span className="text-white/80">{formatSwapDate(nextSwapEvent.start_date)} &middot; {(nextSwapEvent.profiles as any)?.full_name?.split(" ")[0]}</span>
                </span>
              )}
            </div>

            {/* Main info */}
            <h2 className="text-[24px] font-bold tracking-tight leading-tight">
              <span className="text-[#E8734A]">{firstChild.full_name?.split(" ")[0]}</span> esta{"\n"}com {firstCustody.isWithMe ? "voce" : firstCustody.responsibleName}
            </h2>
            <p className="text-white/50 text-[13px] mt-1">
              {firstChild.full_name?.split(" ")[0]} &middot; {endDateLabel}
            </p>

            {/* Progress bar */}
            {streakTotal > 1 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Dia</span>
                  <span className="text-[11px] text-white/60 font-medium">{streakDays} de {streakTotal} consecutivos</span>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: streakTotal }, (_, i) => (
                    <div
                      key={i}
                      className="h-2 rounded-full flex-1"
                      style={{
                        backgroundColor: i < streakDays
                          ? (firstCustody.isWithMe ? "#E8734A" : otherColor)
                          : "rgba(255,255,255,0.15)",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#1A3B3A] p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[11px] text-white/50 uppercase tracking-wider font-medium">Sem escala configurada</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Ola, {firstName}</h2>
          <p className="text-white/50 text-[13px] mt-1">{groupName}</p>
          {children && children.length > 0 && !hasTodayCustody && (
            <Link href="/calendario/escala" prefetch={false} className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-[#1A3B3A] bg-white rounded-xl px-5 py-3 hover:bg-white/90 transition-colors active:scale-[0.98]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Configurar escala de guarda
            </Link>
          )}
        </div>
      )}

      {/* === WEEK STRIP === */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
        <div className="flex justify-between">
          {weekDays.map((day) => {
            const wc = weekCustodyMap[day.dateKey];
            return (
              <Link
                key={day.dateKey}
                href="/calendario"
                prefetch={false}
                className={`flex flex-col items-center gap-1.5 py-2 px-2 rounded-xl transition-all ${
                  day.isToday ? "bg-[#E8734A] text-white shadow-sm" : "text-[#7A8C8B] hover:bg-gray-50"
                }`}
              >
                <span className={`text-[10px] font-medium uppercase ${day.isToday ? "text-white/70" : ""}`}>
                  {day.label}
                </span>
                <span className={`text-[15px] font-bold ${day.isToday ? "text-white" : "text-[#1A3B3A]"}`}>
                  {day.date.getDate()}
                </span>
                {wc && !day.isToday && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: wc.color }} />
                )}
                {day.isToday && <span className="w-1.5 h-1.5 rounded-full bg-white/70" />}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-gray-100/80">
          {Object.entries(parentColors).slice(0, 2).map(([uid, { name, color }]) => (
            <div key={uid} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-[#7A8C8B] font-medium capitalize">{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* === HEALTH ALERTS === */}
      {hasHealthAlerts && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              Saude
            </p>
            <Link href="/saude" prefetch={false} className="text-[10px] font-semibold text-[#E8734A]">ver tudo</Link>
          </div>

          {/* Active illness episodes — HIGHEST PRIORITY */}
          {activeIllnesses && activeIllnesses.map((illness) => {
            const childName = (illness.children as any)?.full_name?.split(" ")[0] || "Crianca";
            const startDate = new Date(illness.start_date + "T12:00:00");
            const daysAgo = Math.round((Date.now() - startDate.getTime()) / 86400000);
            const symptoms = (illness.symptoms as string[])?.slice(0, 3).join(", ") || "";
            return (
              <Link key={illness.id} href="/saude/doencas" prefetch={false} className="block">
                <div className="bg-red-50 border border-red-200/60 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1A3B3A]">{childName} — {illness.title}</p>
                    <p className="text-[11px] text-[#7A8C8B]">
                      {daysAgo === 0 ? "Hoje" : `Ha ${daysAgo} dia${daysAgo > 1 ? "s" : ""}`}
                      {symptoms && <> &middot; {symptoms}</>}
                    </p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </Link>
            );
          })}

          {/* Active medications */}
          {activeMedications && activeMedications.length > 0 && (
            <Link href="/saude/medicamentos" prefetch={false} className="block">
              <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3"/>
                    <line x1="9" y1="9" x2="15" y2="9"/><line x1="12" y1="6" x2="12" y2="12"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#1A3B3A]">
                    {activeMedications.length} medicamento{activeMedications.length > 1 ? "s" : ""} ativo{activeMedications.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-[11px] text-[#7A8C8B] truncate">
                    {activeMedications.slice(0, 2).map((m) => `${m.name} (${(m as any).children?.full_name?.split(" ")[0] || ""})`).join(", ")}
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </Link>
          )}

          {/* Critical allergies */}
          {criticalAllergies && criticalAllergies.length > 0 && (
            <Link href="/saude/alergias" prefetch={false} className="block">
              <div className="bg-orange-50 border border-orange-200/60 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#1A3B3A]">
                    {criticalAllergies.filter(a => a.severity === "severe").length > 0 ? "Alergia grave" : "Alergia moderada"}
                  </p>
                  <p className="text-[11px] text-[#7A8C8B] truncate">
                    {criticalAllergies.slice(0, 3).map((a) => a.name).join(", ")}
                  </p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  criticalAllergies.some(a => a.severity === "severe")
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {criticalAllergies.some(a => a.severity === "severe") ? "GRAVE" : "MODERADA"}
                </span>
              </div>
            </Link>
          )}

          {/* Upcoming appointments */}
          {upcomingAppointments && upcomingAppointments.map((appt) => {
            const childName = (appt.children as any)?.full_name?.split(" ")[0] || "";
            const profName = (appt.medical_professionals as any)?.name || "";
            const specialty = (appt.medical_professionals as any)?.specialty || "";
            const apptDate = new Date(appt.appointment_date);
            const isToday = formatDateKey(apptDate) === today;
            const isTomorrow = (() => {
              const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
              return formatDateKey(apptDate) === formatDateKey(tmrw);
            })();
            const timeStr = apptDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            return (
              <Link key={appt.id} href="/saude/consultas" prefetch={false} className="block">
                <div className="bg-blue-50 border border-blue-200/60 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1A3B3A]">
                      {appt.title || specialty}{childName ? ` — ${childName}` : ""}
                    </p>
                    <p className="text-[11px] text-[#7A8C8B]">
                      {isToday ? "Hoje" : isTomorrow ? "Amanha" : dayNamesShort[apptDate.getDay()] + " " + apptDate.getDate() + "/" + (apptDate.getMonth() + 1)} as {timeStr}
                      {profName && <> &middot; {profName}</>}
                    </p>
                  </div>
                  {(isToday || isTomorrow) && (
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${isToday ? "bg-blue-100 text-blue-700" : "bg-blue-50 text-blue-600"}`}>
                      {isToday ? "HOJE" : "AMANHA"}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* === PENDING EXPENSES AWAITING APPROVAL === */}
      {pendingExpenses && pendingExpenses.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#E8734A] uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E8734A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Despesas para aprovar
            </p>
            <Link href="/despesas" prefetch={false} className="text-[10px] font-semibold text-[#E8734A]">ver todas</Link>
          </div>
          {pendingExpenses.map((exp: any) => {
            const cat = EXPENSE_CATEGORIES.find(c => c.value === exp.category);
            const paidByName = (exp.profiles as any)?.full_name?.split(" ")[0] || "Alguem";
            const expDate = new Date(exp.expense_date + "T12:00:00");
            return (
              <Link key={exp.id} href="/despesas" prefetch={false} className="block">
                <div className="bg-[#E8734A]/[0.06] border border-[#E8734A]/15 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#E8734A]/10 rounded-full flex items-center justify-center flex-shrink-0 text-lg">
                    {cat?.icon || "📦"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1A3B3A] truncate">{exp.description}</p>
                    <p className="text-[11px] text-[#7A8C8B]">{paidByName} &middot; {expDate.getDate()}/{expDate.getMonth() + 1}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[14px] font-bold text-[#1A3B3A]">R$ {Number(exp.amount).toFixed(2)}</p>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#E8734A]/10 text-[#E8734A]">PENDENTE</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* === ANALISE DA SEMANA === */}
      <Link href="/financeiro" prefetch={false} className="block">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 border-l-4 border-l-[#E8734A] flex items-center gap-3 hover:shadow-md transition-shadow">
          <div className="w-9 h-9 rounded-full bg-[#E8734A]/10 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8734A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-[#E8734A] uppercase tracking-wider mb-0.5">Analise da semana</p>
            {Math.abs(balance) > 10 ? (
              <p className="text-[13px] text-[#1A3B3A]">
                {otherName} esta com <strong>R$ {Math.abs(balance).toFixed(0)}</strong> a {balance > 0 ? "menos" : "mais"} em despesas este mes.
              </p>
            ) : (
              <p className="text-[13px] text-[#1A3B3A]">
                Despesas equilibradas entre voces este mes.
              </p>
            )}
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </Link>

      {/* === SALDO + AGENDA (2 columns) === */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/financeiro" prefetch={false} className="block">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 h-full">
            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Saldo</p>
            <p className="text-[22px] font-bold text-[#1A3B3A] tracking-tight">
              R$ {totalMonth > 0 ? Math.abs(balance).toFixed(0) : "0"}
            </p>
            {totalMonth > 0 ? (
              <>
                {balance > 10 ? (
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {otherName} deve
                  </span>
                ) : balance < -10 ? (
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Voce deve
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Equilibrado
                  </span>
                )}
                <div className="mt-3 space-y-1 text-[11px] text-[#7A8C8B]">
                  <div className="flex justify-between">
                    <span>Voce</span>
                    <span className="font-semibold" style={{ color: myColor }}>R$ {myTotal.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{otherName}</span>
                    <span className="font-semibold text-[#1A3B3A]">R$ {otherTotal.toFixed(0)}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-[#9CA3AF] mt-2">Sem despesas</p>
            )}
          </div>
        </Link>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">Agenda</p>
            <Link href="/calendario" prefetch={false} className="text-[10px] font-semibold text-[#E8734A]">ver mais</Link>
          </div>
          {upcomingEvents && upcomingEvents.length > 0 ? (
            <div className="space-y-2.5">
              {upcomingEvents.slice(0, 3).map((event) => {
                const rid = event.responsible_user_id;
                const isMe = rid === user.id;
                const rName = (event.profiles as any)?.full_name?.split(" ")[0];
                const color = parentColors[rid]?.color || PARENT_COLORS.secondary;
                const eDate = new Date(event.start_date + "T12:00:00");
                const tc = typeConfig[event.custody_type] || typeConfig.regular;
                const childName = (event.children as any)?.full_name?.split(" ")[0];
                const hasNote = event.notes && !event.notes.includes("Gerado pela escala");
                const responsibleLabel = isMe ? "com voce" : `com ${rName}`;
                const name = hasNote ? event.notes : (childName ? `${childName} ${responsibleLabel}` : (isMe ? "Com voce" : rName));

                return (
                  <Link key={event.id} href="/calendario" prefetch={false} className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "12" }}>
                      <span className="text-[9px] font-bold uppercase leading-none" style={{ color: color + "99" }}>
                        {dayNamesShort[eDate.getDay()].substring(0, 3).toLowerCase()}
                      </span>
                      <span className="text-[14px] font-bold leading-tight" style={{ color }}>{eDate.getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1A3B3A] text-[13px] truncate">{name}</p>
                      <p className="text-[10px] font-medium" style={{ color: tc.color }}>{tc.label}</p>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-[#9CA3AF]">Sem eventos</p>
          )}
        </div>
      </div>

      {/* === ACOES RAPIDAS === */}
      {!isReadonly && (
      <div>
        <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">Acoes rapidas</p>

        {/* Primary action - Nova despesa (terracotta full-width) */}
        <Link href="/despesas/nova" prefetch={false} className="block mb-3">
          <div className="bg-[#E8734A] rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:bg-[#D4623E] transition-colors active:scale-[0.99]">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-white">Nova despesa</p>
              <p className="text-[11px] text-white/70">Registrar gasto compartilhado</p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>

        {/* Secondary actions - 3 column grid */}
        <div className="grid grid-cols-3 gap-2.5">
          <QuickAction label="Agenda" href="/calendario" color="#0EA5A0"
            icon={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
          />
          <QuickAction label="Chat" href="/chat" color="#8B5CF6"
            icon={<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>}
          />
          <QuickAction label="Check-in" href="/checkin" color="#3B82F6"
            icon={<><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
          />
          <QuickAction label="Familia" href="/familia" color="#0EA5A0"
            icon={<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>}
          />
          <QuickAction label="Acordos" href="/acordos" color="#F59E0B"
            icon={<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>}
          />
          <QuickAction label="Saude" href="/saude" color="#EF4444"
            icon={<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>}
          />
        </div>
      </div>
      )}

      {/* === CHILDREN === */}
      {children && children.length > 0 && (
        <div className="space-y-3">
          {children.map((child) => {
            const custody = todayCustodyByChild[child.id];
            const age = Math.floor((Date.now() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            const birthDate = new Date(child.birth_date);
            const birthMonthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
            const childCheckin = recentCheckins?.find((ci) => (ci.children as any)?.full_name === child.full_name);

            return (
              <Link key={child.id} href={`/criancas/${child.id}`} prefetch={false} className="block bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-[#FFF3E0] rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-[22px] font-bold text-[#E8734A]">
                      {child.full_name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-[#1A3B3A] text-[15px]">{child.full_name?.split(" ")[0]}</p>
                    <p className="text-[11px] text-[#9CA3AF]">{age} {age === 1 ? "ano" : "anos"} &middot; nasceu em {birthMonthNames[birthDate.getMonth()]}/{birthDate.getFullYear()}</p>
                  </div>
                </div>

                {/* Info rows */}
                <div className="space-y-2">
                  {custody && (
                    <div className="flex items-center justify-between bg-[#FFF9F5] rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={custody.isWithMe ? myColor : otherColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                        <span className="text-[13px] text-[#1A3B3A]">Hoje esta com {custody.isWithMe ? "voce" : custody.responsibleName}</span>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0EA5A0]/10 text-[#0EA5A0]">Ativo</span>
                    </div>
                  )}

                  {childCheckin && (
                    <div className="flex items-center justify-between bg-[#FFF9F5] rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span className="text-[13px] text-[#1A3B3A] truncate">{childCheckin.title}</span>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#7A8C8B]/10 text-[#7A8C8B]">ontem</span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* === SWAP BALANCE === */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 flex items-center justify-between">
        <span className="text-[13px] text-[#7A8C8B]">Saldo de trocas</span>
        <div className="text-right">
          <p className="text-xl font-bold text-[#1A3B3A]">
            {mySwapDays >= 0 ? "+" : ""}{mySwapDays} {Math.abs(mySwapDays) === 1 ? "dia" : "dias"}
          </p>
          {mySwapDays === 0 ? (
            <p className="text-[11px] text-emerald-600 font-medium">Em dia &#10003;</p>
          ) : mySwapDays > 0 ? (
            <p className="text-[11px] text-[#E8734A] font-medium">A seu favor</p>
          ) : (
            <p className="text-[11px] text-amber-600 font-medium">Voce deve dias</p>
          )}
        </div>
      </div>

      {/* === INVITE CO-PARENT === */}
      {members && members.length < 2 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100/80 text-center">
          <div className="w-14 h-14 bg-[#1A3B3A]/[0.06] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1A3B3A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
          </div>
          <h3 className="text-[15px] font-bold text-[#1A3B3A] mb-1">Convide o outro responsavel</h3>
          <p className="text-[#7A8C8B] text-[13px] mb-4">Para usar todas as funcionalidades, convide o outro pai/mae.</p>
          <Link href="/convite/enviar" prefetch={false} className="inline-block px-6 py-2.5 bg-[#1A3B3A] text-white font-semibold rounded-xl hover:bg-[#0D2525] transition-colors text-sm">
            Enviar Convite
          </Link>
        </div>
      )}
    </div>
  );
}

function QuickAction({ label, href, color, icon }: { label: string; href: string; color: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl p-3 border border-gray-100/80 hover:shadow-sm transition-all active:scale-95 min-h-[76px]"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "10" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </div>
      <span className="text-[11px] font-medium text-[#1A3B3A]">{label}</span>
    </Link>
  );
}
