import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function SaudePage({
  searchParams,
}: {
  searchParams: Promise<{ crianca?: string; success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(id, name)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");

  const groupId = memberships[0].group_id;
  const isReadonly = memberships[0].role === "readonly";

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", groupId)
    .order("birth_date");

  if (!children || children.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-muted hover:text-dark">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-dark">Saude</h1>
        </div>
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-3">👶</p>
          <p className="text-muted mb-4">Adicione uma crianca para comecar.</p>
          {!isReadonly && (
            <Link href="/criancas/nova" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg">
              Adicionar crianca
            </Link>
          )}
        </div>
      </div>
    );
  }

  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  const selectedChild = children.find((c) => c.id === selectedChildId)!;
  const today = new Date().toISOString();

  // Fetch all data in parallel
  const [
    { data: activeIllnesses },
    { data: medications },
    { data: allergies },
    { data: nextAppointment },
    { count: illnessCount },
    { count: vaccineCount },
    { count: growthCount },
    { count: appointmentCount },
    { count: professionalsCount },
  ] = await Promise.all([
    supabase
      .from("illness_episodes")
      .select("id, title, severity, status, symptoms, hospital_visit, hospital_name, start_date, created_at, profiles:created_by(full_name)")
      .eq("child_id", selectedChildId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),

    supabase
      .from("active_medications")
      .select("id, name, dosage, frequency, frequency_hours, start_date, end_date, reason")
      .eq("child_id", selectedChildId)
      .eq("status", "active"),

    supabase
      .from("child_allergies")
      .select("id, name, allergy_type, severity, reaction")
      .eq("child_id", selectedChildId)
      .order("severity"),

    supabase
      .from("medical_appointments")
      .select("id, title, appointment_date, location, medical_professionals(name, specialty)")
      .eq("child_id", selectedChildId)
      .eq("status", "scheduled")
      .gte("appointment_date", today)
      .order("appointment_date", { ascending: true })
      .limit(1),

    supabase.from("illness_episodes").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("vaccination_records").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("growth_records").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("medical_appointments").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("medical_professionals").select("id", { count: "exact", head: true }).eq("group_id", groupId),
  ]);

  const appointment = nextAppointment?.[0] || null;
  const hasActiveIllness = (activeIllnesses?.length ?? 0) > 0;
  const hasActiveMeds = (medications?.length ?? 0) > 0;
  const hasAllergies = (allergies?.length ?? 0) > 0;
  const childFirstName = selectedChild.full_name.split(" ")[0];

  // Medication progress helper
  function getMedProgress(startDate: string, endDate: string | null) {
    if (!endDate) return null;
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const now = Date.now();
    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const elapsedDays = Math.max(0, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
    const percent = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
    return { totalDays, elapsedDays: Math.min(elapsedDays, totalDays), percent };
  }

  const sevColors: Record<string, { border: string; bg: string; icon: string }> = {
    grave: { border: "border-red-400", bg: "bg-red-50", icon: "🔴" },
    moderado: { border: "border-amber-400", bg: "bg-amber-50", icon: "🟡" },
    leve: { border: "border-green-400", bg: "bg-green-50", icon: "🟢" },
  };

  const allergySevConfig: Record<string, { bg: string; text: string; label: string }> = {
    severe: { bg: "bg-red-100", text: "text-red-700", label: "Grave" },
    moderate: { bg: "bg-amber-100", text: "text-amber-700", label: "Moderada" },
    mild: { bg: "bg-green-100", text: "text-green-700", label: "Leve" },
  };

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/dashboard" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-dark">Saude</h1>
        </div>
      </div>

      {/* Alerts */}
      {params.success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(params.success)}
        </div>
      )}
      {params.error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(params.error)}
        </div>
      )}

      {/* ─── Child Selector ─── */}
      {children.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
          {children.map((child) => {
            const isActive = child.id === selectedChildId;
            return (
              <Link
                key={child.id}
                href={`/saude?crianca=${child.id}`}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "bg-white text-dark border border-gray-200 hover:border-primary/40"
                }`}
              >
                {child.full_name.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mb-5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-full text-sm font-medium text-primary">
            👶 {selectedChild.full_name}
          </span>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* ─── HERO: Status da Crianca ─── */}
      {/* ═══════════════════════════════════════════ */}
      <div className={`rounded-2xl p-5 mb-5 shadow-sm ${
        hasActiveIllness
          ? "bg-gradient-to-br from-red-50 to-amber-50 border border-red-200"
          : "bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200"
      }`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
            hasActiveIllness ? "bg-red-100" : "bg-green-100"
          }`}>
            {hasActiveIllness ? "🤒" : "😊"}
          </div>
          <div>
            <h2 className="text-base font-bold text-dark">
              {hasActiveIllness
                ? `${childFirstName} esta doente`
                : `${childFirstName} esta bem`}
            </h2>
            <p className="text-xs text-muted">
              {hasActiveIllness
                ? `${activeIllnesses!.length} episodio${activeIllnesses!.length !== 1 ? "s" : ""} ativo${activeIllnesses!.length !== 1 ? "s" : ""}`
                : "Nenhum problema de saude ativo"}
            </p>
          </div>
        </div>

        {/* Active illnesses list */}
        {hasActiveIllness && (
          <div className="space-y-2 mb-3">
            {activeIllnesses!.map((ep) => {
              const sev = sevColors[ep.severity || "leve"] || sevColors.leve;
              const daysActive = Math.max(1, Math.ceil((Date.now() - new Date(ep.start_date + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24)));
              return (
                <Link
                  key={ep.id}
                  href={`/saude/doencas?crianca=${selectedChildId}`}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border-l-4 bg-white/80 ${sev.border}`}
                >
                  <span className="text-sm">{sev.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-dark">{ep.title}</p>
                    <p className="text-[11px] text-muted">
                      {daysActive} dia{daysActive !== 1 ? "s" : ""}
                      {ep.hospital_visit ? " · 🏥 Hospital" : ""}
                      {ep.symptoms && ep.symptoms.length > 0 ? ` · ${ep.symptoms.slice(0, 3).join(", ")}` : ""}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}

        {/* Active medications inline */}
        {hasActiveMeds && (
          <div className="space-y-2 mb-3">
            {medications!.map((med) => {
              const progress = getMedProgress(med.start_date, med.end_date);
              return (
                <Link
                  key={med.id}
                  href={`/saude/medicamentos?crianca=${selectedChildId}`}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border-l-4 border-blue-400 bg-white/80"
                >
                  <span className="text-sm">💊</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-dark">{med.name}</p>
                    <p className="text-[11px] text-muted">
                      {med.dosage} · {med.frequency}
                      {progress ? ` · Dia ${progress.elapsedDays}/${progress.totalDays}` : ""}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}

        {/* Allergies badge */}
        {hasAllergies && (
          <div className="flex flex-wrap gap-1.5">
            {allergies!.map((a) => {
              const cfg = allergySevConfig[a.severity] || allergySevConfig.mild;
              return (
                <span key={a.id} className={`${cfg.bg} ${cfg.text} px-2 py-0.5 rounded-full text-[11px] font-medium`}>
                  ⚠️ {a.name}
                </span>
              );
            })}
          </div>
        )}

        {/* Next appointment */}
        {appointment && (
          <Link
            href={`/saude/consultas?crianca=${selectedChildId}`}
            className="flex items-center gap-2.5 p-2.5 rounded-xl border-l-4 border-primary bg-white/80 mt-2"
          >
            <span className="text-sm">📅</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-dark">{appointment.title}</p>
              <p className="text-[11px] text-muted">
                {new Date(appointment.appointment_date).toLocaleDateString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  day: "2-digit",
                  month: "short",
                })}{" "}
                as{" "}
                {new Date(appointment.appointment_date).toLocaleTimeString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {(appointment.medical_professionals as any)?.name
                  ? ` · Dr(a). ${(appointment.medical_professionals as any).name}`
                  : ""}
              </p>
            </div>
            <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* ─── ACOES: Doencas ─── */}
      {/* ═══════════════════════════════════════════ */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">Doencas</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/saude/doencas?crianca=${selectedChildId}`}
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <p className="text-sm font-bold text-dark">Historico de Doencas</p>
            <p className="text-xs text-muted mt-0.5">{illnessCount ?? 0} episodio{(illnessCount ?? 0) !== 1 ? "s" : ""} registrado{(illnessCount ?? 0) !== 1 ? "s" : ""}</p>
          </Link>

          {!isReadonly ? (
            <Link
              href="/saude/doencas/nova"
              className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-sm font-bold text-white">Registrar Doenca</p>
              <p className="text-xs text-white/70 mt-0.5">Novo episodio</p>
            </Link>
          ) : (
            <div className="bg-gray-50 rounded-xl p-4 opacity-60">
              <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-sm font-bold text-muted">Registrar Doenca</p>
              <p className="text-xs text-muted mt-0.5">Somente leitura</p>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* ─── ACOMPANHAMENTO ─── */}
      {/* ═══════════════════════════════════════════ */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">Acompanhamento</h2>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {[
            {
              icon: "📅",
              label: "Consultas",
              href: `/saude/consultas?crianca=${selectedChildId}`,
              info: `${appointmentCount ?? 0} agendada${(appointmentCount ?? 0) !== 1 ? "s" : ""}`,
              iconBg: "bg-primary/10",
            },
            {
              icon: "💊",
              label: "Medicamentos",
              href: `/saude/medicamentos?crianca=${selectedChildId}`,
              info: `${medications?.length ?? 0} ativo${(medications?.length ?? 0) !== 1 ? "s" : ""}`,
              iconBg: "bg-blue-50",
              badge: hasActiveMeds ? `${medications!.length}` : null,
            },
            {
              icon: "⚠️",
              label: "Alergias",
              href: `/saude/alergias?crianca=${selectedChildId}`,
              info: `${allergies?.length ?? 0} registrada${(allergies?.length ?? 0) !== 1 ? "s" : ""}`,
              iconBg: "bg-red-50",
              badge: hasAllergies ? `${allergies!.length}` : null,
            },
          ].map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors ${i > 0 ? "border-t border-gray-100" : ""}`}
            >
              <div className={`w-9 h-9 rounded-lg ${item.iconBg} flex items-center justify-center`}>
                <span className="text-base">{item.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-dark">{item.label}</p>
                <p className="text-[11px] text-muted">{item.info}</p>
              </div>
              {item.badge && (
                <span className="text-[11px] font-bold text-white bg-accent rounded-full w-5 h-5 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════ */}
      {/* ─── REGISTROS ─── */}
      {/* ═══════════════════════════════════════════ */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">Registros</h2>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {[
            {
              icon: "💉",
              label: "Vacinas",
              href: `/saude/vacinas?crianca=${selectedChildId}`,
              info: `${vaccineCount ?? 0} registro${(vaccineCount ?? 0) !== 1 ? "s" : ""}`,
              iconBg: "bg-cyan-50",
            },
            {
              icon: "📏",
              label: "Crescimento",
              href: `/saude/crescimento?crianca=${selectedChildId}`,
              info: `${growthCount ?? 0} ${(growthCount ?? 0) !== 1 ? "medicoes" : "medicao"}`,
              iconBg: "bg-emerald-50",
            },
            {
              icon: "🩺",
              label: "Profissionais de Saude",
              href: "/saude/profissionais",
              info: `${professionalsCount ?? 0} cadastrado${(professionalsCount ?? 0) !== 1 ? "s" : ""}`,
              iconBg: "bg-violet-50",
            },
          ].map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors ${i > 0 ? "border-t border-gray-100" : ""}`}
            >
              <div className={`w-9 h-9 rounded-lg ${item.iconBg} flex items-center justify-center`}>
                <span className="text-base">{item.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-dark">{item.label}</p>
                <p className="text-[11px] text-muted">{item.info}</p>
              </div>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
