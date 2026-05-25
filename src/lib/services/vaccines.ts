/* ------------------------------------------------------------------ */
/* services/vaccines.ts                                                */
/* Single source of truth for vaccine engine — Motor de Saúde          */
/* Preventiva (Fase 1). Pareado com `actions/vaccines.ts` (PWA),       */
/* `api/health/vaccines/route.ts` (native), e tools.ts (AI).           */
/*                                                                     */
/* Foundation: migration 00082_vaccine_engine. Banco como SoT —        */
/* `compute_vaccine_recommendations()` é regenerado por triggers em    */
/* `children`, `vaccination_records`, `medical_appointments`. Este     */
/* service nunca tenta recomputar manualmente.                         */
/*                                                                     */
/* Diretriz de tom (vide CLAUDE.md / plano):                           */
/*  - statusLabel é STRING CALMA PRÉ-FORMATADA pra UI usar direto      */
/*  - sem "atrasada/vencida" — copy testada, alarmismo zero            */
/*  - coverage_pct vem em campo separado mas hero/tile mostra label    */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { captureServerEvent } from "@/lib/posthog-server";

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export type VaccineStatus =
  | "taken"
  | "overdue"
  | "due_soon"
  | "upcoming"
  | "future"
  | "historical_gap"
  | "out_of_window";

export type CalendarPreference = "public" | "private" | "both";
export type VaccineSource = "manual" | "ocr" | "imported";

/* ------------------------------------------------------------------ */
/* Types — return shapes                                              */
/* ------------------------------------------------------------------ */

export interface VaccineDoseStatus {
  id: string;
  vaccineId: string;
  vaccineCode: string;
  vaccineName: string;
  doseNumber: number;
  doseLabel: string;
  status: VaccineStatus;
  dueDate: string;            // ISO YYYY-MM-DD
  validUntilDate: string | null;
  overdueDays: number | null;
  takenRecordId: string | null;
  takenDate: string | null;   // populated when status='taken'
  ruleNetwork: string;
  isBooster: boolean;
}

export interface TimelineGroup {
  ageBucket: string;          // "0-2m" | "2-4m" | "4-6m" | "6-12m" | "1-2a" | "2-4a" | "4-6a" | "9-14a" | "anual"
  doses: VaccineDoseStatus[];
}

