import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addChild } from "@/actions/group";

export default async function NewChildPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  return (
    <div className="max-w-lg mx-auto pb-20">
      <h1 className="text-2xl font-bold text-dark mb-6">Adicionar Crianca</h1>

      <form action={addChild} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Nome completo</label>
          <input type="text" name="fullName" required placeholder="Nome da crianca"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Data de nascimento</label>
          <input type="date" name="birthDate" required
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Alergias (separadas por virgula)</label>
          <input type="text" name="allergies" placeholder="Ex: Leite, Amendoim"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Observacoes</label>
          <textarea name="notes" rows={3} placeholder="Informacoes adicionais..."
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <button type="submit"
          className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Salvar
        </button>
      </form>
    </div>
  );
}
