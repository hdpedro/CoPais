import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificacoesClient from "./NotificacoesClient";

export default async function NotificacoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .neq("title", "push_sub")
    .neq("type", "system")
    .order("created_at", { ascending: false })
    .limit(50);

  // Extra safety: filter out any push subscription or internal data that slipped through
  const filtered = (notifications || []).filter((n: { title: string; message: string | null; type: string }) => {
    if (n.title === "push_sub") return false;
    if (n.type === "system") return false;
    if (n.message && n.message.includes('"endpoint"') && n.message.includes("fcm.googleapis.com")) return false;
    return true;
  });

  return <NotificacoesClient notifications={filtered} />;
}
