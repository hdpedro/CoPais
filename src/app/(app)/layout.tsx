import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/actions/auth";
import ResponsiveShell from "@/components/ResponsiveShell";
import PushNotificationManager from "@/components/PushNotificationManager";
import PostHogProvider from "@/components/PostHogProvider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const user = session.user;

  // Profile query runs in parallel with page rendering via Suspense
  const profilePromise = supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { data: profile } = await profilePromise;

  const initial = profile?.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U";
  const fullName = profile?.full_name || user.email || "Usuario";

  return (
    <Suspense fallback={null}>
      <PostHogProvider userId={user.id} userEmail={user.email}>
        <div className="min-h-screen bg-[#FFF9F5]">
          <ResponsiveShell initial={initial} fullName={fullName}>
            {children}
          </ResponsiveShell>

          <PushNotificationManager />

          {/* Hidden sign-out form for profile page */}
          <form id="signout-form" action={signOut} className="hidden">
            <button type="submit" />
          </form>
        </div>
      </PostHogProvider>
    </Suspense>
  );
}
