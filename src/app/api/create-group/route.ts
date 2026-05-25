import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createChild } from "@/lib/services/children";
import { grantTrialIfEligible } from "@/lib/billing";
import { captureServerEvent } from "@/lib/posthog-server";

export async function POST(request: Request) {
  // Dual auth: Bearer (native) + cookie (PWA). Without Bearer support
  // native onboarding fails because the middleware redirects unauth
  // requests to /session-recovery and the route never sees them.
  const authHeader = request.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) userId = data.user.id;
  } else {
    const cookieClient = await createClient();
    const { data: { user: cookieUser } } = await cookieClient.auth.getUser();
    if (cookieUser) userId = cookieUser.id;
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Sessao expirada. Faca login novamente." },
      { status: 401 },
    );
  }

  const body = await request.json();
  const {
    name,
    childName,
    childBirthDate,
    childSex,
    childAllergies,
    childNotes,
  } = body as {
    name?: string;
    childName?: string;
    childBirthDate?: string;
    childSex?: "M" | "F" | null;
    childAllergies?: string[] | null;
    childNotes?: string | null;
  };

  if (!name) {
    return NextResponse.json({ error: "Nome da familia e obrigatorio." }, { status: 400 });
  }

  // Use admin client for the actual writes — RLS would block the SELECT-
  // after-INSERT pattern (group membership doesn't exist yet) and we
  // already verified the user identity above.
  const admin = createAdminClient();

  // Generate UUIDs upfront so we don't need .select() after insert and the
  // wizard receives stable ids to drive subsequent edit/remove actions.
  const groupId = crypto.randomUUID();
  const childId = childName && childBirthDate ? crypto.randomUUID() : null;

  // Compensation rollback — Supabase admin client não expõe transações
  // explícitas em JS, então a opção é cleanup manual quando uma escrita
  // posterior falha. Sem isso, antes desse fix o usuário podia ficar com
  // um grupo órfão (criado mas sem membership/criança) caso a segunda ou
  // terceira INSERT falhasse, o que travava o onboarding em estados estranhos.
  async function rollback(reason: string) {
    // Best-effort — não bloqueia a resposta de erro se o cleanup também
    // falhar. Logamos pra investigar manualmente.
    try {
      await admin.from("group_members").delete().eq("group_id", groupId);
      await admin.from("coparenting_groups").delete().eq("id", groupId);
    } catch (err) {
      console.error(
        `[create-group] rollback após "${reason}" também falhou:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 1) Cria grupo
  const { error: groupError } = await admin
    .from("coparenting_groups")
    .insert({ id: groupId, name, created_by: userId });

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 400 });
  }

  // 2) Adiciona o criador como admin do grupo
  const { error: memberError } = await admin.from("group_members").insert({
    group_id: groupId,
    user_id: userId,
    role: "admin",
  });

  if (memberError) {
    await rollback("membership insert failed");
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  // 3) Adiciona a criança se fornecida via service consolidado
  //    (validações + PG → mensagem humana + reportServerError).
  //    Membership já foi inserido logo acima — passamos enforceMembership=true
  //    pro service detectar inconsistências (defesa em profundidade).
  let step = 1; // group created
  if (childId && childName && childBirthDate) {
    const childResult = await createChild(
      admin,
      {
        childId,
        groupId,
        fullName: childName,
        birthDate: childBirthDate,
        sex: childSex,
        allergies: childAllergies,
        notes: childNotes,
      },
      {
        actorId: userId,
        callerPath: "src/app/api/create-group/route.ts",
        enforceMembership: true,
        via: "create_group",
      },
    );
    if (!childResult.ok) {
      await rollback("child insert failed");
      return NextResponse.json(
        { error: childResult.error, code: childResult.errorCode, pgCode: childResult.pgCode },
        { status: childResult.status },
      );
    }
    step = 2; // child created
  }

  // 4) Atualiza onboarding_step (best-effort — não rollback se falhar:
  //    o grupo + membership + criança já estão criados e válidos, o quest
  //    apenas fica desatualizado num campo informativo).
  await admin.from("profiles").update({ onboarding_step: step }).eq("id", userId);

  // 5) Concede degustação de 7 dias Premium Jurídico ("show the ceiling").
  //    Sem isso, todo grupo novo nasce no Free e ninguém vê o teto do produto
  //    — bug detectado em prod 2026-05-25 (64 grupos em 90d, zero trials).
  //    A action paralela `actions/group.ts:createGroup` (dashboard) já fazia
  //    isso; este endpoint (wizard PWA + Native) tinha sido esquecido.
  //    Idempotente, user-scoped, non-fatal — se falhar o grupo continua válido.
  const trialResult = await grantTrialIfEligible(admin, userId, groupId);
  if (trialResult.granted) {
    captureServerEvent(userId, "trial_started", { group_id: groupId, via: "onboarding_wizard" });
  }

  // 6) Telemetria. Sem `group_created` capturado, a galáxia entre signup_completed
  //    e qualquer evento de onboarding fica invisível no PostHog.
  captureServerEvent(userId, "group_created", {
    group_id: groupId,
    via: "onboarding_wizard",
    has_child: !!childId,
    trial_granted: trialResult.granted,
  });

  // 7) Invalida caches
  revalidateTag(`profile-${userId}`, "max");
  revalidateTag(`members-${groupId}`, "max");
  revalidateTag(`children-${groupId}`, "max");

  return NextResponse.json({ success: true, groupId, childId });
}
