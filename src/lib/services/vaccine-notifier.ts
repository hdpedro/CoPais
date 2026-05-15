/* ------------------------------------------------------------------ */
/* vaccine-notifier.ts                                                 */
/* Server-only utilities pra cron diário de push de vacinas.           */
/*                                                                     */
/* Responsabilidades:                                                  */
/*  1. Identifica candidates pra push (status due_soon/overdue,        */
/*     respeitando dismissals ativos, NUNCA historical_gap/out_of_win).*/
/*  2. Dispara push + cria notification row pra cada coparente do      */
/*     grupo da criança.                                               */
/*  3. Push contextual: 24h antes de medical_appointment futuro, se a  */
/*     criança tem pendência, push "leve a carteirinha".               */
/*  4. Reentrada do snooze "already_scheduled" — limpa dismissals      */
/*     expirados, recompute, push suave.                               */
/*                                                                     */
/* Linguagem CALMA. "ainda não está marcada" / "está na hora". Nunca   */
/* "atrasada", "vencida", "em risco".                                  */
/* ------------------------------------------------------------------ */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithPush } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";

/**
 * Resolve fragmento i18n PT-BR. O cron roda server-side e push é entregue
 * ao device em qualquer locale — mantemos copy PT-BR aqui, idêntico aos
 * keys de `health.vaccineEngine.pushDue*`. Locale do device é detectado
 * pelo client; futuro: carregar tradução via lookup.
 */
