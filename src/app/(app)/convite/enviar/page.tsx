import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createInvitation } from "@/actions/invitation";
import { deleteInvitation } from "@/actions/members";
import Link from "next/link";
import InviteShareCard from "../../onboarding/convite/InviteShareCard";

export default async function SendInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(name)")
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
  const groupName = (memberships[0].coparenting_groups as any)?.name || "Grupo";
  const firstName = user.user_metadata?.full_name?.split(" ")[0] || "voce";

  // Fetch all invitations (pending, accepted, expired, revoked)
  const { data: allInvites } = await supabase
    .from("invitations")
    .select("id, email, role, token, created_at, expires_at, status")
    .eq("group_id", groupId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });

  const inviteToken = params.token;
  const inviteSuccess = params.success === "true";
  const inviteDeleted = params.success === "deleted";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://2lares.vercel.app";
  const inviteLink = inviteToken ? `${appUrl}/convite/${inviteToken}` : null;

  const roleLabels: Record<string, string> = {
    parent: "Pai/Mae",
    grandparent: "Avo/Avo",
    caregiver: "Cuidador(a)",
    mediator: "Mediador(a)",
    lawyer: "Advogado(a)",
    admin: "Administrador",
    member: "Membro",
    readonly: "Somente leitura",
  };

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">Convidar Membro</h1>
      </div>

      {inviteDeleted && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm text-center">
          Convite excluido com sucesso. Voce pode reenviar para o mesmo e-mail.
        </div>
      )}

      {/* Show share card if invite was just created */}
      {inviteSuccess && inviteLink ? (
        <div className="space-y-4">
          <InviteShareCard inviteLink={inviteLink} groupName={groupName} firstName={firstName} />
          <div className="text-center">
            <Link href="/convite/enviar" className="text-sm text-primary font-medium hover:underline">
              Enviar outro convite
            </Link>
          </div>
        </div>
      ) : (
        <>
          {params.error && (
            <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm text-center">
              {decodeURIComponent(params.error)}
            </div>
          )}

          <form action={createInvitation} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="returnTo" value="/convite/enviar" />

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
              Gerar link de convite
            </button>
          </form>
        </>
      )}

      {/* Show invitations list */}
      {allInvites && allInvites.length > 0 && !inviteSuccess && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-dark mb-3 px-1">Convites enviados</h3>
          <div className="space-y-2">
            {allInvites.map((inv) => {
              const expires = new Date(inv.expires_at);
              const isExpired = inv.status === "pending" && expires < new Date();
              const isAccepted = inv.status === "accepted";
              const isPending = inv.status === "pending" && !isExpired;

              return (
                <div key={inv.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-dark text-sm truncate">{inv.email}</p>
                        {isAccepted && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            Aceito
                          </span>
                        )}
                        {isPending && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Pendente
                          </span>
                        )}
                        {isExpired && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                            Expirado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {roleLabels[inv.role] || inv.role}
                        {isPending && (
                          <span> — Expira em {Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} dias</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isPending && (
                        <Link
                          href={`/convite/enviar?success=true&token=${inv.token}`}
                          className="text-xs text-primary font-medium px-3 py-1 bg-primary/5 rounded-lg hover:bg-primary/10"
                        >
                          Compartilhar
                        </Link>
                      )}
                      {!isAccepted && (
                        <form action={deleteInvitation}>
                          <input type="hidden" name="invitationId" value={inv.id} />
                          <input type="hidden" name="returnTo" value="/convite/enviar" />
                          <button
                            type="submit"
                            className="text-xs text-red-500 font-medium px-3 py-1 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                            title="Excluir convite"
                          >
                            Excluir
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
