import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAgreement, acceptAgreement } from "@/actions/agreements";

export default async function AcordosPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;
  const isReadonly = memberships[0].role === "readonly";

  const { data: agreements } = await supabase
    .from("agreements")
    .select("*, profiles!agreements_created_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("is_non_negotiable", { ascending: false })
    .order("created_at", { ascending: false });

  const categoryLabels: Record<string, string> = {
    principle: "Principio",
    value: "Valor",
    rule: "Regra",
    boundary: "Limite",
    routine: "Rotina",
    education: "Educacao",
    health: "Saude",
    safety: "Seguranca",
    communication: "Comunicacao",
    financial: "Financeiro",
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-dark">Acordos</h1>
        <p className="text-sm text-muted mt-1">
          Principios, valores e regras compartilhadas para o bem-estar das criancas.
        </p>
      </div>

      {/* Reminder Card */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-sm text-dark font-medium">Lembrete importante</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          O bem-estar da crianca e prioridade. Os responsaveis sao os adultos da relacao.
          Uma boa coparentalidade exige dialogo e respeito mutuo.
        </p>
      </div>

      {/* New Agreement Form */}
      {!isReadonly && (
        <form action={createAgreement} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-dark">Novo acordo</h3>
          <input type="hidden" name="groupId" value={groupId} />

          <input type="text" name="title" required placeholder="Titulo do acordo"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

          <textarea name="description" required rows={3} placeholder="Descreva o acordo, principio ou valor..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

          <div className="flex gap-3 items-center">
            <select name="category" required
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="principle">Principio</option>
              <option value="value">Valor</option>
              <option value="rule">Regra</option>
              <option value="boundary">Limite</option>
              <option value="routine">Rotina</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-dark">
              <input type="checkbox" name="isNonNegotiable" className="rounded border-gray-300 text-primary focus:ring-primary" />
              Inegociavel
            </label>
          </div>

          <button type="submit"
            className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
            Adicionar Acordo
          </button>
        </form>
      )}

      {/* Agreements List */}
      {agreements && agreements.length > 0 ? (
        <div className="space-y-3">
          {agreements.map((agreement) => (
            <div key={agreement.id} className={`bg-white rounded-xl p-4 shadow-sm ${agreement.is_non_negotiable ? "border-l-4 border-secondary" : ""}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-dark">{agreement.title}</h3>
                    {agreement.is_non_negotiable && (
                      <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-medium">
                        Inegociavel
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {categoryLabels[agreement.category] || agreement.category} - por {(agreement.profiles as any)?.full_name}
                  </span>
                </div>
                {agreement.accepted_by ? (
                  <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full">Aceito</span>
                ) : !isReadonly && agreement.created_by !== user.id ? (
                  <form action={acceptAgreement}>
                    <input type="hidden" name="agreementId" value={agreement.id} />
                    <button type="submit" className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full hover:bg-primary/20 transition-colors font-medium">
                      Aceitar
                    </button>
                  </form>
                ) : (
                  <span className="text-xs bg-accent/10 text-accent px-2 py-1 rounded-full">Pendente</span>
                )}
              </div>
              <p className="text-sm text-muted">{agreement.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">Nenhum acordo registrado ainda.</p>
          <p className="text-sm text-muted mt-1">Comece adicionando principios e valores importantes.</p>
        </div>
      )}
    </div>
  );
}
