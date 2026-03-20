import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { VACCINE_CALENDAR } from "@/lib/health-constants";

export default async function VacinasPage({
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
    .select("group_id, role")
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
          <Link href="/saude" className="text-muted hover:text-dark">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-dark">Vacinacao</h1>
        </div>
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted text-sm">Adicione uma crianca primeiro.</p>
        </div>
      </div>
    );
  }

  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  const selectedChild = children.find((c) => c.id === selectedChildId)!;

  // Calculate child age in months
  const birthDate = new Date(selectedChild.birth_date + "T12:00:00");
  const now = new Date();
  const ageMonths =
    (now.getFullYear() - birthDate.getFullYear()) * 12 +
    (now.getMonth() - birthDate.getMonth());

  const ageDisplay =
    ageMonths < 12
      ? `${ageMonths} ${ageMonths === 1 ? "mes" : "meses"}`
      : `${Math.floor(ageMonths / 12)} ano${Math.floor(ageMonths / 12) !== 1 ? "s" : ""}${
          ageMonths % 12 > 0
            ? ` e ${ageMonths % 12} ${ageMonths % 12 === 1 ? "mes" : "meses"}`
            : ""
        }`;

  // Fetch vaccination records
  const { data: records } = await supabase
    .from("vaccination_records")
    .select("id, vaccine_name, dose_label, administered_date")
    .eq("child_id", selectedChildId)
    .order("administered_date", { ascending: false });

  const vaccineRecords = records || [];

  // Build vaccine status from calendar
  type VaccineStatus = "taken" | "overdue" | "future";

  interface VaccineEntry {
    name: string;
    doses: number;
    status: VaccineStatus;
    date?: string;
  }

  interface AgeGroup {
    age: string;
    ageMonths: number;
    vaccines: VaccineEntry[];
  }

  const calendarStatus: AgeGroup[] = VACCINE_CALENDAR.map((group) => ({
    age: group.age,
    ageMonths: group.ageMonths,
    vaccines: group.vaccines.map((vaccine) => {
      // Check if a matching record exists
      const record = vaccineRecords.find(
        (r) =>
          r.vaccine_name.toLowerCase().includes(vaccine.name.toLowerCase()) ||
          vaccine.name.toLowerCase().includes(r.vaccine_name.toLowerCase())
      );

      let status: VaccineStatus;
      if (record) {
        status = "taken";
      } else if (ageMonths >= group.ageMonths) {
        status = "overdue";
      } else {
        status = "future";
      }

      return {
        name: vaccine.name,
        doses: vaccine.doses,
        status,
        date: record?.administered_date || undefined,
      };
    }),
  }));

  // Counts
  let takenCount = 0;
  let overdueCount = 0;
  let futureCount = 0;

  calendarStatus.forEach((group) =>
    group.vaccines.forEach((v) => {
      if (v.status === "taken") takenCount++;
      else if (v.status === "overdue") overdueCount++;
      else futureCount++;
    })
  );

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">Vacinacao</h1>
          <p className="text-sm text-muted">
            {selectedChild.full_name} &middot; {ageDisplay}
          </p>
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
                href={`/saude/vacinas?crianca=${child.id}`}
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

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{takenCount}</p>
          <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">
            Em dia
          </p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{overdueCount}</p>
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">
            Atrasadas
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-gray-600">{futureCount}</p>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Futuras
          </p>
        </div>
      </div>

      {/* Overdue Alert */}
      {overdueCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 rounded-xl p-4 shadow-sm mb-6">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-700">
                {overdueCount} vacina{overdueCount !== 1 ? "s" : ""} atrasada
                {overdueCount !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-red-600">
                Consulte o pediatra para regularizar a caderneta.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Vaccine Calendar */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-dark mb-3 px-1">
          Calendario Vacinal
        </h2>
        <div className="space-y-4">
          {calendarStatus.map((group) => (
            <div key={group.age} className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-dark uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                {group.age}
              </h3>
              <div className="space-y-2.5">
                {group.vaccines.map((vaccine, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3"
                  >
                    {vaccine.status === "taken" ? (
                      <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        ✓
                      </span>
                    ) : vaccine.status === "overdue" ? (
                      <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        !
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs flex-shrink-0">
                        ○
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          vaccine.status === "taken"
                            ? "text-dark"
                            : vaccine.status === "overdue"
                            ? "text-red-700 font-medium"
                            : "text-gray-400"
                        }`}
                      >
                        {vaccine.name}
                      </p>
                    </div>
                    {vaccine.status === "taken" && vaccine.date && (
                      <span className="text-[10px] text-green-600 font-medium flex-shrink-0">
                        {formatDate(vaccine.date)}
                      </span>
                    )}
                    {vaccine.status === "overdue" && (
                      <span className="text-[10px] text-red-500 font-medium flex-shrink-0">
                        Atrasada
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Add button */}
      {!isReadonly && (
        <Link
          href="/saude/vacinas/nova"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 px-5 py-3 bg-accent text-white text-sm font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Registrar Vacina
        </Link>
      )}
    </div>
  );
}
