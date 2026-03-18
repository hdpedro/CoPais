import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { logMedicationDose, updateMedicationStatus } from "@/actions/health";

export default async function MedicamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error: errorMsg } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  // Fetch all medications for the group, joined with children
  const { data: medications } = await supabase
    .from("active_medications")
    .select("*, children(full_name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const activeMeds = medications?.filter((m) => m.status === "active") ?? [];
  const historyMeds =
    medications?.filter((m) => m.status === "completed" || m.status === "cancelled") ?? [];

  // Fetch recent doses for active medications
  const activeMedIds = activeMeds.map((m) => m.id);
  let doses: any[] = [];
  if (activeMedIds.length > 0) {
    const { data: dosesData } = await supabase
      .from("medication_doses")
      .select("*, profiles!medication_doses_administered_by_fkey(full_name)")
      .in("medication_id", activeMedIds)
      .order("administered_at", { ascending: false })
      .limit(50);
    doses = dosesData ?? [];
  }

  function formatDateBR(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR");
  }

  function formatDateTimeBR(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function calcProgress(startDate: string | null, endDate: string | null) {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const now = new Date();
    const totalDays = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );
    const elapsed = Math.max(
      0,
      Math.min(
        totalDays,
        Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      )
    );
    return { elapsed, totalDays };
  }

  return (
    <div className="max-w-lg mx-auto pb-20 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/saude"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-[#8E8E93] hover:bg-gray-50 transition-colors"
        >
          ←
        </Link>
        <h1 className="text-2xl font-bold text-[#2D2D2D]">Medicamentos</h1>
      </div>

      {/* Alerts */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-[#DC4446] px-4 py-3 rounded-xl text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {/* Active Medications */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#2D2D2D]">Ativos</h2>

        {activeMeds.length === 0 ? (
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-[#8E8E93] text-sm">Nenhum medicamento ativo.</p>
          </div>
        ) : (
          activeMeds.map((med) => {
            const progress = calcProgress(med.start_date, med.end_date);
            const medDoses = doses
              .filter((d) => d.medication_id === med.id)
              .slice(0, 3);

            return (
              <div
                key={med.id}
                className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-[#DC4446]"
              >
                {/* Name & Status */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-bold text-sm text-[#2D2D2D]">{med.name}</span>
                    <span className="text-xs text-[#8E8E93] ml-2">
                      — {(med.children as any)?.full_name}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#DC4446] bg-red-50 px-2 py-0.5 rounded-full">
                    <span className="text-[8px]">●</span> Ativo
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-1 text-sm text-[#2D2D2D]">
                  {med.dosage && (
                    <p>
                      <span className="mr-1">💊</span> Dosagem: {med.dosage}
                    </p>
                  )}
                  {med.frequency && (
                    <p>
                      <span className="mr-1">⏰</span> Frequência: {med.frequency}
                    </p>
                  )}
                  {med.reason && (
                    <p>
                      <span className="mr-1">📋</span> Motivo: {med.reason}
                    </p>
                  )}
                  <p>
                    <span className="mr-1">📅</span> Período: {formatDateBR(med.start_date)}{" "}
                    → {formatDateBR(med.end_date)}
                  </p>
                  {med.prescribed_by && (
                    <p>
                      <span className="mr-1">👩‍⚕️</span> Prescrito por: {med.prescribed_by}
                    </p>
                  )}
                </div>

                {/* Progress Bar */}
                {progress && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-[#8E8E93] mb-1">
                      <span>Progresso</span>
                      <span>
                        {progress.elapsed} de {progress.totalDays} dias
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#5B9B8A] rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (progress.elapsed / progress.totalDays) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Recent Doses */}
                {medDoses.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-[#8E8E93] mb-1.5">
                      Últimas doses
                    </p>
                    <div className="space-y-1">
                      {medDoses.map((dose) => (
                        <div
                          key={dose.id}
                          className="flex items-center justify-between text-xs text-[#2D2D2D]"
                        >
                          <span>{formatDateTimeBR(dose.administered_at)}</span>
                          <span className="text-[#8E8E93]">
                            por {(dose.profiles as any)?.full_name ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                  <form action={logMedicationDose} className="flex-1">
                    <input type="hidden" name="medicationId" value={med.id} />
                    <button
                      type="submit"
                      className="w-full py-2 bg-[#5B9B8A] text-white text-xs font-semibold rounded-lg hover:bg-[#4a8a79] transition-colors"
                    >
                      Registrar Dose
                    </button>
                  </form>
                  <form action={updateMedicationStatus}>
                    <input type="hidden" name="medicationId" value={med.id} />
                    <input type="hidden" name="status" value="completed" />
                    <button
                      type="submit"
                      className="px-3 py-2 text-xs text-[#8E8E93] hover:text-[#2D2D2D] transition-colors"
                    >
                      Concluir Tratamento
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* History */}
      {historyMeds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[#2D2D2D]">Histórico</h2>

          {historyMeds.map((med) => (
            <div key={med.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm text-[#2D2D2D]">{med.name}</span>
                  <span className="text-xs text-[#8E8E93] ml-2">
                    — {(med.children as any)?.full_name}
                  </span>
                </div>
                {med.status === "completed" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    ✓ Concluído
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#8E8E93] bg-gray-100 px-2 py-0.5 rounded-full">
                    Cancelado
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs text-[#8E8E93] space-y-0.5">
                {med.dosage && <p>💊 {med.dosage}</p>}
                <p>
                  📅 {formatDateBR(med.start_date)} → {formatDateBR(med.end_date)}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Add Button */}
      <Link
        href="/saude/medicamentos/novo"
        className="block w-full py-3 bg-[#E8913A] text-white text-sm font-semibold rounded-xl text-center hover:bg-[#d6812f] transition-colors shadow-sm"
      >
        + Adicionar Medicamento
      </Link>
    </div>
  );
}
