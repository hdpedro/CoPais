/**
 * child-sizes-collab — wrapper de notifyCollabCreate pro módulo de Tamanhos.
 *
 * Foundation Collab adoção #7 (migration 00086). Pattern espelhado de
 * health-collab.ts (00080) — server-only, falha silenciosa, monta
 * título/body/link + resolve nomes pra display.
 *
 * SERVER-ONLY.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCollabCreate } from "./collab";
import type { SizeKind } from "./child-sizes";

interface NotifyArgs {
  recordId: string;
  childId: string;
  groupId: string;
  actorUserId: string;
  kind: SizeKind;
  customLabel: string | null;
  sizeValue: string;
}

/**
 * Nome humano do kind pra body do push em pt-BR (fallback).
 * Localized via i18n key `notifications.sizes.kind.<kind>` em
 * notifyCollabCreate (resolve per recipient locale).
 */
function kindLabelPt(kind: SizeKind, customLabel: string | null): string {
  switch (kind) {
    case "shoe": return "sapato";
    case "pants": return "calça";
    case "shirt": return "camiseta";
    case "coat": return "casaco";
    case "other": return (customLabel || "tamanho").toLowerCase();
  }
}

/**
 * Resolve nomes do actor + child para fallback pt-BR. Falha silenciosa.
 */
async function resolveNames(
  actorUserId: string,
  childId: string,
): Promise<{ actorFirstName: string; childFirstName: string }> {
  try {
    const admin = createAdminClient();
    const [{ data: actor }, { data: child }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", actorUserId).single(),
      admin.from("children").select("full_name").eq("id", childId).single(),
    ]);
    return {
      actorFirstName: (actor?.full_name || "").split(" ")[0] || "Alguém",
      childFirstName: (child?.full_name || "").split(" ")[0] || "a criança",
    };
  } catch {
    return { actorFirstName: "Alguém", childFirstName: "a criança" };
  }
}

/**
 * Dispara push pro coparente quando um novo tamanho é registrado.
 * Não chama em is_confirmation=true (caller filtra).
 */
export async function notifySaudeFamiliaSize(args: NotifyArgs): Promise<void> {
  try {
    const { actorFirstName, childFirstName } = await resolveNames(
      args.actorUserId,
      args.childId,
    );
    const label = kindLabelPt(args.kind, args.customLabel);

    // Fallback pt-BR + localized keys
    const fallbackTitle = `${actorFirstName} atualizou um tamanho`;
    const fallbackBody = `${childFirstName} agora usa ${label} ${args.sizeValue}`;

    await notifyCollabCreate({
      recordType: "child_size",
      recordId: args.recordId,
      groupId: args.groupId,
      actorUserId: args.actorUserId,
      priority: "info",
      titleKey: "notifications.sizes.title",
      titleVars: { actor: actorFirstName },
      messageKey: "notifications.sizes.body",
      messageVars: {
        child: childFirstName,
        kind: label,
        size: args.sizeValue,
      },
      title: fallbackTitle,
      message: fallbackBody,
      coalescedTitleKey: "notifications.sizes.coalescedCount",
      link: `/criancas/${args.childId}?highlight=${args.recordId}#tamanhos`,
    });
  } catch {
    // best-effort
  }
}