export interface VaccineStatusResult {
  childId: string;
  coveragePct: number;        // 0-100; UI mostra em segunda camada (tap)
  statusLabel: string;        // Hero/tile usa: "Em dia" | "1 reforço pendente" | "Complete o histórico"
  totals: {
    recommended: number;
    taken: number;
    overdue: number;
    dueSoon: number;
    upcoming: number;
    historicalGap: number;
    outOfWindow: number;
  };
  nextDue: {
    doseId: string;
    vaccineName: string;
    dueDate: string;
  } | null;
  overdue: VaccineDoseStatus[];
  dueSoon: VaccineDoseStatus[];
  upcoming: VaccineDoseStatus[];
  taken: VaccineDoseStatus[];
  historicalGaps: VaccineDoseStatus[];
  timelineByAge: TimelineGroup[];
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface RecordVaccinationInput {
  groupId: string;
  childId: string;
  createdBy: string;
  vaccineName: string;          // free text fallback when catalog match fails
  catalogId?: string | null;    // when UI autocompletes from catalog
  doseLabel?: string | null;
  doseNumber?: number | null;   // null = inferir
  administeredDate: string;     // YYYY-MM-DD
  batchNumber?: string | null;
  location?: string | null;
  notes?: string | null;
  source?: VaccineSource;       // 'manual' default
  confidenceScore?: number | null;
  /** Se true, mesmo detectando duplicata, força o insert (user confirmou). */
  forceDuplicate?: boolean;
}

export interface DismissDoseInput {
  userId: string;
  childId: string;
  vaccineId: string;
  doseNumber: number;
  reason: "snoozed_7d" | "snoozed_30d" | "already_scheduled" | "medical_advice";
}

export interface SetCalendarPreferenceInput {
  childId: string;
  preference: CalendarPreference;
  actorUserId: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

async function verifyChildMembership(
  supabase: SupabaseClient,
  childId: string,
  userId: string,
): Promise<{ ok: true; groupId: string } | { ok: false; error: string; status: number }> {
  const { data: child } = await supabase
    .from("children")
    .select("id, group_id")
    .eq("id", childId)
    .maybeSingle();
  if (!child) return { ok: false, error: "Criança não encontrada.", status: 404 };

  const { data: member } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", child.group_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { ok: false, error: "Sem permissão para este grupo.", status: 403 };

  return { ok: true, groupId: child.group_id as string };
}

/**
 * Mapeia idade-em-meses pra bucket de timeline (estilo Apple Health).
 * Vacinas anuais (recommended_age_months=null ou is_annual) vão pro bucket 'anual'.
 */
function bucketForAge(months: number | null, isAnnual: boolean): string {
  if (isAnnual) return "anual";
  if (months === null) return "anual";
  if (months < 2) return "0-2m";
  if (months < 4) return "2-4m";
  if (months < 6) return "4-6m";
  if (months < 12) return "6-12m";
  if (months < 24) return "1-2a";
  if (months < 48) return "2-4a";
  if (months < 72) return "4-6a";
  if (months < 108) return "6-9a";
  return "9-14a";
}

const BUCKET_ORDER = [
  "0-2m",
  "2-4m",
  "4-6m",
  "6-12m",
  "1-2a",
  "2-4a",
  "4-6a",
  "6-9a",
  "9-14a",
  "anual",
];

/**
 * Constrói statusLabel calmo a partir das contagens. ESTRINGS HUMANAS:
 * - "Em dia" — nada pendente, todas taken/future/upcoming
 * - "Complete o histórico" — só historical_gap (criança entrou velha)
 * - "1 reforço pendente" / "N reforços pendentes" — overdue + due_soon
 * - "Próxima vacina chega logo" — só upcoming/due_soon
 *
 * Linguagem NUNCA alarmista. Sem "atrasada", "vencida", "em risco".
 */
function buildStatusLabel(totals: VaccineStatusResult["totals"]): string {
  const actionable = totals.overdue + totals.dueSoon;
  if (actionable === 0 && totals.recommended === 0) return "Complete a carteirinha";
  if (actionable === 0 && totals.historicalGap > 0 && totals.taken === 0) {
    return "Complete o histórico";
  }
  if (actionable === 0) return "Em dia";
  if (actionable === 1) return "1 reforço pendente";
  return `${actionable} reforços pendentes`;
}

/* ------------------------------------------------------------------ */
/* Public: getVaccineStatus                                            */
/* ------------------------------------------------------------------ */

/**
 * Snapshot atual do status vacinal de uma criança.
 *
 * Lê `vaccine_recommended_doses` + JOINs catalog/rules + `child_vaccine_coverage`
 * em paralelo. Não recomputa — banco já manteve via triggers.
 *
 * Caller pode passar supabase com sessão do user (RLS aplicada) ou admin
 * (ex: AI tool consultando em nome do user com `actingAs`). RLS de
 * `vaccine_recommended_doses` exige `is_group_member(group_id)`, então
 * sessão do user já gateia naturalmente.
 *
 * `userId` opcional: quando passado, `vaccine_notification_dismissals`
 * ativos (per-user) filtram a lista de pendências (overdue + due_soon)
 * e os totais correspondentes — coparente que adiou 7d/30d/"já agendei"
 * deixa de ver o card até o TTL expirar. Sem userId, retorna tudo (export,
 * relatório, contexto admin). Bug 2026-05-21: snooze gravava na tabela
 * mas UI continuava mostrando porque o engine não consultava dismissals.
 */
export async function getVaccineStatus(
  supabase: SupabaseClient,
  childId: string,
  userId?: string,
): Promise<ServiceResult<VaccineStatusResult>> {
  if (!childId?.trim()) {
    return { ok: false, error: "childId obrigatório.", status: 400 };
  }

  const [coverageRes, dosesRes] = await Promise.all([
    supabase
      .from("child_vaccine_coverage")
      .select(
        "total_recommended, total_taken, overdue_count, due_soon_count, upcoming_count, historical_gap_count, out_of_window_count, coverage_pct, next_due_date, next_due_vaccine_name, next_due_dose_id",
      )
      .eq("child_id", childId)
      .maybeSingle(),
    supabase
      .from("vaccine_recommended_doses")
      .select(
        `id, vaccine_id, dose_number, due_date, valid_until_date, status, taken_record_id, overdue_days,
         vaccine_catalog!inner(code, name, is_annual),
         vaccine_schedule_rules!inner(dose_label, network, is_booster, recommended_age_months)`,
      )
      .eq("child_id", childId)
      .order("due_date", { ascending: true }),
  ]);

  if (coverageRes.error && coverageRes.error.code !== "PGRST116") {
    return { ok: false, error: coverageRes.error.message, status: 500 };
  }
  if (dosesRes.error) {
    return { ok: false, error: dosesRes.error.message, status: 500 };
  }

  // PostgREST nested select retorna relation como array, mesmo quando é
  // semanticamente 1-1 via FK. Normalizamos pra primeiro item em seguida.
  type RawDoseRow = {
    id: string;
    vaccine_id: string;
    dose_number: number;
    due_date: string;
    valid_until_date: string | null;
    status: VaccineStatus;
    taken_record_id: string | null;
    overdue_days: number | null;
    vaccine_catalog:
      | { code: string; name: string; is_annual: boolean }
      | Array<{ code: string; name: string; is_annual: boolean }>;
    vaccine_schedule_rules:
      | { dose_label: string; network: string; is_booster: boolean; recommended_age_months: number | null }
      | Array<{ dose_label: string; network: string; is_booster: boolean; recommended_age_months: number | null }>;
  };
  function unwrap<T>(v: T | T[] | null | undefined): T | null {
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  }
  const rawDoses = ((dosesRes.data || []) as unknown as RawDoseRow[]).map((r) => ({
    id: r.id,
    vaccine_id: r.vaccine_id,
    dose_number: r.dose_number,
    due_date: r.due_date,
    valid_until_date: r.valid_until_date,
    status: r.status,
    taken_record_id: r.taken_record_id,
    overdue_days: r.overdue_days,
    vaccine_catalog: unwrap(r.vaccine_catalog) ?? { code: "", name: "", is_annual: false },
    vaccine_schedule_rules:
      unwrap(r.vaccine_schedule_rules) ?? { dose_label: "", network: "both", is_booster: false, recommended_age_months: null },
  }));

  // Resolve takenDate em batch (mais barato que 1 query por dose).
  const takenRecordIds = rawDoses
    .map((d) => d.taken_record_id)
    .filter((v): v is string => !!v);
  let takenDateById: Record<string, string> = {};
  if (takenRecordIds.length > 0) {
    const { data: takenRecs } = await supabase
      .from("vaccination_records")
      .select("id, administered_date")
      .in("id", takenRecordIds);
    if (takenRecs) {
      takenDateById = Object.fromEntries(
        takenRecs.map((r) => [r.id as string, r.administered_date as string]),
      );
    }
  }

  const doses: VaccineDoseStatus[] = rawDoses.map((d) => ({
    id: d.id,
    vaccineId: d.vaccine_id,
    vaccineCode: d.vaccine_catalog.code,
    vaccineName: d.vaccine_catalog.name,
    doseNumber: d.dose_number,
    doseLabel: d.vaccine_schedule_rules.dose_label,
    status: d.status,
    dueDate: d.due_date,
    validUntilDate: d.valid_until_date,
    overdueDays: d.overdue_days,
    takenRecordId: d.taken_record_id,
    takenDate: d.taken_record_id ? takenDateById[d.taken_record_id] ?? null : null,
    ruleNetwork: d.vaccine_schedule_rules.network,
    isBooster: d.vaccine_schedule_rules.is_booster,
  }));

  // Agrupa por bucket de idade pra timeline
  const buckets: Record<string, VaccineDoseStatus[]> = {};
  doses.forEach((d, i) => {
    const meta = rawDoses[i];
    const ageMonths = meta.vaccine_schedule_rules.recommended_age_months;
    const isAnnual = meta.vaccine_catalog.is_annual;
    const key = bucketForAge(ageMonths, isAnnual);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(d);
  });

  const timelineByAge: TimelineGroup[] = BUCKET_ORDER
    .filter((b) => buckets[b]?.length)
    .map((b) => ({ ageBucket: b, doses: buckets[b] }));

  const coverage = coverageRes.data;
  const rawTaken = (coverage?.total_taken as number) ?? 0;
  const rawOverdue = (coverage?.overdue_count as number) ?? 0;
  const rawDueSoon = (coverage?.due_soon_count as number) ?? 0;
  const rawHistoricalGap = (coverage?.historical_gap_count as number) ?? 0;

  // F#42 (E2E PRD 2026-05-25) — quando a criança AINDA NÃO TEM NENHUM
  // registro vacinal (taken=0), o motor PNI classifica doses passadas
  // pela idade como overdue/due_soon. Isso gerava UI contraditória:
  // "Lucas está bem" + "1 reforço pendente: COVID-19 hoje" lado-a-lado.
  // Fix: reclassifica essas counts como historicalGap até o user
  // adicionar a primeira vacina. A label "Complete o histórico" assume
  // o lugar do alerta "X pendente", em linha com o design calm-status.
  const isEmptyHistory = rawTaken === 0;
  const totals = {
    recommended: (coverage?.total_recommended as number) ?? 0,
    taken: rawTaken,
    overdue: isEmptyHistory ? 0 : rawOverdue,
    dueSoon: isEmptyHistory ? 0 : rawDueSoon,
    upcoming: (coverage?.upcoming_count as number) ?? 0,
    historicalGap: isEmptyHistory ? rawHistoricalGap + rawOverdue + rawDueSoon : rawHistoricalGap,
    outOfWindow: (coverage?.out_of_window_count as number) ?? 0,
  };

  // Filtro de dismissals (snooze per-user). Só aplica quando o caller
  // passa userId (UI live) — export/relatório/admin recebe tudo.
  let dismissedKey: Set<string> | null = null;
  if (userId) {
    const nowIso = new Date().toISOString();
    const { data: dismissals } = await supabase
      .from("vaccine_notification_dismissals")
      .select("vaccine_id, dose_number")
      .eq("user_id", userId)
      .eq("child_id", childId)
      .gt("dismissed_until", nowIso);
    if (dismissals && dismissals.length > 0) {
      dismissedKey = new Set(
        (dismissals as Array<{ vaccine_id: string; dose_number: number }>).map(
          (d) => `${d.vaccine_id}:${d.dose_number}`,
        ),
      );
    }
  }
  const isDismissed = (d: VaccineDoseStatus): boolean =>
    !!dismissedKey && dismissedKey.has(`${d.vaccineId}:${d.doseNumber}`);

  const overdueList = doses.filter((d) => d.status === "overdue" && !isDismissed(d));
  const dueSoonList = doses.filter((d) => d.status === "due_soon" && !isDismissed(d));

  // Ajusta totais pra refletir filtro (statusLabel + hero + tile precisam ver
  // a contagem efetiva, senão "1 reforço pendente" persiste mesmo após snooze).
  if (dismissedKey) {
    totals.overdue = overdueList.length;
    totals.dueSoon = dueSoonList.length;
  }

  // nextDue da view também precisa respeitar dismissal — senão hero diz
  // "Próxima: BCG (1ª dose)" enquanto a UI omite o card correspondente.
  const nextDueRaw = coverage?.next_due_dose_id
    ? {
        doseId: coverage.next_due_dose_id as string,
        vaccineName: coverage.next_due_vaccine_name as string,
        dueDate: coverage.next_due_date as string,
      }
    : null;
  let nextDue = nextDueRaw;
  if (nextDueRaw && dismissedKey) {
    const matchingDose = doses.find((d) => d.id === nextDueRaw.doseId);
    if (matchingDose && isDismissed(matchingDose)) {
      // Acha próximo overdue/due_soon não dispensado pela ordem de due_date
      const fallback = [...overdueList, ...dueSoonList].sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate),
      )[0];
      nextDue = fallback
        ? { doseId: fallback.id, vaccineName: fallback.vaccineName, dueDate: fallback.dueDate }
        : null;
    }
  }

