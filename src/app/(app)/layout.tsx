import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/actions/auth";
import { getActiveGroup } from "@/lib/group-utils";
import ResponsiveShell from "@/components/ResponsiveShell";
import PushNotificationManager from "@/components/PushNotificationManager";
import PostHogProvider from "@/components/PostHogProvider";
import { I18nProvider } from "@/i18n/provider";
import { getRequestLocale } from "@/i18n/server";
import { SubscriptionProvider } from "@/components/SubscriptionProvider";
import { getUserSubscription } from "@/lib/subscription";
import { getCachedProfileByUser } from "@/lib/cached-queries";
import { getDisplayName } from "@/lib/constants";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Use getSession() instead of getUser() — reads from cookie (no network call)
  // The middleware already validated the user with getUser() on every request
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) {
    redirect("/login");
  }

  // Profile (CACHED) + subscription in parallel
  const [profile, subscription] = await Promise.all([
    getCachedProfileByUser(user.id),
    getUserSubscription(supabase, user.id),
  ]);

  // Banco é fonte única de verdade — `profile.display_name` é coluna gerada
  // (migration 00081) que já normaliza full_name → INITCAP do prefixo do email
  // → vazio. `getDisplayName` faz a defesa final: vazio → "Usuário", e
  // sanitiza inputs problemáticos (ex: full_name que veio com "@"). Caller
  // NUNCA expõe user.id nem email cru.
  const profileRow = profile as ({ display_name?: string | null; full_name?: string | null } | null);
  const fullName = getDisplayName(profileRow?.display_name || profileRow?.full_name);
  const initial = fullName[0]?.toUpperCase() || "U";

  // Resolve locale once on the server (cookie + Accept-Language fallback)
  // and pass to the client provider. This eliminates the brief pt-BR flash
  // that happened when the provider initialized only client-side.
  const locale = await getRequestLocale();

  // Fetch group memberships for multi-group support
  const activeGroup = await getActiveGroup(supabase, user.id);
  const groups = activeGroup
    ? activeGroup.memberships.map((m) => ({
        id: m.coparenting_groups.id,
        name: m.coparenting_groups.name,
      }))
    : [];
  const activeGroupId = activeGroup?.groupId || "";

  return (
    <Suspense fallback={null}>
      <I18nProvider initialLocale={locale}>
        <PostHogProvider userId={user.id} userEmail={user.email}>
          <SubscriptionProvider subscription={subscription}>
          <div className="min-h-screen bg-[#EEECEA]">
            <ResponsiveShell initial={initial} fullName={fullName} groups={groups} activeGroupId={activeGroupId} userId={user.id}>
              {children}
            </ResponsiveShell>

            <PushNotificationManager />

            {/* Hidden sign-out form for profile page */}
            <form id="signout-form" action={signOut} className="hidden">
              <button type="submit" />
            </form>
          </div>
          </SubscriptionProvider>
        </PostHogProvider>
      </I18nProvider>
    </Suspense>
  );
}
