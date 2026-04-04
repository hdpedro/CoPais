import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/actions/auth";
import { getActiveGroup } from "@/lib/group-utils";
import ResponsiveShell from "@/components/ResponsiveShell";
import PushNotificationManager from "@/components/PushNotificationManager";
import PostHogProvider from "@/components/PostHogProvider";
import { I18nProvider } from "@/i18n/provider";
import { SubscriptionProvider } from "@/components/SubscriptionProvider";
import { getUserSubscription } from "@/lib/subscription";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Profile + subscription queries run in parallel
  const [{ data: profile }, subscription] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    getUserSubscription(supabase, user.id),
  ]);

  const initial = profile?.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U";
  const fullName = profile?.full_name || user.email || "User";

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
      <I18nProvider>
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