  const result: VaccineStatusResult = {
    childId,
    coveragePct: (coverage?.coverage_pct as number) ?? 0,
    statusLabel: buildStatusLabel(totals),
    totals,
    nextDue,
    overdue: overdueList,
    dueSoon: dueSoonList,
    upcoming: doses.filter((d) => d.status === "upcoming"),
    taken: doses.filter((d) => d.status === "taken"),
    historicalGaps: doses.filter((d) => d.status === "historical_gap"),
    timelineByAge,
  };

  return { ok: true, data: result };
}

/* ------------------------------------------------------------------ */
/* Public: inferCatalogMatch                                          */
/* ------------------------------------------------------------------ */

/**
 * Fuzzy match de nome livre contra catálogo. Server-side via similarity()
 * (pg_trgm). Threshold empírico 0.4. Reusada pelo form autocomplete e
 * pelo OCR (Fase 2). Retorna até 5 candidatos ordenados.
 */
export async function inferCatalogMatch(
  supabase: SupabaseClient,
  name: string,
): Promise<ServiceResult<Array<{ id: string; code: string; name: string; similarity: number }>>> {
  const q = (name || "").trim();
  if (q.length < 2) {
    return { ok: true, data: [] };
  }
  // Query via RPC seria ideal pra usar similarity() ordering, mas catálogo é
  // pequeno (21 linhas) → faz client-side ranking. Server filter por aliases ANY.
  const { data, error } = await supabase
    .from("vaccine_catalog")
    .select("id, code, name, aliases")
    .eq("country_code", "BR")
    .limit(50);
  if (error) return { ok: false, error: error.message, status: 500 };

  const qLower = q.toLowerCase();
  const ranked = (data || [])
    .map((row) => {
      const aliases = (row.aliases as string[]) || [];
      const nameSim = naiveSimilarity(qLower, (row.name as string).toLowerCase());
      const bestAlias = aliases.reduce(
        (best, a) => Math.max(best, naiveSimilarity(qLower, a.toLowerCase())),
        0,
      );
      return {
        id: row.id as string,
        code: row.code as string,
        name: row.name as string,
        similarity: Math.max(nameSim, bestAlias),
      };
    })
    .filter((r) => r.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  return { ok: true, data: ranked };
}

/**
 * Trigram-style similarity rough implementation pra ranking client-side.
 * Não é IGUAL ao pg_trgm.similarity, mas suficiente pra ordenar candidatos
 * quando o catálogo já foi filtrado server-side.
 */
function naiveSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const trigrams = (s: string) => {
    const padded = `  ${s}  `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    return set;
  };
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  return inter / Math.max(ta.size, tb.size);
}

