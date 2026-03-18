import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/actions/auth";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const initial = profile?.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U";

  return (
    <div className="min-h-screen bg-[#FFF9F5]">
      {/* Top Bar */}
      <header className="px-5 pt-4 pb-2 flex items-center justify-between">
        <Link href="/dashboard" className="text-2xl font-bold text-[#1A3B3A]">2Lares</Link>
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <Link href="/eventos" className="relative p-2">
            <svg className="w-6 h-6 text-[#1A3B3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </Link>
          {/* Avatar */}
          <Link href="/perfil" className="w-10 h-10 rounded-full bg-[#E8734A] flex items-center justify-center text-white font-bold text-sm shadow-sm">
            {initial}
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-5 py-4 pb-24">{children}</main>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Hidden sign-out form for profile page */}
      <form id="signout-form" action={signOut} className="hidden">
        <button type="submit" />
      </form>
    </div>
  );
}
