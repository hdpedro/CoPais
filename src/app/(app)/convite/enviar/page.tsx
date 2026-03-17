import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createInvitation } from "@/actions/invitation";
import Link from "next/link";

export default async function SendInvitePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id)
    .eq("role", "admin");

  if (!memberships || memberships.length === 0) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <p className="text-muted">Apenas administradores podem enviar convites.</p>
        <Link href="/dashboard" className="text-primary font-medium mt-2 inline-block">Voltar</Link>
      </div>
    );
  }

  const groupId = memberships[0].group_id;

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/perfil" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">Enviar Convite</h1>
      </div>

      <form action={createInvitation} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        <div>
          <label className="block text-sm font-medium text-dark mb-1">E-mail do convidado</label>
          <input type="email" name="email" required placeholder="email@exemplo.com"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Papel</label>
          <select name="role"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary">
            <option value="parent">Pai/Mae</option>
            <option value="grandparent">Avo/Avo</option>
            <option value="caregiver">Cuidador(a)</option>
            <option value="mediator">Mediador(a)</option>
            <option value="lawyer">Advogado(a)</option>
          </select>
        </div>

        <button type="submit"
          className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Enviar Convite
        </button>

        <p className="text-xs text-muted text-center">
          O convidado recebera um link para se juntar ao grupo. O convite expira em 7 dias.
        </p>
      </form>
    </div>
  );
}