/* ------------------------------------------------------------------ */
/* Public: recordVaccination                                           */
/* ------------------------------------------------------------------ */

/**
 * Insere registro de vacinação:
 *  1. Verifica membership (RLS já fará, mas erro mais limpo aqui).
 *  2. Resolve `catalog_id` se não veio (fuzzy contra catalog).
 *  3. Infere `dose_number` se não veio — conta registros anteriores
 *     da mesma vacina OU do mesmo `equivalence_group` da criança.
 *  4. Detecta duplicata — mesma criança + catalog (ou grupo equivalente)
 *     + dose_number. Sem `forceDuplicate=true`, retorna warning sem inserir.
 *  5. INSERT. Trigger `trg_vaccination_records_recompute` regenera
 *     `vaccine_recommended_doses` automaticamente (banco como SoT).
 *
 * Push pro coparente é responsabilidade do CALLER (action / route)
 * via `notifySaudeCreate({recordType:'vaccination_record',...})` —
 * pra ter acesso a `actorFirstName`/`childFirstName` resolvidos
 * server-side. Service só retorna os ids/metadados.
 */
export async function recordVaccination(
  supabase: SupabaseClient,
  input: RecordVaccinationInput,
): Promise<ServiceResult<{
  id: string;
  catalogId: string | null;
  doseNumber: number | null;
  warning?: "duplicate_dose";
  equivalenceMatch?: boolean;
  inferredDose?: boolean;
}>> {
  const vaccineName = (input.vaccineName || "").trim();
  if (!vaccineName) {
    return { ok: false, error: "Nome da vacina obrigatório.", status: 400 };
  }
  if (!input.administeredDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.administeredDate)) {
    return { ok: false, error: "Data da aplicação inválida.", status: 400 };
  }

  const membership = await verifyChildMembership(supabase, input.childId, input.createdBy);
  if (!membership.ok) return membership;
  if (membership.groupId !== input.groupId) {
    return { ok: false, error: "groupId não bate com a criança.", status: 403 };
  }

  // 1. Resolve catalog_id se não veio
  type CatalogEntry = { id: string; code: string; equivalence_group: string | null };
  let catalogId = input.catalogId ?? null;
  let catalogEntry: CatalogEntry | null = null;

  if (catalogId) {
    const { data } = await supabase
      .from("vaccine_catalog")
      .select("id, code, equivalence_group")
      .eq("id", catalogId)
      .maybeSingle();
    if (data) catalogEntry = data as CatalogEntry;
  } else {
    // Fuzzy match
    const matches = await inferCatalogMatch(supabase, vaccineName);
    if (matches.ok && matches.data.length > 0 && matches.data[0].similarity > 0.55) {
      catalogId = matches.data[0].id;
      const { data } = await supabase
        .from("vaccine_catalog")
        .select("id, code, equivalence_group")
        .eq("id", catalogId)
        .maybeSingle();
      if (data) catalogEntry = data as CatalogEntry;
    }
  }

  // 2. Infere dose_number se não veio E se conseguimos resolver catalog
  let doseNumber = input.doseNumber ?? null;
  let inferredDose = false;
  let equivalenceMatch = false;

  if (catalogEntry && doseNumber === null) {
    const equivalenceGroup = catalogEntry.equivalence_group;

    if (equivalenceGroup) {
      // Conta doses anteriores de qualquer vacina do grupo equivalente
      const { data: priorEq } = await supabase
        .from("vaccination_records")
        .select("id, catalog_id, administered_date, vaccine_catalog!inner(equivalence_group)")
        .eq("child_id", input.childId)
        .eq("vaccine_catalog.equivalence_group", equivalenceGroup)
        .order("administered_date", { ascending: true });
      doseNumber = (priorEq?.length ?? 0) + 1;
      inferredDose = true;
      equivalenceMatch = (priorEq || []).some((p) => p.catalog_id !== catalogId);
    } else {
      const { data: prior } = await supabase
        .from("vaccination_records")
        .select("id, administered_date")
        .eq("child_id", input.childId)
        .eq("catalog_id", catalogEntry.id)
        .order("administered_date", { ascending: true });
      doseNumber = (prior?.length ?? 0) + 1;
      inferredDose = true;
    }
  }

  // 3. Duplicate detection (só se temos catalog + dose)
  let warning: "duplicate_dose" | undefined;
  if (catalogEntry && doseNumber !== null && !input.forceDuplicate) {
    const equivalenceGroup = catalogEntry.equivalence_group;
    if (equivalenceGroup) {
      const { data: existing } = await supabase
        .from("vaccination_records")
        .select("id, catalog_id, dose_number, administered_date, vaccine_catalog!inner(equivalence_group)")
        .eq("child_id", input.childId)
        .eq("vaccine_catalog.equivalence_group", equivalenceGroup)
        .eq("dose_number", doseNumber);
      if (existing && existing.length > 0) {
        warning = "duplicate_dose";
      }
    } else {
      const { data: existing } = await supabase
        .from("vaccination_records")
        .select("id")
        .eq("child_id", input.childId)
        .eq("catalog_id", catalogEntry.id)
        .eq("dose_number", doseNumber);
      if (existing && existing.length > 0) {
        warning = "duplicate_dose";
      }
    }
    if (warning) {
      // Sem forceDuplicate, retorna warning sem inserir.
      return {
        ok: true,
        data: {
          id: "",
          catalogId,
          doseNumber,
          warning,
          equivalenceMatch,
          inferredDose,
        },
      };
    }
  }

  // 4. INSERT
  const { data: inserted, error } = await supabase
    .from("vaccination_records")
    .insert({
      group_id: input.groupId,
      child_id: input.childId,
      vaccine_name: vaccineName.slice(0, 200),
      dose_label: input.doseLabel?.trim().slice(0, 100) || null,
      administered_date: input.administeredDate,
      batch_number: input.batchNumber?.trim().slice(0, 100) || null,
      location: input.location?.trim().slice(0, 200) || null,
      notes: input.notes?.trim().slice(0, 1000) || null,
      catalog_id: catalogId,
      dose_number: doseNumber,
      source: input.source || "manual",
      confidence_score: input.confidenceScore ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message || "Falha ao registrar vacina.", status: 400 };
  }

  captureServerEvent(input.createdBy, "vaccine_marked_taken", {
    source: input.source || "manual",
    inferred_dose_number: inferredDose,
    was_duplicate_warning: false,
    equivalence_match: equivalenceMatch,
    catalog_id: catalogId,
  });

  // ── Integração com calendário Kindar ──
  // Registra a vacina como um evento "vaccine" no calendário compartilhado
  // via `child_activities`. Trigger 00074 (`tg_generate_activity_occurrences`)
  // gera `calendar_occurrences` automaticamente — coparente vê no calendário.
  // Best-effort: falha não impede o registro da vacina.
  try {
    const eventName = catalogEntry
      ? `Vacina: ${vaccineName}${doseNumber ? ` (${doseNumber}ª dose)` : ""}`
      : `Vacina: ${vaccineName}`;
    await supabase.from("child_activities").insert({
      group_id: input.groupId,
      child_id: input.childId,
      name: eventName.slice(0, 200),
      category: "health",
      recurrence_type: "never",
      start_date: input.administeredDate,
      end_date: input.administeredDate,
      is_active: true,
      notes: input.location ? `Local: ${input.location}` : null,
      notify_hours_before: 0, // já aconteceu, sem push pré
      created_by: input.createdBy,
    });
  } catch {
    // best-effort
  }

  return {
    ok: true,
    data: {
      id: inserted.id as string,
      catalogId,
      doseNumber,
      equivalenceMatch,
      inferredDose,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Public: markRecommendedDoseTaken                                    */
/* ------------------------------------------------------------------ */

/**
 * Atalho UI: marcar uma `vaccine_recommended_doses` como tomada.
 *
 * Resolve o vaccine_id + dose_number da recomendação e chama
 * `recordVaccination` com `catalogId` populado (sem fuzzy). Útil pro
 * CTA "Marcar como tomada" dos cards de pendência.
 */
export async function markRecommendedDoseTaken(
  supabase: SupabaseClient,
  input: {
    doseRecommendationId: string;
    createdBy: string;
    administeredDate: string;
    batchNumber?: string | null;
    location?: string | null;
    notes?: string | null;
  },
): Promise<ServiceResult<{ id: string; catalogId: string | null }>> {
  const { data: rec, error } = await supabase
    .from("vaccine_recommended_doses")
    .select(
      "id, child_id, group_id, vaccine_id, dose_number, vaccine_catalog!inner(code, name)",
    )
    .eq("id", input.doseRecommendationId)
    .maybeSingle();
  if (error || !rec) {
    return { ok: false, error: "Recomendação não encontrada.", status: 404 };
  }
  const catalog = (rec.vaccine_catalog as unknown) as { code: string; name: string };
  return recordVaccination(supabase, {
    groupId: rec.group_id as string,
    childId: rec.child_id as string,
    createdBy: input.createdBy,
    vaccineName: catalog.name,
    catalogId: rec.vaccine_id as string,
    doseNumber: rec.dose_number as number,
    administeredDate: input.administeredDate,
    batchNumber: input.batchNumber,
    location: input.location,
    notes: input.notes,
    source: "manual",
    forceDuplicate: false,
  }) as Promise<ServiceResult<{ id: string; catalogId: string | null }>>;
}

/* ------------------------------------------------------------------ */
/* Public: dismissPendingDose (snooze)                                 */
/* ------------------------------------------------------------------ */

const SNOOZE_DAYS: Record<DismissDoseInput["reason"], number> = {
  snoozed_7d: 7,
  snoozed_30d: 30,
  already_scheduled: 30,
  // Pediatra recomendou não dar: dispensa longa (1 ano) sem push de
  // reentrada. Ao expirar, motor reabre pra revalidação — recomendações
  // clínicas mudam com idade, calendário, situação imunológica etc.
  medical_advice: 365,
};

export async function dismissPendingDose(
  supabase: SupabaseClient,
  input: DismissDoseInput,
): Promise<ServiceResult<{ id: string; dismissedUntil: string }>> {
  const membership = await verifyChildMembership(supabase, input.childId, input.userId);
  if (!membership.ok) return membership;

  const days = SNOOZE_DAYS[input.reason];
  const dismissedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("vaccine_notification_dismissals")
    .upsert(
      {
        user_id: input.userId,
        child_id: input.childId,
        vaccine_id: input.vaccineId,
        dose_number: input.doseNumber,
        dismissed_until: dismissedUntil,
        reason: input.reason,
      },
      { onConflict: "user_id,child_id,vaccine_id,dose_number" },
    )
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "Falha ao adiar lembrete.", status: 400 };
  }

  captureServerEvent(input.userId, "vaccine_pending_dismissed", {
    snooze_reason: input.reason,
    snooze_window_days: days,
  });

  return { ok: true, data: { id: data.id as string, dismissedUntil } };
}

