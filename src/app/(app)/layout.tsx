import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/actions/auth";
import Link from "next/link";

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
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[#E8734A] rounded-full border-2 border-[#FFF9F5]" />
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
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-2 py-2 flex justify-around md:hidden safe-area-bottom">
        <NavItem href="/dashboard" label="Inicio" active>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3l9-8z" />
          </svg>
        </NavItem>
        <NavItem href="/calendario" label="Agenda">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <rect x="7" y="14" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
          </svg>
        </NavItem>
        <NavItem href="/chat" label="Chat">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            <circle cx="8.5" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="12" r="1" fill="currentColor" stroke="none" />
          </svg>
        </NavItem>
        <NavItem href="/familia" label="Familia">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="9" cy="7" r="3" />
            <circle cx="17" cy="7" r="2.5" />
            <path d="M2 21v-1a5 5 0 0110 0v1" />
            <path d="M14 21v-1a4 4 0 016 0v1" />
          </svg>
        </NavItem>
        <NavItem href="/mais" label="Mais">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </NavItem>
      </nav>

      {/* Hidden sign-out form for profile page */}
      <form id="signout-form" action={signOut} className="hidden">
        <button type="submit" />
      </form>
    </div>
  );
}

function NavItem({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center transition-colors ${
        active ? "text-[#E8734A]" : "text-[#7A8C8B] hover:text-[#1A3B3A]"
      }`}
    >
      {children}
      <span className={`text-[10px] font-medium ${active ? "text-[#E8734A]" : ""}`}>{label}</span>
      {active && <span className="w-1 h-1 rounded-full bg-[#E8734A] -mt-0.5" />}
    </a>
  );
}
