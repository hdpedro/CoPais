import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createInvitation } from "@/actions/invitation";
import Link from "next/link";
import InviteShareCard from "./InviteShareCard";

export default async function OnboardingConvitePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get user's group (just created in step 1)
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(id, name)")
    .eq("user_id", user.id)
    .eq("role", "admin");

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const group = memberships[0].coparenting_groups as any;
  const groupId = group?.id;
  const groupName = group?.name;
  const firstName = user.user_metadata?.full_name?.split(" ")[0] || "voce";

  // Check if invite was already created
  const inviteToken = params.token;
  const inviteSuccess = params.success === "true";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://2lares.vercel.app";
  const inviteLink = inviteToken ? `${appUrl}/convite/${inviteToken}` : null;

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">1</div>
        <div className="w-12 h-0.5 bg-primary" />
        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">2</div>
      </div>

      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-dark">Grupo criado!</h1>
        <p className="text-muted mt-2">
          <span className="font-semibold text-dark">{groupName}</span> esta pronto.
          Agora convide o outro responsavel para completar a familia.
        </p>
      </div>

      {/* If invite already sent, show share card */}
      {inviteSuccess && inviteLink ? (
        <InviteShareCard inviteLink={inviteLink} groupName={groupName} firstName={firstName} />
      ) : (
        <>
          {/* Invite form */}
          <form action={createInvitation} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="returnTo" value="/onboarding/convite" />

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-secondary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-dark">Convidar pai/mae</h3>
                <p className="text-xs text-muted">Envie um link seguro para o outro responsavel se cadastrar</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">E-mail do outro responsavel</label>
              <input
                type="email"
                name="email"
                required
                placeholder="email@exemplo.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Papel</label>
              <select
                name="role"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="parent">Pai/Mae</option>
                <option value="grandparent">Avo/Avo</option>
                <option value="caregiver">Cuidador(a)</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors"
            >
              Gerar link de convite
            </button>
          </form>

          {params.error && (
            <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mt-4 text-sm text-center">
              {decodeURIComponent(params.error)}
            </div>
          )}
        </>
      )}

      {/* Skip button */}
      <div className="text-center mt-6">
        <Link
          href="/dashboard"
          className="text-sm text-muted hover:text-dark transition-colors"
        >
          {inviteSuccess ? "Ir para o dashboard" : "Pular por agora, farei depois"}
        </Link>
      </div>
    </div>
  );
}