/* ------------------------------------------------------------------ */
/* Public: setVaccinationCalendarPreference                            */
/* ------------------------------------------------------------------ */

export async function setVaccinationCalendarPreference(
  supabase: SupabaseClient,
  input: SetCalendarPreferenceInput,
): Promise<ServiceResult<{ childId: string; preference: CalendarPreference }>> {
  if (!["public", "private", "both"].includes(input.preference)) {
    return { ok: false, error: "Preferência inválida.", status: 400 };
  }
  const membership = await verifyChildMembership(supabase, input.childId, input.actorUserId);
  if (!membership.ok) return membership;

  const { error } = await supabase
    .from("children")
    .update({ vaccination_calendar_preference: input.preference })
    .eq("id", input.childId);

  if (error) return { ok: false, error: error.message, status: 400 };

  captureServerEvent(input.actorUserId, "vaccine_calendar_preference_changed", {
    preference: input.preference,
  });

  return { ok: true, data: { childId: input.childId, preference: input.preference } };
}

/* ------------------------------------------------------------------ */
/* updateVaccinationRecord — editar registro existente                 */
/* ------------------------------------------------------------------ */

export interface UpdateVaccinationInput {
  recordId: string;
  actorUserId: string;
  vaccineName?: string;
  doseLabel?: string | null;
  administeredDate?: string;
  batchNumber?: string | null;
  location?: string | null;
  notes?: string | null;
  catalogId?: string | null;
  doseNumber?: number | null;
}

