import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeleteAccountClient from "./DeleteAccountClient";

/**
 * Apple Guideline 5.1.1(v) requires an in-app account deletion flow for
 * any app that supports account creation. The native iOS app already has
 * `kindar-native/app/perfil/deletar-conta.tsx`; this page mirrors it on
 * the PWA so review can point at either platform safely.
 *
 * Backend: POST /api/auth/delete-account (with body `{ confirmation: "DELETAR" }`).
 */
export default async function DeleteAccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", user.id)
    .single();

  // Detect any active Apple/Google IAP subscription so we can surface the
  // store-side cancellation reminder (server cannot cancel App Store IAP).
  const { data: nativeSub } = await supabase
    .from("subscriptions")
    .select("payment_provider")
    .eq("user_id", user.id)
    .in("payment_provider", ["apple", "google"])
    .in("status", ["active", "trialing", "past_due"])
    .maybeSingle();

  return (
    <DeleteAccountClient
      email={profile?.email ?? user.email ?? ""}
      fullName={profile?.full_name ?? null}
      hasNativeSubscription={!!nativeSub}
    />
  );
}
