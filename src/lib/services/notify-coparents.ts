/**
 * Notifica os outros co-pais do grupo sobre uma acao critica feita por
 * um membro. Transparencia entre pais separados — Kindar ajuda os co-pais,
 * nao gera conflito por acoes invisiveis.
 *
 * Quem recebe: todos os outros membros com role 'admin' ou 'member' (co-pais).
 * Readonly (mediator/lawyer/grandparent/caregiver) nao recebe — nao tem
 * poder pra reagir.
 *
 * Falha silenciosa: se push/notification falhar, a acao principal nao
 * deve ser revertida. Por isso o try/catch absorvendo qualquer erro.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithPush } from "@/lib/push";

interface NotifyCoparentsArgs {
  groupId: string;
  actorUserId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

export async function notifyCoparents({
  groupId,
  actorUserId,
  type,
  title,
  message,
  link,
}: NotifyCoparentsArgs): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: members } = await admin
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", groupId)
      .neq("user_id", actorUserId)
      .in("role", ["admin", "member"]);

    if (!members || members.length === 0) return;

    await Promise.all(
      members.map((m) =>
        createNotificationWithPush(m.user_id, type, title, message, link),
      ),
    );
  } catch {
    // Falha silenciosa — nao quebra a acao principal.
  }
}
