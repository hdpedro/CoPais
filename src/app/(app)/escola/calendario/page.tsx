/* ------------------------------------------------------------------ */
/* /escola/calendario — entrada do Kindar Brain (A0, PWA)               */
/*                                                                      */
/* Server component: GATE de flag (master env && brain_beta_enabled).   */
/* Defesa em profundidade — a UI nem renderiza fora do beta (o servidor */
/* das rotas também rejeita). Carrega as crianças do grupo e entrega    */
/* ao client.                                                           */
/* ------------------------------------------------------------------ */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { isBrainEnabledForGroup } from "@/lib/services/brain-flag";
import BrainCalendarClient from "./BrainCalendarClient";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const group = await getActiveGroup(supabase, user.id);
  if (!group || !(await isBrainEnabledForGroup(supabase, group.groupId))) {
    notFound();
  }

  const { data: childRows } = await supabase
    .from("children")
    .select("id, name")
    .eq("group_id", group.groupId);
  const children = (childRows ?? []).map((c) => ({
    id: c.id as string,
    name: (c.name as string) ?? "",
  }));

  return <BrainCalendarClient groupChildren={children} />;
}
