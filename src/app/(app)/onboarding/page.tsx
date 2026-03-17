import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createGroup } from "@/actions/group";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check if user already has a group
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (memberships && memberships.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-dark">Bem-vindo ao CoPais!</h1>
        <p className="text-muted mt-2">Vamos configurar seu grupo familiar para comecar.</p>
      </div>

      <form action={createGroup} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Nome da familia</label>
          <input
            type="text"
            name="name"
            required
            placeholder="Ex: Familia Silva"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <hr className="my-4" />
        <h3 className="text-lg font-semibold text-dark">Adicionar primeira crianca</h3>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Nome completo da crianca</label>
          <input
            type="text"
            name="childName"
            required
            placeholder="Nome da crianca"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Data de nascimento</label>
          <input
            type="date"
            name="childBirthDate"
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors"
        >
          Criar grupo e continuar
        </button>
      </form>
    </div>
  );
}
