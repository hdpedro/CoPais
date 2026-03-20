import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/actions/auth";
import Link from "next/link";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(name)")
    .eq("user_id", user.id);

  const roleLabels: Record<string, string> = {
    parent: "Pai/Mae",
    grandparent: "Avo/Avo",
    caregiver: "Cuidador(a)",
    mediator: "Mediador(a)",
    lawyer: "Advogado(a)",
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-dark">Meu Perfil</h1>

      {/* Profile Card */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">
              {profile?.full_name?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-dark">{profile?.full_name}</h2>
            <p className="text-sm text-muted">{user.email}</p>
            <p className="text-xs text-primary mt-1">{roleLabels[profile?.role || "parent"]}</p>
          </div>
        </div>

        {profile?.phone && (
          <div className="py-2 border-t border-gray-100">
            <p className="text-xs text-muted">Telefone</p>
            <p className="text-sm text-dark">{profile.phone}</p>
          </div>
        )}

        <div className="py-2 border-t border-gray-100">
          <p className="text-xs text-muted">Membro desde</p>
          <p className="text-sm text-dark">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString("pt-BR") : "—"}</p>
        </div>
      </div>

      {/* Groups */}
      {memberships && memberships.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-dark mb-3">Meus Grupos</h3>
          <div className="space-y-2">
            {memberships.map((m) => (
              <div key={m.group_id} className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-medium text-dark">{(m.coparenting_groups as any)?.name}</p>
                  <p className="text-xs text-muted capitalize">{m.role}</p>
                </div>
                {m.role === "admin" && (
                  <Link href="/convite/enviar" className="text-xs text-primary font-medium">
                    Convidar
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="space-y-2">
        <Link href="/criancas" className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-dark">Gerenciar Criancas</span>
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
        <Link href="/documentos" className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-dark">Documentos</span>
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>

      {/* Sign Out */}
      <form action={signOut}>
        <button type="submit"
          className="w-full py-3 bg-error/10 text-error font-semibold rounded-lg hover:bg-error/20 transition-colors">
          Sair da conta
        </button>
      </form>
    </div>
  );
}
