import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import dynamic from "next/dynamic";
import NovoHeader from "./NovoHeader";

const NewCompromissoForm = dynamic(() => import("./NewCompromissoForm"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

export default async function NovoCompromissoPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  const params = await searchParams;
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date! : null;

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
      <NovoHeader />

      <NewCompromissoForm
        groupId={groupId}
        // eslint-disable-next-line react/no-children-prop -- "children" e o nome literal da lista de filhos da familia, nao slot React
        children={children || []}
        members={membersList}
        initialDate={initialDate}
      />
    </div>
  );
}
