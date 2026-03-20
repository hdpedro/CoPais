import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PARENT_COLORS } from "@/lib/constants";
import MemberActions from "./MemberActions";
import LeaveGroupButton from "./LeaveGroupButton";

export default async function FamiliaPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  // Get user's group
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(id, name, created_by)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");

  const group = memberships[0].coparenting_groups as any;
  const groupId = group?.id;
  const groupName = group?.name;
  const isAdmin = memberships[0].role === "admin";

  // Get all members with profiles
  const { data: members } = await supabase
    .from("group_members")
    .select("*, profiles(id, full_name, email)")
    .eq("group_id", groupId)
    .order("joined_at");

  // Get children
  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", groupId);

  // Get pending invitations
  const { data: pendingInvites } = await supabase
    .from("invitations")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Get accepted invitations (history)
  const { data: acceptedInvites } = await supabase
    .from("invitations")
    .select("*, profiles!invitations_accepted_by_fkey(full_name)")
    .eq("group_id", groupId)
    .in("status", ["accepted", "revoked"])
    .order("created_at", { ascending: false })
    .limit(10);

  // Check if current user is the only admin (needed for leave group logic)
  const adminCount = members?.filter((m) => m.role === "admin").length || 0;
  const isOnlyAdmin = isAdmin && adminCount <= 1;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://2lares.vercel.app";

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    member: "Membro",
    readonly: "Somente leitura",
  };

  const roleDescriptions: Record<string, string> = {
    admin: "Acesso total: pode editar tudo e gerenciar membros",
    member: "Acesso completo: calendario, despesas, chat, saude",
    readonly: "Apenas visualizacao: ve o calendario e informacoes",
  };

  const roleColors: Record<string, string> = {
    admin: "bg-primary/10 text-primary",
    member: "bg-accent/10 text-accent",
    readonly: "bg-muted/10 text-muted",
  };

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{groupName}</h1>
          <p className="text-sm text-muted">Gerenciar familia</p>
        </div>
      </div>

      {/* Alerts */}
      {params.success && (
        <div className="bg-success/10 border border-success/20 text-success rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(params.success)}
        </div>
      )}
      {params.error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(params.error)}
        </div>
      )}

      {/* Members Section */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Membros ({members?.length || 0})
        </h2>

        <div className="space-y-3">
          {members?.map((member, index) => {
            const profile = member.profiles as any;
            const isMe = member.user_id === user.id;
            const isOwner = member.user_id === group?.created_by;
            const color = index === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary;
            const joinDate = new Date(member.joined_at);

            return (
              <div key={member.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {profile?.full_name?.[0] || "?"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-dark text-sm truncate">
                        {profile?.full_name || "Sem nome"}
                      </p>
                      {isMe && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-medium">voce</span>
                      )}
                      {isOwner && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded-full font-medium">criador</span>
                      )}
                    </div>
                    <p className="text-xs text-muted truncate">{profile?.email}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleColors[member.role] || "bg-gray-100 text-gray-600"}`}>
                        {roleLabels[member.role] || member.role}
                      </span>
                      <span className="text-[10px] text-muted">
                        Desde {joinDate.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                      </span>
                    </div>
                  </div>

                  {/* Actions (only admin can manage, not self) */}
                  {isAdmin && !isMe && (
                    <MemberActions
                      memberId={member.user_id}
                      groupId={groupId}
                      currentRole={member.role}
                      memberName={profile?.full_name?.split(" ")[0] || "Membro"}
                    />
                  )}
                </div>

                {/* Role description */}
                <p className="text-[11px] text-muted mt-2 pl-14">
                  {roleDescriptions[member.role]}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Children Section */}
      {children && children.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
            <span className="text-sm">👶</span>
            Criancas ({children.length})
          </h2>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="space-y-2">
              {children.map((child) => {
                const age = Math.floor(
                  (Date.now() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
                );
                return (
                  <div key={child.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">👶</span>
                      <div>
                        <p className="text-sm font-medium text-dark">{child.full_name}</p>
                        <p className="text-[11px] text-muted">{age} {age === 1 ? "ano" : "anos"}</p>
                      </div>
                    </div>
                    <Link href={`/criancas/${child.id}`} className="text-xs text-primary font-medium">
                      Ver
                    </Link>
                  </div>
                );
              })}
            </div>
            <Link
              href="/criancas/nova"
              className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 text-sm text-primary font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Adicionar crianca
            </Link>
          </div>
        </section>
      )}

      {/* Pending Invitations */}
      {pendingInvites && pendingInvites.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Convites pendentes ({pendingInvites.length})
          </h2>
          <div className="space-y-2">
            {pendingInvites.map((invite) => {
              const expires = new Date(invite.expires_at);
              const isExpired = expires < new Date();
              const daysLeft = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const inviteLink = `${appUrl}/convite/${invite.token}`;

              return (
                <div key={invite.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-dark">{invite.email}</p>
                      <p className="text-[11px] text-muted">
                        {invite.role === "parent" ? "Pai/Mae" : invite.role}
                        {" — "}
                        {isExpired ? (
                          <span className="text-error">Expirado</span>
                        ) : (
                          <span>Expira em {daysLeft} {daysLeft === 1 ? "dia" : "dias"}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!isExpired && (
                      <Link
                        href={`/convite/enviar?success=true&token=${invite.token}`}
                        className="text-xs text-primary font-medium px-3 py-1.5 bg-primary/5 rounded-lg hover:bg-primary/10"
                      >
                        Compartilhar
                      </Link>
                    )}
                    {isAdmin && (
                      <form action={async (formData: FormData) => {
                        "use server";
                        const { createClient } = await import("@/lib/supabase/server");
                        const supabase = await createClient();
                        await supabase.from("invitations").update({ status: "revoked" }).eq("id", invite.id);
                        const { revalidatePath } = await import("next/cache");
                        revalidatePath("/familia");
                        const { redirect } = await import("next/navigation");
                        redirect("/familia?success=" + encodeURIComponent("Convite cancelado"));
                      }}>
                        <button
                          type="submit"
                          className="text-xs text-error font-medium px-3 py-1.5 bg-error/5 rounded-lg hover:bg-error/10"
                        >
                          Cancelar
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* History */}
      {acceptedInvites && acceptedInvites.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Historico
          </h2>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="space-y-3">
              {acceptedInvites.map((invite) => {
                const date = new Date(invite.accepted_at || invite.created_at);
                const acceptedName = (invite.profiles as any)?.full_name?.split(" ")[0];
                return (
                  <div key={invite.id} className="flex items-start gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      invite.status === "accepted" ? "bg-success" : "bg-error"
                    }`} />
                    <div>
                      <p className="text-dark">
                        {invite.status === "accepted" ? (
                          <><span className="font-medium">{acceptedName || invite.email}</span> entrou no grupo</>
                        ) : (
                          <>Convite para <span className="font-medium">{invite.email}</span> foi cancelado</>
                        )}
                      </p>
                      <p className="text-muted">
                        {date.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Invite button */}
      {isAdmin && (
        <Link
          href="/convite/enviar"
          className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors mb-3"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Convidar novo membro
        </Link>
      )}

      {/* Leave group button */}
      <LeaveGroupButton groupId={groupId} isOnlyAdmin={isOnlyAdmin} />
    </div>
  );
}
