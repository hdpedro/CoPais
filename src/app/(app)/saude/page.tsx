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

  // Get user's group membership
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(id, name)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");

  const groupId = memberships[0].group_id;
  const isReadonly = memberships[0].role === "readonly";

  // Get group's children
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
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-dark">Saude</h1>
            <p className="text-sm text-muted">Acompanhamento medico</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-3">👶</p>
          <p className="text-muted mb-4">
            Adicione uma crianca para comecar a usar o modulo de saude.
          </p>
          {!isReadonly && (
            <Link
              href="/criancas/nova"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg"
            >
              Adicionar crianca
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Determine selected child
  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  const selectedChild = children.find((c) => c.id === selectedChildId)!;

  // Fetch data for selected child in parallel
  const today = new Date().toISOString();

  const [
    { data: allergies },
    { data: medications },
    { data: nextAppointment },
    { data: healthLogs },
    { data: recentIllnesses },
    { count: vaccineCount },
    { count: growthCount },
    { count: illnessCount },
    { count: appointmentCount },
    { count: professionalsCount },
  ] = await Promise.all([
    // Allergies
    supabase
      .from("child_allergies")
      .select("id, name, allergy_type, severity, reaction")
      .eq("child_id", selectedChildId)
      .order("severity"),

    // Active medications
    supabase
      .from("active_medications")
      .select(
        "id, name, dosage, frequency, frequency_hours, start_date, end_date, reason"
      )
      .eq("child_id", selectedChildId)
      .eq("status", "active"),

    // Next appointment with professional info
    supabase
      .from("medical_appointments")
      .select(
        "id, title, appointment_date, location, notes, medical_professionals(name, specialty)"
      )
      .eq("child_id", selectedChildId)
      .eq("status", "scheduled")
      .gte("appointment_date", today)
      .order("appointment_date", { ascending: true })
      .limit(1),

    // Recent health logs
    supabase
      .from("health_logs")
      .select(
        "id, log_type, value, notes, logged_at, profiles!health_logs_logged_by_fkey(full_name)"
      )
      .eq("child_id", selectedChildId)
      .order("logged_at", { ascending: false })
      .limit(5),

    // Recent illness episodes
    supabase
      .from("illness_episodes")
      .select("id, title, severity, status, symptoms, hospital_visit, hospital_name, start_date, created_at, profiles:created_by(full_name)")
      .eq("child_id", selectedChildId)
      .order("created_at", { ascending: false })
      .limit(5),

    // Counts for quick access cards
    supabase
      .from("vaccination_records")
      .select("id", { count: "exact", head: true })
      .eq("child_id", selectedChildId),

    supabase
      .from("growth_records")
      .select("id", { count: "exact", head: true })
      .eq("child_id", selectedChildId),

    supabase
      .from("illness_episodes")
      .select("id", { count: "exact", head: true })
      .eq("child_id", selectedChildId),

    supabase
      .from("medical_appointments")
      .select("id", { count: "exact", head: true })
      .eq("child_id", selectedChildId),

    supabase
      .from("medical_professionals")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId),
  ]);

  const appointment = nextAppointment?.[0] || null;

  // Severity colors for allergies
  const severityConfig: Record<string, { bg: string; text: string; label: string }> = {
    severe: { bg: "bg-red-100", text: "text-red-700", label: "Grave" },
    moderate: { bg: "bg-amber-100", text: "text-amber-700", label: "Moderada" },
    mild: { bg: "bg-green-100", text: "text-green-700", label: "Leve" },
  };

  // Type config for health logs
  const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
    fever: { icon: "🌡️", label: "Febre", color: "bg-red-400" },
    medication: { icon: "💊", label: "Medicacao", color: "bg-blue-400" },
    mood: { icon: "😊", label: "Humor", color: "bg-yellow-400" },
    screen_time: { icon: "📱", label: "Tempo de tela", color: "bg-purple-400" },
    food: { icon: "🍽️", label: "Alimentacao", color: "bg-orange-400" },
    sleep: { icon: "😴", label: "Sono", color: "bg-indigo-400" },
    weight: { icon: "⚖️", label: "Peso", color: "bg-teal-400" },
    height: { icon: "📏", label: "Altura", color: "bg-emerald-400" },
    vaccine: { icon: "💉", label: "Vacina", color: "bg-cyan-400" },
    other: { icon: "📝", label: "Outro", color: "bg-gray-400" },
  };

  // Merge health logs and illness episodes into a unified timeline
  type TimelineItem = {
    id: string;
    type: "log" | "illness";
    date: Date;
    icon: string;
    label: string;
    color: string;
    value?: string | null;
    notes?: string | null;
    author?: string | null;
    severity?: string | null;
    status?: string | null;
    hospital?: boolean;
  };

  const timelineItems: TimelineItem[] = [];

  // Add health logs
  if (healthLogs) {
    for (const log of healthLogs) {
      const config = typeConfig[log.log_type] || typeConfig.other;
      timelineItems.push({
        id: log.id,
        type: "log",
        date: new Date(log.logged_at),
        icon: config.icon,
        label: config.label,
        color: config.color,
        value: log.value,
        notes: log.notes,
        author: (log.profiles as any)?.full_name || null,
      });
    }
  }

  // Add illness episodes
  if (recentIllnesses) {
    for (const ep of recentIllnesses) {
      const sevConfig: Record<string, { icon: string; color: string; label: string }> = {
        grave: { icon: "🔴", color: "bg-red-400", label: "Grave" },
        moderado: { icon: "🟡", color: "bg-amber-400", label: "Moderado" },
        leve: { icon: "🟢", color: "bg-green-400", label: "Leve" },
      };
      const sev = sevConfig[ep.severity || "leve"] || sevConfig.leve;
      timelineItems.push({
        id: ep.id,
        type: "illness",
        date: new Date(ep.created_at || ep.start_date + "T12:00:00"),
        icon: "🤒",
        label: ep.title,
        color: sev.color,
        value: ep.symptoms?.join(", ") || null,
        notes: ep.hospital_visit ? `🏥 Hospital${ep.hospital_name ? `: ${ep.hospital_name}` : ""}` : null,
        author: (ep.profiles as any)?.full_name || null,
        severity: ep.severity,
        status: ep.status,
        hospital: ep.hospital_visit,
      });
    }
  }

  // Sort by date descending and take first 8
  timelineItems.sort((a, b) => b.date.getTime() - a.date.getTime());
  const timeline = timelineItems.slice(0, 8);

  // Quick access grid items
  const quickAccess = [
    {
      icon: "📅",
      label: "Consultas",
      href: "/saude/consultas",
      subtitle: `${appointmentCount ?? 0} agendada${(appointmentCount ?? 0) !== 1 ? "s" : ""}`,
      color: "text-primary",
    },
    {
      icon: "💊",
      label: "Medicamentos",
      href: "/saude/medicamentos",
      subtitle: `${medications?.length ?? 0} ativo${(medications?.length ?? 0) !== 1 ? "s" : ""}`,
      color: "text-blue-500",
    },
    {
      icon: "💉",
      label: "Vacinas",
      href: "/saude/vacinas",
      subtitle: `${vaccineCount ?? 0} registro${(vaccineCount ?? 0) !== 1 ? "s" : ""}`,
      color: "text-cyan-500",
    },
    {
      icon: "📏",
      label: "Crescimento",
      href: "/saude/crescimento",
      subtitle: `${growthCount ?? 0} ${(growthCount ?? 0) !== 1 ? "medicoes" : "medicao"}`,
      color: "text-emerald-500",
    },
    {
      icon: "🤒",
      label: "Doencas",
      href: "/saude/doencas",
      subtitle: `${illnessCount ?? 0} episodio${(illnessCount ?? 0) !== 1 ? "s" : ""}`,
      color: "text-amber-500",
    },
    {
      icon: "⚠️",
      label: "Alergias",
      href: "/saude/alergias",
      subtitle: `${allergies?.length ?? 0} registrada${(allergies?.length ?? 0) !== 1 ? "s" : ""}`,
      color: "text-red-500",
    },
    {
      icon: "🩺",
      label: "Profissionais",
      href: "/saude/profissionais",
      subtitle: `${professionalsCount ?? 0} cadastrado${(professionalsCount ?? 0) !== 1 ? "s" : ""}`,
      color: "text-violet-500",
    },
  ];

  // Calculate medication progress
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

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-muted hover:text-dark">
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">Saude</h1>
          <p className="text-sm text-muted">Acompanhamento medico</p>
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

      {/* Child Selector */}
      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {children.map((child) => {
            const isActive = child.id === selectedChildId;
            return (
              <Link
                key={child.id}
                href={`/saude?crianca=${child.id}`}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white border-2 border-primary"
                    : "bg-white text-dark border-2 border-gray-200 hover:border-primary/40"
                }`}
              >
                {child.full_name.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      )}

      {/* Selected child name if only one */}
      {children.length === 1 && (
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full">
            <span className="text-sm">👶</span>
            <span className="text-sm font-medium text-primary">
              {selectedChild.full_name}
            </span>
          </div>
        </div>
      )}

      {/* Alert Cards */}
      <div className="space-y-3 mb-6">
        {/* Allergies Alert */}
        {allergies && allergies.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-400 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔴</span>
              <h3 className="text-sm font-semibold text-dark uppercase tracking-wide">
                Alergias
              </h3>
              <span className="text-xs text-muted ml-auto">
                {allergies.length} registrada{allergies.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allergies.map((allergy) => {
                const config = severityConfig[allergy.severity] || severityConfig.mild;
                return (
                  <div
                    key={allergy.id}
                    className={`${config.bg} ${config.text} px-3 py-1.5 rounded-lg text-xs font-medium`}
                  >
                    <span>{allergy.name}</span>
                    <span className="opacity-70 ml-1">({config.label})</span>
                  </div>
                );
              })}
            </div>
            {allergies.some((a) => a.reaction) && (
              <div className="mt-2 space-y-1">
                {allergies
                  .filter((a) => a.reaction)
                  .map((a) => (
                    <p key={a.id} className="text-xs text-red-600">
                      <span className="font-medium">{a.name}:</span> {a.reaction}
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Active Medication Alert */}
        {medications && medications.length > 0 && (
          <div className="space-y-3">
            {medications.map((med) => {
              const progress = getMedProgress(med.start_date, med.end_date);
              return (
                <div
                  key={med.id}
                  className="bg-amber-50 border-l-4 border-amber-400 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🟡</span>
                    <h3 className="text-sm font-semibold text-dark uppercase tracking-wide">
                      Medicamento ativo
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-dark">{med.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                          />
                        </svg>
                        {med.dosage}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        {med.frequency}
                      </span>
                    </div>
                    {med.frequency_hours && (
                      <p className="text-xs text-amber-600 font-medium">
                        A cada {med.frequency_hours}h
                      </p>
                    )}
                    {med.reason && (
                      <p className="text-xs text-muted">Motivo: {med.reason}</p>
                    )}
                    {progress && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                          <span>
                            Dia {progress.elapsedDays} de {progress.totalDays}
                          </span>
                          <span>{progress.percent}%</span>
                        </div>
                        <div className="w-full bg-amber-200 rounded-full h-2">
                          <div
                            className="bg-amber-500 h-2 rounded-full transition-all"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Next Appointment Alert */}
        {appointment && (
          <div className="bg-white border-l-4 border-primary rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🟢</span>
              <h3 className="text-sm font-semibold text-dark uppercase tracking-wide">
                Proxima consulta
              </h3>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 bg-primary/10 rounded-xl px-3 py-2 text-center">
                <p className="text-2xl font-bold text-primary">
                  {new Date(appointment.appointment_date).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    day: "2-digit",
                  })}
                </p>
                <p className="text-xs text-primary font-medium uppercase">
                  {new Date(appointment.appointment_date).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    month: "short",
                  })}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-dark truncate">
                  {appointment.title}
                </p>
                {(appointment.medical_professionals as any)?.name && (
                  <p className="text-xs text-dark mt-0.5">
                    Dr(a). {(appointment.medical_professionals as any).name}
                    {(appointment.medical_professionals as any).specialty && (
                      <span className="text-muted">
                        {" "}
                        — {(appointment.medical_professionals as any).specialty}
                      </span>
                    )}
                  </p>
                )}
                {appointment.location && (
                  <p className="text-xs text-muted mt-1 flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {appointment.location}
                  </p>
                )}
                <p className="text-xs text-primary font-medium mt-1">
                  {new Date(appointment.appointment_date).toLocaleTimeString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Access Grid */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-dark mb-3 px-1">Acesso rapido</h2>
        <div className="grid grid-cols-3 gap-3">
          {quickAccess.map((item) => (
            <Link
              key={item.href}
              href={item.href === "/saude/profissionais" ? item.href : `${item.href}?crianca=${selectedChildId}`}
              className="bg-white rounded-xl p-3 shadow-sm text-center hover:shadow-md transition-shadow"
            >
              <span className="text-2xl block mb-1">{item.icon}</span>
              <p className="text-xs font-semibold text-dark">{item.label}</p>
              <p className="text-[10px] text-muted mt-0.5">{item.subtitle}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent Timeline */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-dark mb-3 px-1">
          Ultimos registros
        </h2>
        {timeline.length > 0 ? (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="space-y-4">
              {timeline.map((item, index) => {
                const isLast = index === timeline.length - 1;

                return (
                  <div key={`${item.type}-${item.id}`} className="flex gap-3">
                    {/* Timeline dot and line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${item.color}`}
                      />
                      {!isLast && (
                        <div className="w-0.5 bg-gray-200 flex-1 mt-1" />
                      )}
                    </div>

                    {/* Content */}
                    <div className={`flex-1 min-w-0 ${!isLast ? "pb-2" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{item.icon}</span>
                        <span className="text-xs font-semibold text-dark">
                          {item.label}
                        </span>
                        {item.type === "illness" && item.status === "active" && (
                          <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                            Ativo
                          </span>
                        )}
                        {item.type === "illness" && item.status === "recovered" && (
                          <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                            Recuperada
                          </span>
                        )}
                        <span className="text-[10px] text-muted ml-auto">
                          {item.date.toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}{" "}
                          {item.date.toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {item.value && (
                        <p className="text-sm text-dark mt-0.5">{item.value}</p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-muted mt-0.5">{item.notes}</p>
                      )}
                      {item.author && (
                        <p className="text-[10px] text-muted mt-0.5">
                          Por {item.author}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-muted text-sm">
              Nenhum registro de saude para {selectedChild.full_name.split(" ")[0]}.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
