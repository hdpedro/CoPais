"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { captureServerEvent } from "@/lib/posthog-server";
import { grantTrialIfEligible } from "@/lib/billing";
import { getAttribution, attributionEventProps } from "@/lib/attribution";
import { markQuestStep } from "@/actions/onboarding-quest";
import { createChild, updateChild as updateChildService } from "@/lib/services/children";
import { custodyEnabledForArrangement } from "@/lib/care-routine-resolve";

export async function createGroup(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessao expirada. Faca login novamente." };

  const name = formData.get("name") as string;
  const childName = formData.get("childName") as string;
  const childBirthDate = formData.get("childBirthDate") as string;

  // Generate UUID upfront so we don't need .select() after insert
  // (RLS SELECT policy requires group membership which doesn't exist yet)
  const groupId = crypto.randomUUID();

  // Create group
  const { error: groupError } = await supabase
    .from("coparenting_groups")
    .insert({ id: groupId, name, created_by: user.id });

  if (groupError) return { error: groupError.message };

  // Add creator as admin
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: groupId,
    user_id: user.id,
    role: "admin",
  });

  if (memberError) return { error: memberError.message };

  // Add child if provided — usa o service consolidado pra surface erros
  // PG (FK/check/RLS) de forma uniforme com Native e wizard de onboarding.
  if (childName && childBirthDate) {
    const childResult = await createChild(
      supabase,
      {
        groupId,
        fullName: childName,
        birthDate: childBirthDate,
      },
      {
        actorId: user.id,
        callerPath: "src/actions/group.ts:createGroup",
        // Cookie client + RLS — não precisa membership check manual.
        enforceMembership: false,
        via: "createGroup",
      },
    );
    if (!childResult.ok) return { error: childResult.error };
    // Quest step: first child added
    await markQuestStep("add_child", { via: "createGroup" });
  }

  // Grant the 7-day Premium Jurídico trial — "show the ceiling" onboarding.
  // Idempotent + user-scoped (one trial per user ever). Failure is non-fatal:
  // group creation succeeds even if the trial grant races with a parallel
  // signup or if the user already had a prior sub.
  const trialResult = await grantTrialIfEligible(supabase, user.id, groupId);
  if (trialResult.granted) {
    const attribution = await getAttribution();
    captureServerEvent(user.id, "trial_started", {
      group_id: groupId,
      ...attributionEventProps(attribution),
    });
  } else if (trialResult.reason !== "user_had_prior_subscription") {
    // Grant FALHOU pra um user elegível — mesmo silêncio que custou 41 grupos
    // o trial em mai/2026. Agora é ALTO (log + evento alertável).
    console.error(
      `[createGroup] trial grant FAILED for eligible user ${user.id}: ${trialResult.reason}`,
    );
    captureServerEvent(user.id, "trial_grant_failed", {
      group_id: groupId,
      reason: trialResult.reason,
    });
  }

  captureServerEvent(user.id, "group_created");

  // Don't call revalidatePath here — it triggers a page re-render during
  // the server action which causes redirect loops with auth token refresh.
  // The client component will navigate with router.push() + router.refresh().
  return { success: true };
}

export async function enableCustody(groupId: string): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) return { error: "Sem permissão para este grupo." };

  // Ativar guarda = forma "rotating" (revezamento) — mantém arrangement coerente.
  const { error } = await supabase
    .from("coparenting_groups")
    .update({ custody_enabled: true, arrangement: "rotating" })
    .eq("id", groupId);

  if (error) return { error: error.message };

  captureServerEvent(user.id, "custody_enabled");
  revalidatePath("/dashboard");
  revalidatePath("/calendario");
  return { success: true };
}

const VALID_ARRANGEMENTS = ["rotating", "together", "single", "custom"] as const;

/**
 * Define a forma da família (arrangement) + acopla custody_enabled pra manter
 * tudo consistente: revezam guarda (rotating/custom) → custódia ON; moram
 * juntos / responsável único (together/single) → custódia OFF (some o herói de
 * guarda, calendário de guarda etc.). O painel inicial passa a mostrar a rotina
 * de leva/busca como herói pra together/single.
 */
export async function setGroupArrangement(
  groupId: string,
  arrangement: string,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };
  if (!VALID_ARRANGEMENTS.includes(arrangement as (typeof VALID_ARRANGEMENTS)[number])) {
    return { error: "Forma de família inválida." };
  }

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) return { error: "Sem permissão para este grupo." };

  const custodyEnabled = custodyEnabledForArrangement(arrangement);
  const { error } = await supabase
    .from("coparenting_groups")
    .update({ arrangement, custody_enabled: custodyEnabled })
    .eq("id", groupId);

  if (error) return { error: error.message };

  captureServerEvent(user.id, "group_arrangement_set", { arrangement });
  revalidatePath("/dashboard");
  revalidatePath("/calendario");
  revalidatePath("/calendario/rotina");
  return { success: true };
}

export async function addChild(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const fullName = formData.get("fullName") as string;
  const birthDate = formData.get("birthDate") as string;
  const allergies = formData.get("allergies") as string;
  const notes = formData.get("notes") as string;
  const sexRaw = formData.get("sex") as string | null;

  // Delega pro service — surface erros PG (FK/check/RLS) uniforme com
  // Native (api/children) e wizard onboarding (api/create-group).
  const result = await createChild(
    supabase,
    {
      groupId,
      fullName,
      birthDate,
      sex: sexRaw === "M" || sexRaw === "F" ? sexRaw : null,
      allergies: allergies ? allergies.split(",").map(a => a.trim()) : null,
      notes: notes || null,
    },
    {
      actorId: user.id,
      callerPath: "src/actions/group.ts:addChild",
      enforceMembership: false, // cookie client + RLS
      via: "addChild",
    },
  );

  if (!result.ok) {
    redirect("/criancas/nova?error=" + encodeURIComponent(result.error));
  }

  // captureServerEvent já chamado pelo service.
  await markQuestStep("add_child", { via: "addChild" });

  redirect("/criancas");
}

export async function updateChild(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = formData.get("id") as string;

  // Pré-fetch só pra descobrir group_id (RLS cuida da permissão real).
  const { data: child } = await supabase
    .from("children")
    .select("group_id")
    .eq("id", id)
    .single();

  if (!child) {
    redirect("/criancas?error=" + encodeURIComponent("Crianca nao encontrada."));
  }

  const membership = await verifyGroupMembership(supabase, child.group_id, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const fullName = formData.get("fullName") as string;
  const birthDate = formData.get("birthDate") as string;
  const allergies = formData.get("allergies") as string;
  const notes = formData.get("notes") as string;
  const cpf = formData.get("cpf") as string;
  const rg = formData.get("rg") as string;

  // Delega pro service — mapeamento PG → mensagem humana unificado.
  const result = await updateChildService(
    supabase,
    {
      childId: id,
      groupId: child.group_id,
      patch: {
        fullName,
        birthDate,
        allergies: allergies ? allergies.split(",").map(a => a.trim()) : null,
        notes: notes || null,
        cpf: cpf || null,
        rg: rg || null,
      },
    },
    {
      actorId: user.id,
      callerPath: "src/actions/group.ts:updateChild",
      enforceMembership: false, // cookie client + RLS
      via: "edit_child_form",
    },
  );

  if (!result.ok) {
    redirect("/criancas/" + id + "?tab=geral&error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/criancas/" + id);
  redirect("/criancas/" + id + "?tab=geral");
}