export async function updateVaccinationRecord(
  supabase: SupabaseClient,
  input: UpdateVaccinationInput,
): Promise<ServiceResult<{ id: string }>> {
  // Quando chamado via admin client (Native Bearer), RLS não filtra — validamos
  // membership manualmente via actorUserId + group_members.
  const { data: existing } = await supabase
    .from("vaccination_records")
    .select("id, child_id, group_id")
    .eq("id", input.recordId)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "Registro não encontrado.", status: 404 };
  }
  const { data: member } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", existing.group_id as string)
    .eq("user_id", input.actorUserId)
    .maybeSingle();
  if (!member) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }

  // Patch apenas campos enviados — preserva resto.
  const patch: Record<string, unknown> = {};
  if (input.vaccineName !== undefined) patch.vaccine_name = input.vaccineName.trim().slice(0, 200);
  if (input.doseLabel !== undefined) patch.dose_label = input.doseLabel?.trim().slice(0, 100) || null;
  if (input.administeredDate !== undefined) patch.administered_date = input.administeredDate;
  if (input.batchNumber !== undefined) patch.batch_number = input.batchNumber?.trim().slice(0, 100) || null;
  if (input.location !== undefined) patch.location = input.location?.trim().slice(0, 200) || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim().slice(0, 2000) || null;
  if (input.catalogId !== undefined) patch.catalog_id = input.catalogId;
  if (input.doseNumber !== undefined) patch.dose_number = input.doseNumber;

  if (Object.keys(patch).length === 0) {
    return { ok: true, data: { id: input.recordId } };
  }

  const { error } = await supabase
    .from("vaccination_records")
    .update(patch)
    .eq("id", input.recordId);
  if (error) return { ok: false, error: error.message, status: 400 };

  captureServerEvent(input.actorUserId, "vaccine_record_edited", {
    record_id: input.recordId,
    fields_changed: Object.keys(patch),
  });

  // Trigger trg_vaccination_records_recompute roda automaticamente após UPDATE.
  return { ok: true, data: { id: input.recordId } };
}

