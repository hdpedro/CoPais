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

  // Accept the invitation - this always redirects
  await acceptInvitation(token);
}
