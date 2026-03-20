import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ALLERGY_TYPES, ALLERGY_SEVERITIES } from "@/lib/health-constants";

export default async function AlergiasPage({
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
          <h1 className="text-2xl font-bold text-dark">Alergias & Info Medica</h1>
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

  // Fetch data in parallel
  const [
    { data: allergies },
    { data: medicalInfo },
    { data: professionals },
  ] = await Promise.all([
    supabase
      .from("child_allergies")
      .select("id, name, allergy_type, severity, reaction")
      .eq("child_id", selectedChildId)
      .order("severity"),
    supabase
      .from("child_medical_info")
      .select("*, medical_professionals(id, name, specialty, crm, phone, whatsapp, address)")
      .eq("child_id", selectedChildId)
      .single(),
    supabase
      .from("medical_professionals")
      .select("id, name, specialty, crm, phone, whatsapp, address")
      .eq("group_id", groupId)
      .order("name"),
  ]);

  const info = medicalInfo || null;
  const pediatrician = (info?.medical_professionals as any) || null;

  const severityConfig: Record<string, { bg: string; text: string; label: string }> = {
    severe: { bg: "bg-red-100", text: "text-red-700", label: "Grave" },
    moderate: { bg: "bg-amber-100", text: "text-amber-700", label: "Moderada" },
    mild: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Leve" },
  };

  function getAllergyIcon(type: string) {
    const found = ALLERGY_TYPES.find((t) => t.value === type);
    return found?.icon || "📝";
  }

  function getAllergyTypeLabel(type: string) {
    const found = ALLERGY_TYPES.find((t) => t.value === type);
    return found?.label || type;
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
          <h1 className="text-2xl font-bold text-dark">Alergias & Info Medica</h1>
          <p className="text-sm text-muted">Informacoes medicas importantes</p>
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
                href={`/saude/alergias?crianca=${child.id}`}
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

      {/* Alergias Section */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-semibold text-dark">Alergias</h2>
          {!isReadonly && (
            <Link
              href="/saude/alergias/nova"
              className="text-xs font-semibold text-primary hover:text-primary/80"
            >
              + Adicionar
            </Link>
          )}
        </div>

        {allergies && allergies.length > 0 ? (
          <div
            className={`bg-white rounded-xl p-4 shadow-sm space-y-3 ${
              allergies.length > 0 ? "border-l-4 border-red-400" : ""
            }`}
          >
            {allergies.map((allergy) => {
              const sev = severityConfig[allergy.severity] || severityConfig.mild;
              return (
                <div key={allergy.id} className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">
                    {getAllergyIcon(allergy.allergy_type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-dark">
                        {allergy.name}
                      </h3>
                      <span
                        className={`${sev.bg} ${sev.text} text-[10px] font-semibold px-2 py-0.5 rounded-full`}
                      >
                        {sev.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {getAllergyTypeLabel(allergy.allergy_type)}
                    </p>
                    {allergy.reaction && (
                      <p className="text-xs text-red-600 mt-1">
                        Reacao: {allergy.reaction}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-muted text-sm">Nenhuma alergia registrada.</p>
          </div>
        )}
      </section>

      {/* Info Medica Section */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-semibold text-dark">Info Medica</h2>
          {!isReadonly && (
            <Link
              href="/saude/alergias/editar-info"
              className="text-xs font-semibold text-primary hover:text-primary/80"
            >
              Editar
            </Link>
          )}
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">
                Tipo Sanguineo
              </p>
              <p className="text-sm font-semibold text-dark mt-0.5">
                {info?.blood_type || "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">
                Convenio
              </p>
              <p className="text-sm font-semibold text-dark mt-0.5">
                {info?.insurance_name || "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">
                No Carteirinha
              </p>
              <p className="text-sm font-semibold text-dark mt-0.5">
                {info?.insurance_number || "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">
                No SUS
              </p>
              <p className="text-sm font-semibold text-dark mt-0.5">
                {info?.sus_number || "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pediatra Principal */}
      {pediatrician && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1">
            Pediatra Principal
          </h2>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">👨‍⚕️</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-dark">
                  Dr(a). {pediatrician.name}
                </h3>
                {pediatrician.specialty && (
                  <p className="text-xs text-muted">{pediatrician.specialty}</p>
                )}
                {pediatrician.crm && (
                  <p className="text-xs text-muted">CRM: {pediatrician.crm}</p>
                )}

                <div className="mt-3 space-y-2">
                  {pediatrician.phone && (
                    <div className="flex items-center gap-2 text-xs text-dark">
                      <svg
                        className="w-3.5 h-3.5 text-muted"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                      {pediatrician.phone}
                    </div>
                  )}

                  {pediatrician.whatsapp && (
                    <a
                      href={`https://wa.me/${pediatrician.whatsapp.replace(/\D/g, "").replace(/^(\d{10,11})$/, "55$1")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs text-green-600 font-medium hover:text-green-700"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      WhatsApp
                    </a>
                  )}

                  {pediatrician.address && (
                    <div className="flex items-start gap-2 text-xs text-dark">
                      <svg
                        className="w-3.5 h-3.5 text-muted mt-0.5 flex-shrink-0"
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
                      <span>{pediatrician.address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