/* ------------------------------------------------------------------ */
/* deleteVaccinationRecord — excluir registro + recompute              */
/* ------------------------------------------------------------------ */

export interface DeleteVaccinationInput {
  recordId: string;
  actorUserId: string;
}

export async function deleteVaccinationRecord(
  supabase: SupabaseClient,
  input: DeleteVaccinationInput,
): Promise<ServiceResult<{ id: string; childId: string }>> {
  // Mesmo pattern do update — admin client + validação manual via actorUserId.
  const { data: existing } = await supabase
    .from("vaccination_records")
    .select("id, child_id, group_id, vaccine_name")
    .eq("id", input.recordId)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "Registro não encontrado.", status: 404 };
  }
  const { data: member } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", existing.group_id as string)
    .eq("user_id", input.actorUserId)
    .maybeSingle();
  if (!member) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }

  const { error } = await supabase
    .from("vaccination_records")
    .delete()
    .eq("id", input.recordId);
  if (error) return { ok: false, error: error.message, status: 400 };

  captureServerEvent(input.actorUserId, "vaccine_record_deleted", {
    record_id: input.recordId,
    vaccine_name: existing.vaccine_name,
  });

  // Trigger trg_vaccination_records_recompute reabre pendência (taken → overdue/due_soon).
  return {
    ok: true,
    data: { id: input.recordId, childId: existing.child_id as string },
  };
}
