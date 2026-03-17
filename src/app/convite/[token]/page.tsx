import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { acceptInvitation } from "@/actions/invitation";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not logged in, redirect to signup with return URL
  if (!user) {
    redirect(`/signup?convite=${token}`);
  }

  // Try to accept the invitation
  const result = await acceptInvitation(token);

  if (result?.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-dark mb-2">Erro no Convite</h1>
          <p className="text-muted">{result.error}</p>
        </div>
      </div>
    );
  }

  // acceptInvitation redirects on success, so this shouldn't render
  return null;
}
