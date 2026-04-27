import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAppAdmin } from "@/lib/admin";

/**
 * Admin route group — everything under /admin/* requires the user's
 * email to be in ADMIN_EMAILS (env). Non-admins get redirected to
 * dashboard without leaking that the route exists.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!isAppAdmin({ id: user.id, email: user.email ?? null })) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-6">
          <Link href="/admin" className="font-bold text-stone-900">
            Kindar Admin
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin/metrics" className="text-stone-600 hover:text-stone-900">
              Métricas
            </Link>
            <Link href="/admin/coupons" className="text-stone-600 hover:text-stone-900">
              Cupons
            </Link>
          </nav>
          <span className="ml-auto text-xs text-stone-500">{user.email}</span>
          <Link href="/dashboard" className="text-xs text-stone-500 hover:text-stone-900">
            ← App
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-6">{children}</main>
    </div>
  );
}
