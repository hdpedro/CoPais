import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatRoom from "./ChatRoom";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;
  const isReadonly = memberships[0].role === "readonly";

  // Parallel fetch: messages + members
  const [{ data: messages }, { data: members }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("*, profiles!chat_messages_sender_id_fkey(full_name)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("group_members")
      .select("user_id, profiles(full_name)")
      .eq("group_id", groupId),
  ]);

  return (
    <ChatRoom
      groupId={groupId}
      userId={user.id}
      initialMessages={(messages || []).reverse()}
      members={members || []}
      isReadonly={isReadonly}
    />
  );
}
