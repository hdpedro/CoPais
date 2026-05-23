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
    .select("id, full_name, birth_date")
    .eq("group_id", groupId);

  const params = await searchParams;
  const selectedChild =
    children?.find((c) => c.id === params.crianca) ||
    children?.[0] ||
    null;
  const childId = selectedChild?.id ?? null;

  if (!childId) {
    redirect("/saude/vacinas");
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      <VaccineParserClient
        groupId={groupId}
        childId={childId}
        childBirthDate={selectedChild?.birth_date as string | null | undefined}
      />
    </div>
  );
}
