import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { APPOINTMENT_STATUSES } from "@/lib/health-constants";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;
  const isReadonly = memberships[0].role === "readonly";

  const { data: appointments } = await supabase
    .from("medical_appointments")
    .select(
      "*, medical_professionals(name, specialty, whatsapp), children(full_name)"
    )
    .eq("group_id", groupId)
    .order("appointment_date", { ascending: true });

  const params = await searchParams;
  const now = new Date().toISOString();

  const upcoming =
    appointments?.filter(
      (a) => a.status === "scheduled" && a.appointment_date >= now
    ) || [];

  const past =
    appointments?.filter(
      (a) =>
        a.status === "completed" ||
        a.status === "cancelled" ||
        (a.status === "scheduled" && a.appointment_date < now)
    ) || [];

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const day = date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric" });
    const month = date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "short" });
    return { day, month };
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function cleanWhatsAppNumber(number: string): string {
    const digits = number.replace(/\D/g, "");
    if (digits.length <= 11) return "55" + digits;
    return digits;
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark">
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
        <h1 className="text-2xl font-bold text-dark">Consultas</h1>
      </div>

      {params.success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {params.success}
        </div>
      )}

      {params.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {params.error}
        </div>
      )}

      {/* Upcoming appointments */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold text-dark">
            Proximas Consultas
          </h2>
          <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
            {upcoming.length}
          </span>
        </div>

        {upcoming.length > 0 ? (
          <div className="space-y-3">
            {upcoming.map((apt) => {
              const { day, month } = formatDate(apt.appointment_date);
              const time = formatTime(apt.appointment_date);
              const professional = apt.medical_professionals as any;
              const child = apt.children as any;
              const status = APPOINTMENT_STATUSES[apt.status] || {
                label: apt.status,
                color: "bg-gray-100 text-gray-500",
              };

              return (
                <div
                  key={apt.id}
                  className="bg-white rounded-xl p-4 shadow-sm"
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-14 h-14 bg-primary/10 rounded-lg flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-primary leading-none">
                        {day}
                      </span>
                      <span className="text-xs text-primary uppercase">
                        {month}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-dark text-sm truncate">
                          {apt.title}
                        </h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      {professional && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <p className="text-sm text-muted">
                            {professional.name}
                            {professional.specialty &&
                              ` - ${professional.specialty}`}
                          </p>
                          {professional.whatsapp && (
                            <a
                              href={`https://wa.me/${cleanWhatsAppNumber(professional.whatsapp)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="WhatsApp"
                            >
                              <svg
                                className="w-4 h-4 text-[#25D366]"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.7-6.412-1.9l-.447-.29-2.642.886.886-2.642-.29-.447A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
                              </svg>
                            </a>
                          )}
                        </div>
                      )}
                      {child && (
                        <p className="text-xs text-muted mt-0.5">
                          {child.full_name}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                        <span>🕐 {time}</span>
                        {apt.location && <span>📍 {apt.location}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-muted text-sm">
              Nenhuma consulta agendada.
            </p>
          </div>
        )}
      </div>

      {/* Past appointments */}
      {past.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-dark mb-3">
            Consultas Realizadas
          </h2>
          <div className="space-y-3">
            {past.map((apt) => {
              const { day, month } = formatDate(apt.appointment_date);
              const time = formatTime(apt.appointment_date);
              const professional = apt.medical_professionals as any;
              const child = apt.children as any;
              const status = APPOINTMENT_STATUSES[apt.status] || {
                label: apt.status,
                color: "bg-gray-100 text-gray-500",
              };

              return (
                <div
                  key={apt.id}
                  className="bg-white rounded-xl p-4 shadow-sm opacity-80"
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-14 h-14 bg-gray-100 rounded-lg flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-muted leading-none">
                        {day}
                      </span>
                      <span className="text-xs text-muted uppercase">
                        {month}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-dark text-sm truncate">
                          {apt.title}
                        </h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      {professional && (
                        <p className="text-sm text-muted">
                          {professional.name}
                          {professional.specialty &&
                            ` - ${professional.specialty}`}
                        </p>
                      )}
                      {child && (
                        <p className="text-xs text-muted mt-0.5">
                          {child.full_name}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                        <span>🕐 {time}</span>
                        {apt.location && <span>📍 {apt.location}</span>}
                      </div>
                      {apt.summary && (
                        <p className="text-xs text-dark mt-2 bg-gray-50 rounded-lg p-2">
                          {apt.summary}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add appointment button */}
      {!isReadonly && (
        <Link
          href="/saude/consultas/nova"
          className="block w-full py-3 bg-primary text-white text-center font-semibold rounded-xl hover:bg-primary-dark transition-colors"
        >
          + Agendar Consulta
        </Link>
      )}
    </div>
  );
}
