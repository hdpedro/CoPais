import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import dynamic from "next/dynamic";

const InviteParserClient = dynamic(() => import("./InviteParserClient"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

export default async function ConvitePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  return (
    <div className="max-w-lg mx-auto pb-20">
      <InviteParserClient
        groupId={groupId}
        childrenList={children || []}
      />
    </div>
  );
}
