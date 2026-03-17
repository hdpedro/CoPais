import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ChildrenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  const { data: children } = await supabase
    .from("children")
    .select("*")
    .eq("group_id", groupId)
    .order("full_name");

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark">Criancas</h1>
        <Link
          href="/criancas/nova"
          className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
        >
          + Adicionar
        </Link>
      </div>

      {children && children.length > 0 ? (
        <div className="space-y-3">
          {children.map((child) => {
            const age = Math.floor(
              (Date.now() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
            );
            return (
              <Link key={child.id} href={`/criancas/${child.id}`} className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-accent/20 rounded-full flex items-center justify-center">
                    <span className="text-xl">👶</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-dark">{child.full_name}</h3>
                    <p className="text-sm text-muted">{age} {age === 1 ? "ano" : "anos"} - Nascimento: {new Date(child.birth_date).toLocaleDateString("pt-BR")}</p>
                    {child.allergies && child.allergies.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {child.allergies.map((a: string, i: number) => (
                          <span key={i} className="text-xs bg-error/10 text-error px-2 py-0.5 rounded-full">{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">Nenhuma crianca cadastrada ainda.</p>
          <Link href="/criancas/nova" className="text-primary font-medium mt-2 inline-block">Adicionar crianca</Link>
        </div>
      )}
    </div>
  );
}