function fmtPush(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

const COPY = {
  pushDue30d: "{childName} tem a vacina {vaccineName} em 30 dias",
  pushDue7d: "{childName}: {vaccineName} em 1 semana",
  pushDue1d: "Amanhã: {vaccineName} do {childName}",
  pushDueTodayCalm: "A {vaccineName} do {childName} pode ser tomada hoje",
  pushOverdue: "A {vaccineName} do {childName} ainda não está marcada",
  snoozeReentry: "Lembrete sobre a {vaccineName} do {childName} — você ia agendar",
  appointmentTakeCard:
    "Leve a carteirinha do {childName} para a consulta com {professional} — {count} reforço(s) pendente(s)",
  fallbackTitle: "Saúde preventiva",
};

interface Candidate {
  recommendation_id: string;
  child_id: string;
  child_name: string;
  group_id: string;
  vaccine_id: string;
  dose_number: number;
  vaccine_name: string;
  status: "upcoming" | "due_soon" | "overdue";
  due_date: string;
  overdue_days: number | null;
  days_until: number;
}

interface NotifyResult {
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Cron diário das 09:00 BRT: identifica candidates e dispara push.
 *
 * Critérios:
 *  - status = 'due_soon' AND due_date - today IN (30, 7, 1)
 *  - OR status = 'overdue' AND overdue_days IN (1, 7, 30)
 *  - AND NOT EXISTS dismissal ativa pra (user, child, vaccine, dose_number)
 *  - NUNCA pra historical_gap ou out_of_window.
 */
export async function runDailyVaccineDueNotify(): Promise<NotifyResult> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // 1. Pega candidates via JOIN — incluímos 'upcoming' (pre-due 30/7/1d antes),
  // 'due_soon' (dia 0..tolerance) e 'overdue' (pós-tolerance).
  const { data: rawCandidates, error: candidatesErr } = await admin
    .from("vaccine_recommended_doses")
    .select(
      "id, child_id, group_id, vaccine_id, dose_number, due_date, status, overdue_days, " +
        "vaccine_catalog!inner(name), children!inner(full_name)",
    )
    .in("status", ["upcoming", "due_soon", "overdue"]);

  if (candidatesErr) {
    console.error("[CRON vaccine-due] candidates query failed:", candidatesErr);
    return { sent: 0, skipped: 0, errors: 1 };
  }

  const todayDate = new Date(today + "T12:00:00").getTime();
  const candidates: Candidate[] = ((rawCandidates || []) as unknown[]).flatMap((rawRow) => {
    const row = rawRow as {
      id: string;
      child_id: string;
      group_id: string;
      vaccine_id: string;
      dose_number: number;
      due_date: string;
      status: "upcoming" | "due_soon" | "overdue";
      overdue_days: number | null;
      vaccine_catalog: { name: string } | Array<{ name: string }>;
      children: { full_name: string } | Array<{ full_name: string }>;
    };
    const cat = Array.isArray(row.vaccine_catalog) ? row.vaccine_catalog[0] : row.vaccine_catalog;
    const child = Array.isArray(row.children) ? row.children[0] : row.children;
    const daysUntil = Math.round(
      (new Date(row.due_date + "T12:00:00").getTime() - todayDate) / 86400000,
    );

    // Lógica unificada de dias-gatilho — independente de status quando
    // ambos (due_soon e overdue) se sobrepõem no tempo. Regra simples:
    // `daysSinceDue = today - due_date` (positivo = passou). Dispara quando
    // `daysSinceDue` ∈ {-30, -7, -1, 0, 1, 7, 30}, com status apropriado.
    const daysSinceDue = -daysUntil;
    const triggerDays = [-30, -7, -1, 0, 1, 7, 30];
    if (!triggerDays.includes(daysSinceDue)) return [];

    return [{
      recommendation_id: row.id,
      child_id: row.child_id,
      group_id: row.group_id,
      vaccine_id: row.vaccine_id,
      dose_number: row.dose_number,
      vaccine_name: cat?.name || "Vacina",
      child_name: child?.full_name || "",
      status: row.status,
      due_date: row.due_date,
      overdue_days: row.overdue_days,
      days_until: daysUntil,
    }];
  });

  if (candidates.length === 0) {
    return { sent: 0, skipped: 0, errors: 0 };
  }

  // 2. Pega members + dismissals em batch
  const groupIds = Array.from(new Set(candidates.map((c) => c.group_id)));
  const { data: membersRaw } = await admin
    .from("group_members")
    .select("group_id, user_id")
    .in("group_id", groupIds);
  const membersByGroup = new Map<string, string[]>();
  for (const m of (membersRaw || []) as { group_id: string; user_id: string }[]) {
    if (!membersByGroup.has(m.group_id)) membersByGroup.set(m.group_id, []);
    membersByGroup.get(m.group_id)!.push(m.user_id);
  }

  const nowIso = new Date().toISOString();
  const { data: activeDismissals } = await admin
    .from("vaccine_notification_dismissals")
    .select("user_id, child_id, vaccine_id, dose_number")
    .gt("dismissed_until", nowIso);
  const dismissalKeys = new Set(
    (activeDismissals || []).map(
      (d: { user_id: string; child_id: string; vaccine_id: string; dose_number: number }) =>
        `${d.user_id}::${d.child_id}::${d.vaccine_id}::${d.dose_number}`,
    ),
  );

  // 3. Envia push agregado por (groupId, child) — coalescing
  for (const c of candidates) {
    const recipients = membersByGroup.get(c.group_id) || [];
    if (recipients.length === 0) {
      skipped += 1;
      continue;
    }
    const childFirst = c.child_name.split(" ")[0] || "criança";
    // Seleciona copy baseado em quando o due_date está vs hoje (não em status).
    // c.days_until: positivo = falta; negativo = passou.
    let copy: string;
    if (c.days_until === 30) {
      copy = fmtPush(COPY.pushDue30d, { childName: childFirst, vaccineName: c.vaccine_name });
    } else if (c.days_until === 7) {
      copy = fmtPush(COPY.pushDue7d, { childName: childFirst, vaccineName: c.vaccine_name });
    } else if (c.days_until === 1) {
      copy = fmtPush(COPY.pushDue1d, { childName: childFirst, vaccineName: c.vaccine_name });
    } else if (c.days_until === 0) {
      copy = fmtPush(COPY.pushDueTodayCalm, { childName: childFirst, vaccineName: c.vaccine_name });
    } else {
      // days_until < 0 → passou (1, 7 ou 30d pós due_date) — copy calmo sem alarme
      copy = fmtPush(COPY.pushOverdue, { childName: childFirst, vaccineName: c.vaccine_name });
    }
    const title = COPY.fallbackTitle;
    const link = `/saude/vacinas?crianca=${c.child_id}&highlight=${c.recommendation_id}`;

    for (const userId of recipients) {
      const key = `${userId}::${c.child_id}::${c.vaccine_id}::${c.dose_number}`;
      if (dismissalKeys.has(key)) {
        skipped += 1;
        continue;
      }
      try {
        await createNotificationWithPush(userId, "vaccine_due", title, copy, link);
        captureServerEvent(userId, "vaccine_due_push_sent", {
          days_until_due: c.days_until,
          vaccine_code: c.vaccine_id,
          was_overdue: c.status === "overdue",
          overdue_days: c.overdue_days || 0,
        });
        sent += 1;
      } catch (e) {
        console.error("[CRON vaccine-due] push fail:", e);
        errors += 1;
      }
    }
  }

  // 4. Push contextual: appointment 24h ahead + criança com pendência
  await runAppointmentTakeCardReminder().catch((e) =>
    console.error("[CRON vaccine-due] appointment reminder fail:", e),
  );

  return { sent, skipped, errors };
}

/**
 * 24h antes de qualquer medical_appointment, se a criança tem pendências
 * preventivas (overdue+due_soon > 0), avisa pra levar a carteirinha.
 */
async function runAppointmentTakeCardReminder(): Promise<void> {
  const admin = createAdminClient();
  const tomorrow = new Date(Date.now() + 86400000);
  const tStart = tomorrow.toISOString().slice(0, 10) + "T00:00:00";
  const tEnd = tomorrow.toISOString().slice(0, 10) + "T23:59:59";

  const { data: appts } = await admin
    .from("medical_appointments")
    .select(
      "id, child_id, group_id, title, appointment_date, medical_professionals(name)",
    )
    .eq("status", "scheduled")
    .gte("appointment_date", tStart)
    .lte("appointment_date", tEnd);

  if (!appts || appts.length === 0) return;

  for (const raw of appts as unknown[]) {
    const apt = raw as {
      id: string;
      child_id: string | null;
      group_id: string;
      title: string;
      medical_professionals: { name: string } | Array<{ name: string }> | null;
    };
    if (!apt.child_id) continue;

    // Quantas pendências essa criança tem?
    const { data: cov } = await admin
      .from("child_vaccine_coverage")
      .select("overdue_count, due_soon_count")
      .eq("child_id", apt.child_id)
      .maybeSingle();
    const pending = (cov?.overdue_count ?? 0) + (cov?.due_soon_count ?? 0);
    if (pending === 0) continue;

    const { data: child } = await admin
      .from("children")
      .select("full_name")
      .eq("id", apt.child_id)
      .maybeSingle();
    const childFirst = (child?.full_name || "criança").split(" ")[0];

    const prof = Array.isArray(apt.medical_professionals)
      ? apt.medical_professionals[0]
      : apt.medical_professionals;
    const professional = prof?.name ? `Dr(a). ${prof.name}` : apt.title;

    const body = fmtPush(COPY.appointmentTakeCard, {
      childName: childFirst,
      professional,
      count: String(pending),
    });

    const { data: members } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", apt.group_id);
    const link = `/saude/vacinas?crianca=${apt.child_id}`;
    for (const m of (members || []) as { user_id: string }[]) {
      try {
        await createNotificationWithPush(m.user_id, "vaccine_take_card", "Saúde preventiva", body, link);
      } catch (e) {
        console.error("[CRON vaccine-take-card] push fail:", e);
      }
    }
  }
}

/**
 * Cron MENSAL (dia 1 de cada mês): campanhas anuais (Influenza/COVID).
 * Dispara push pra cada criança ≥9a com vacina anual ainda não tomada
 * NO ANO VIGENTE. Mensagem específica: "Campanha de Influenza {ano} aberta".
 */
export async function runMonthlyCampaignReminder(): Promise<{ pushes: number }> {
  const admin = createAdminClient();
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  let pushes = 0;

  // Vacinas anuais do catálogo
  const { data: annualVaccines } = await admin
    .from("vaccine_catalog")
    .select("id, code, name")
    .eq("country_code", "BR")
    .eq("is_annual", true);
  if (!annualVaccines || annualVaccines.length === 0) return { pushes: 0 };

  const codeToCopy: Record<string, string> = {
    influenza: `Campanha de Influenza ${year} começou — {childName} pode tomar agora`,
    covid: `Atualização da COVID-19 disponível para {childName}`,
  };

  for (const av of annualVaccines as Array<{ id: string; code: string; name: string }>) {
    // Recomendações dessa vacina anual NOT taken no ano vigente
    const { data: candidates } = await admin
      .from("vaccine_recommended_doses")
      .select("id, child_id, group_id")
      .eq("vaccine_id", av.id)
      .in("status", ["overdue", "due_soon", "upcoming"]);

    if (!candidates || candidates.length === 0) continue;

    for (const c of candidates as Array<{ id: string; child_id: string; group_id: string }>) {
      // Skip se a criança já tomou no ano vigente
      const { count } = await admin
        .from("vaccination_records")
        .select("id", { count: "exact", head: true })
        .eq("child_id", c.child_id)
        .eq("catalog_id", av.id)
        .gte("administered_date", yearStart);
      if ((count ?? 0) > 0) continue;

      const { data: child } = await admin
        .from("children")
        .select("full_name")
        .eq("id", c.child_id)
        .maybeSingle();
      const childFirst = (child?.full_name as string | undefined)?.split(" ")[0] || "criança";

      const { data: members } = await admin
        .from("group_members")
        .select("user_id")
        .eq("group_id", c.group_id);

      const body = (codeToCopy[av.code] || `Vacina anual {childName}: ${av.name}`).replace(
        "{childName}",
        childFirst,
      );
      const link = `/saude/vacinas?crianca=${c.child_id}`;
      for (const m of (members || []) as { user_id: string }[]) {
        try {
          await createNotificationWithPush(m.user_id, "vaccine_campaign", "Saúde preventiva", body, link);
          pushes += 1;
        } catch (e) {
          console.error("[CRON vaccine-campaign] push fail:", e);
        }
      }
    }
  }
  return { pushes };
}

/**
 * Cron diário das 08:00 BRT: limpa dismissals 'already_scheduled' expirados
 * e dispara push suave de reentrada (sem vaccination_record matching).
 */
export async function runDailyVaccineSnoozeReentry(): Promise<{ reentries: number }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: expired } = await admin
    .from("vaccine_notification_dismissals")
    .select("id, user_id, child_id, vaccine_id, dose_number")
    .eq("reason", "already_scheduled")
    .lt("dismissed_until", nowIso);

  if (!expired || expired.length === 0) return { reentries: 0 };

  let reentries = 0;
  for (const d of expired as Array<{ id: string; user_id: string; child_id: string; vaccine_id: string; dose_number: number }>) {
    // Verifica se houve registro matching desde o snooze
    const { data: matching } = await admin
      .from("vaccination_records")
      .select("id")
      .eq("child_id", d.child_id)
      .eq("catalog_id", d.vaccine_id)
      .eq("dose_number", d.dose_number)
      .limit(1)
      .maybeSingle();

    if (matching) {
      // Já tomou — limpa dismissal silenciosamente.
      await admin.from("vaccine_notification_dismissals").delete().eq("id", d.id);
      continue;
    }

    // Não tomou. Push suave.
    const { data: child } = await admin
      .from("children")
      .select("full_name")
      .eq("id", d.child_id)
      .maybeSingle();
    const { data: vac } = await admin
      .from("vaccine_catalog")
      .select("name")
      .eq("id", d.vaccine_id)
      .maybeSingle();
    if (!child || !vac) {
      await admin.from("vaccine_notification_dismissals").delete().eq("id", d.id);
      continue;
    }
    const childFirst = (child.full_name as string).split(" ")[0];
    const vaccineName = vac.name as string;
    const body = fmtPush(COPY.snoozeReentry, { childName: childFirst, vaccineName });
    const link = `/saude/vacinas?crianca=${d.child_id}`;
    try {
      await createNotificationWithPush(d.user_id, "vaccine_due_reentry", "Saúde preventiva", body, link);
      reentries += 1;
    } catch (e) {
      console.error("[CRON vaccine-snooze-reentry] push fail:", e);
    }
    // Limpa dismissal — usuário receberá pushes normais a partir de agora.
    await admin.from("vaccine_notification_dismissals").delete().eq("id", d.id);
  }

  return { reentries };
}
