import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { autoAcceptPendingInvitations } from "@/actions/invitation";
import OnboardingForm from "./OnboardingForm";

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

  // Auto-accept pending invitations for this user's email
  // This handles the case where the invite token was lost during signup flow
  const accepted = await autoAcceptPendingInvitations();
  if (accepted) {
    redirect("/dashboard");
  }

  // The wizard now renders its own contextual header per step (welcome,
  // child form, family summary) — `OnboardingHeader` is no longer used.
  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <OnboardingForm />
    </div>
  );
}
