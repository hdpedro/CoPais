import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import dynamic from "next/dynamic";

const VaccineParserClient = dynamic(() => import("./VaccineParserClient"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

interface PageProps {
  searchParams: Promise<{ crianca?: string }>;
}

export default async function CarteirinhaPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  const params = await searchParams;
  const childId =
    params.crianca ||
    (children && children.length > 0 ? children[0].id : null);

  if (!childId) {
    redirect("/saude/vacinas");
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      <VaccineParserClient groupId={groupId} childId={childId} />
    </div>
  );
}
