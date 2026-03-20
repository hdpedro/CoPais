import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import NewEventForm from "./NewEventForm";

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  if (memberships[0].role === "readonly") redirect("/dashboard");
  const groupId = memberships[0].group_id;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, profiles(full_name)")
    .eq("group_id", groupId);

  const membersList = (members || []).map((m) => ({
    user_id: m.user_id,
    full_name: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.full_name || "Usuario",
  }));

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/calendario" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">Novo Evento</h1>
      </div>

      <NewEventForm
        groupId={groupId}
        children={children || []}
        members={membersList}
      />
    </div>
  );
}
