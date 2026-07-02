/* ------------------------------------------------------------------ */
/* services/brain.ts — porta do Kindar Brain (I/O + estado, Regra 11)    */
/*                                                                      */
/* Os estágios PUROS vivem em src/lib/ai/brain/*. Aqui mora o I/O: visão, */
/* storage, RPCs de transição, persistência. processIntake NÃO mexe na   */
/* conversa de chat (runAssistantTurn segue intocado).                   */
/*                                                                      */
/*  analyzeIntakeImage: begin_analysis → visão → playbook.parse →        */
/*    plano → dedup → impacto → prioridade → plan_hash → salva preview.  */
/*  confirmIntake: valida limites → monta payloads → execute_plan (RPC   */
/*    atômica: claim + materializa + outbox + proveniência + executed).  */
/*                                                                      */
/* Os RPCs usam o client do USUÁRIO (createClient) pra auth.uid() casar  */
/* is_group_member e gravar confirmed_by corretamente. O texto bruto da  */
/* visão NUNCA é persistido cru — só o dado estruturado (e logs passam   */
/* por sanitizeRawTextForLog).                                           */
/* ------------------------------------------------------------------ */

import { randomUUID, createHash } from "crypto";
import type { createClient } from "@/lib/supabase/server";
import { compressImageForVision } from "@/lib/ai/image-utils";
import { routeVisionRequest, routeTextRequest } from "@/lib/ai/router";
import type { AIChatMessage } from "@/lib/ai/core/types";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { getPlaybook } from "@/lib/ai/brain/understanding/registry";
import { analyzeImpact, type ExistingOccurrence } from "@/lib/ai/brain/impact";
import { prioritize } from "@/lib/ai/brain/prioritize";
import { dedupeWithinPlan, partitionAgainstExisting } from "@/lib/ai/brain/dedupe";
import { resolveChildIdFromText } from "@/lib/ai/brain/child-match";
import { computePlanHash } from "@/lib/ai/brain/plan-hash";
import { validatePlanForExecution } from "@/lib/ai/brain/validate-plan";
import { buildSchoolLogPayloads, buildOutboxPayloads, selectActivitiesByIndex, applyActivityEdits, type ActivityEdit } from "@/lib/ai/brain/materialize-payload";
import { buildHealthPayloads, buildHealthOutboxPayloads } from "@/lib/ai/brain/materialize-health-payload";
import { validateHealthPlanForExecution } from "@/lib/ai/brain/validate-health-plan";
import {
  healthPlanProbe,
  healthAppointmentKey,
  healthMedicationKey,
  isFullHealthDuplicate,
  type ExistingHealthSnapshot,
} from "@/lib/ai/brain/health-dedupe";
import { timestamptzToBrazilDateKey } from "@/lib/calendar-utils";
import { sanitizeForLogPreview } from "@/lib/ai/brain/sanitize-log";
import { captureServerEvent } from "@/lib/posthog-server";
import type {
  BrainChild,
  DocType,
  IntakeChannel,
  IntakePreview,
  IntakeResult,
  IntakeSource,
  MaterializationPlan,
  PlaybookContext,
} from "@/lib/ai/brain/types";

const FILE = "src/lib/services/brain.ts";
const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Data de HOJE no timezone do grupo (YYYY-MM-DD). */
function todayInTz(tz: string): string {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: tz });
  } catch {
    return new Date().toLocaleDateString("en-CA", { timeZone: DEFAULT_TIMEZONE });
  }
}

/** Garante um IANA válido (o reminderRule depende disso; IANA inválida
 *  quebraria o agendador silenciosamente). Fallback ao timezone canônico. */
function safeTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Limpa cercas markdown e faz JSON.parse defensivo da saída da visão. */
function parseVisionJson(text: string): unknown {
  let cleaned = (text ?? "").trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(cleaned);
}

/** Janela [min, max] das datas do plano (pra escopar o snapshot de impacto). */
function planDateWindow(plan: MaterializationPlan): { from: string; to: string } | null {
  const dates = (plan.activities ?? []).map((a) => a.startDate).filter(Boolean).sort();
  if (dates.length === 0) return null;
  return { from: dates[0], to: dates[dates.length - 1] };
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** Snapshot escopado: ocorrências já existentes da criança na janela do
 *  plano (a base do detector de impacto). Só a criança + janela — uma
 *  consulta de dezembro não invalida provas de agosto. */
async function loadExistingOccurrences(
  supabase: SupabaseServer,
  childId: string | null,
  window: { from: string; to: string } | null,
): Promise<ExistingOccurrence[]> {
  if (!childId || !window) return [];
  // Provas já existentes da criança na janela (impacto same_day/dias-seguidos é
  // PROVA × PROVA agora — não conta natação/consulta como antes). school_logs é
  // a fonte das provas (o Brain materializa nela).
  const { data, error } = await supabase
    .from("school_logs")
    .select("log_date, child_id, title")
    .eq("child_id", childId)
    .in("log_type", ["exam", "homework"])
    .gte("log_date", window.from)
    .lte("log_date", window.to);
  if (error || !data) return [];
  return data.map((row) => ({
    childId: row.child_id as string | null,
    date: row.log_date as string,
    // Título REAL agora (antes era ""): habilita a dedup de reenvio do mesmo
    // calendário (aluno+data+título) além do impacto same_day.
    title: (row.title as string | null) ?? "",
  }));
}

/** Snapshot de SAÚDE escopado pro dedup de reenvio (espelho do escolar):
 *  consultas/retornos do filho nas datas do plano + medicações nos inícios do
 *  plano. appointment_date é TIMESTAMPTZ → a chave usa a DATA em BRT (mesma
 *  conversão da grade do calendário). Registro desfeito é DELETADO → sai do
 *  snapshot → desfazer e reenviar continua funcionando. */
async function loadExistingHealthSnapshot(
  supabase: SupabaseServer,
  plan: NonNullable<MaterializationPlan["health"]>,
): Promise<ExistingHealthSnapshot> {
  const snapshot: ExistingHealthSnapshot = { appointmentKeys: new Set(), medicationKeys: new Set() };
  const childId = plan.appointment.childId;
  if (!childId) return snapshot;
  const probe = healthPlanProbe(plan);
  const apptDates = [...probe.appointmentDates].sort();
  if (apptDates.length > 0) {
    const { data } = await supabase
      .from("medical_appointments")
      .select("child_id, title, appointment_type, appointment_date")
      .eq("child_id", childId)
      .gte("appointment_date", `${apptDates[0]}T00:00:00-03:00`)
      .lte("appointment_date", `${apptDates[apptDates.length - 1]}T23:59:59-03:00`);
    for (const row of data ?? []) {
      snapshot.appointmentKeys.add(
        healthAppointmentKey(
          row.child_id as string | null,
          timestamptzToBrazilDateKey(row.appointment_date as string),
          (row.appointment_type as string | null) ?? "",
          (row.title as string | null) ?? "",
        ),
      );
    }
  }
  if (probe.medicationStartDates.length > 0) {
    const { data } = await supabase
      .from("active_medications")
      .select("child_id, name, start_date")
      .eq("child_id", childId)
      .in("start_date", probe.medicationStartDates);
    for (const row of data ?? []) {
      snapshot.medicationKeys.add(
        healthMedicationKey(row.child_id as string | null, (row.name as string | null) ?? "", row.start_date as string),
      );
    }
  }
  return snapshot;
}

export interface CreateAndAnalyzeArgs {
  supabase: SupabaseServer;
  groupId: string;
  userId: string;
  /** Canal de origem (pwa | native | whatsapp) — diferencia só a ORIGEM; o
   *  cérebro (análise/plano/impacto) é o mesmo entre os canais. */
  channel: IntakeChannel;
  source?: IntakeSource;
  buffer: Buffer;
  /** MIME REAL já validado por magic bytes pelo caller (jpeg/png/webp). */
  mime: string;
  /** Crianças do grupo (o caller resolve — deve ser não-vazio). */
  children: BrainChild[];
  requestedChildId: string | null;
  /** Playbook a usar. Default 'school_calendar'. O classificador passa
   *  'health_visit' quando a foto é de consulta médica. */
  docType?: DocType;
}

/**
 * Orquestração COMPARTILHADA de intake (PWA, WhatsApp, …): resolve criança +
 * timezone, cria o brain_intake, sobe o original ao bucket e analisa. O caller
 * faz só o que é específico do canal (auth, gate de flag, consentimento,
 * validação de MIME, mensagens de erro). Mantém o cérebro único — a foto cai
 * no MESMO pipeline venha do app ou do WhatsApp.
 */
export async function createAndAnalyzeIntake(args: CreateAndAnalyzeArgs): Promise<IntakeResult> {
  const { supabase, groupId, userId, channel, buffer, mime, children, requestedChildId } = args;
  const source = args.source ?? "document";
  try {
    const resolvedChildId =
      requestedChildId && children.some((c) => c.id === requestedChildId)
        ? requestedChildId
        : children.length === 1
          ? children[0].id
          : null;

    // Criança ambígua (>1 sem escolha): pergunta ANTES de criar o intake ou
    // subir a mídia. Assim o pick re-submete e cria UM só intake — nada de
    // órfão preso em `analyzing` nem intake duplicado por escolha. Ver
    // task_7d0ff951; nenhum caller usa o intakeId deste resultado.
    if (resolvedChildId === null && children.length > 1) {
      return { kind: "needs_child_selection", options: children };
    }

    const { data: groupRow } = await supabase
      .from("coparenting_groups")
      .select("timezone")
      .eq("id", groupId)
      .single();
    const timezone = safeTimezone((groupRow?.timezone as string | undefined) || DEFAULT_TIMEZONE);
    const today = todayInTz(timezone);

    const { data: intake, error: insErr } = await supabase
      .from("brain_intakes")
      .insert({
        group_id: groupId,
        child_id: resolvedChildId,
        created_by: userId,
        source,
        channel,
        status: "uploaded",
        source_sha256: createHash("sha256").update(buffer).digest("hex"),
      })
      .select("id")
      .single();
    if (insErr || !intake) {
      await reportServerError(insErr, { filePath: FILE, metadata: { step: "create_intake", groupId } });
      return { kind: "error", message: "Falha ao iniciar o processamento." };
    }
    const intakeId = intake.id as string;
    captureServerEvent(userId, "brain_intake_uploaded", { intake_id: intakeId, channel, mime });

    // Sobe o original pro bucket privado (group_id como 1ª pasta = RLS).
    const path = `${groupId}/brain-intakes/${intakeId}/source.${EXT[mime] ?? "jpg"}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, buffer, {
      contentType: mime,
      upsert: true,
    });
    if (!upErr) {
      await supabase.from("brain_intakes").update({ source_media_path: path }).eq("id", intakeId);
    } // upload falho é non-fatal: a análise usa o buffer em memória.

    const ctx: PlaybookContext = {
      groupId,
      userId,
      channel,
      today,
      timezone,
      children,
      resolvedChildId,
      schoolYearAnchor: Number(today.slice(0, 4)),
    };
    return await analyzeIntakeImage({ supabase, intakeId, imageBuffer: buffer, ctx, docType: args.docType });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "create_and_analyze", groupId } });
    return { kind: "error", message: "Não consegui processar agora. Tente de novo em instantes." };
  }
}

export interface AnalyzeIntakeArgs {
  supabase: SupabaseServer;
  intakeId: string;
  imageBuffer: Buffer;
  ctx: PlaybookContext;
  /** Playbook a usar. Default 'school_calendar' (path escolar byte-idêntico).
   *  O classificador passa 'health_visit' p/ consulta médica. */
  docType?: DocType;
}

/** Sufixo de referência injetado no prompt de VISÃO por docType. Escolar: ano
 *  letivo (resolve data sem ano). Saúde: hoje (resolve retorno relativo). O
 *  escolar é byte-idêntico ao que era inline. */
function visionReferenceSuffix(docType: DocType, sctx: PlaybookContext): string {
  if (docType === "health_visit") {
    return `\n\n(Referência: hoje é ${sctx.today}. Resolva datas relativas — retorno "em 1 mês", "em 15 dias" — contra a data da consulta ou, na falta, contra hoje; devolva em ISO "AAAA-MM-DD".)`;
  }
  return `\n\nAno letivo de referência (use se o ano não aparecer na imagem): ${sctx.schoolYearAnchor}.`;
}

/**
 * Analisa a foto de um intake já criado: classifica, extrai, planeja e
 * salva o preview aguardando confirmação. Idempotente na corrida via
 * begin_analysis (2ª chamada concorrente → already_processing).
 */
export async function analyzeIntakeImage(args: AnalyzeIntakeArgs): Promise<IntakeResult> {
  const { supabase, intakeId, imageBuffer, ctx } = args;
  const t0 = Date.now();

  try {
    // Criança ambígua bloqueia ANTES do begin_analysis — senão o intake fica
    // preso em `analyzing` (órfão, begin_analysis não reabre 'analyzing'). Em
    // prod createAndAnalyze* já barra antes de criar o intake; este guard é
    // defensivo p/ chamada direta. Ver task_7d0ff951.
    if (ctx.resolvedChildId === null && ctx.children.length > 1) {
      return { kind: "needs_child_selection", intakeId, options: ctx.children };
    }

    // 1. Trava de concorrência: uploaded/analyzed/failed → analyzing.
    const { data: started } = await supabase.rpc("brain_intake_begin_analysis", {
      p_intake_id: intakeId,
      // Ator explícito (WhatsApp usa client service_role → auth.uid() NULL).
      // PWA/Native: auth.uid() vence; este é ignorado. Ver migration 00133.
      p_actor_user_id: ctx.userId,
    });
    if (!started || !(started as { id?: string }).id) {
      return { kind: "already_processing", intakeId };
    }

    // 2. Visão (impura) → saída bruta. docType default = school_calendar → o
    //    caminho escolar é byte-idêntico; saúde/outros vêm do classificador (arg).
    const docType: DocType = args.docType ?? "school_calendar";
    const playbook = getPlaybook(docType);
    if (!playbook) return { kind: "error", message: "Playbook indisponível." };

    // Normaliza o timezone do contexto (IANA válida) antes de planejar.
    const sctx: PlaybookContext = { ...ctx, timezone: safeTimezone(ctx.timezone) };

    const { base64, mimeType } = await compressImageForVision(imageBuffer);
    // Referência injetada na instrução por docType (escolar=ano letivo p/ data
    // sem ano; saúde=hoje p/ retorno relativo). Sem isso o modelo erra a data.
    const userPrompt = `${playbook.extractionPrompt.user}${visionReferenceSuffix(docType, sctx)}`;
    const vision = await routeVisionRequest(
      base64,
      mimeType,
      playbook.extractionPrompt.system,
      userPrompt,
      { temperature: 0.1, maxTokens: 4000 },
    );

    // Estágios 3-6 (parse → plano → dedup intra + histórico → duplicata →
    // impacto → salva preview) são COMPARTILHADOS com o path de texto/áudio
    // (finalizeAnalysis). `playbook.parse` é input-agnóstico. O path de foto só
    // difere na mensagem de parse-error (fala em "imagem"). Ver task_5bae6eab.
    return await finalizeAnalysis({
      supabase,
      intakeId,
      rawText: vision.text,
      provider: vision.provider,
      playbook,
      docType,
      sctx,
      userId: ctx.userId,
      childCount: ctx.children.length,
      t0,
      parseErrorMessage: "Não consegui interpretar a foto. Tente uma imagem mais nítida.",
    });
  } catch (err) {
    // Log SEM PII (a saída da visão pode conter nomes/dados sensíveis).
    await reportServerError(err, {
      filePath: FILE,
      metadata: { step: "analyze", intakeId, note: sanitizeForLogPreview(String(err)) },
    });
    await markFailed(supabase, intakeId, "analyze_exception");
    return { kind: "error", message: "Não consegui processar agora. Tente de novo em instantes." };
  }
}

/**
 * Estágio 3-6 COMPARTILHADO (parse → plano → dedup intra + histórico →
 * impacto → salva preview), a partir da SAÍDA BRUTA do LLM (venha da visão ou
 * do texto). `playbook.parse` é input-agnóstico, então imagem e texto caem
 * aqui. TODO(DRY): fazer `analyzeIntakeImage` também chamar isto (hoje mantém
 * a versão inline pra não mexer no caminho LIVE; ver [[project_kindar_family_inbox_build]]).
 */
async function finalizeAnalysis(p: {
  supabase: SupabaseServer;
  intakeId: string;
  rawText: string;
  provider: string;
  playbook: NonNullable<ReturnType<typeof getPlaybook>>;
  docType: DocType;
  sctx: PlaybookContext;
  userId: string;
  childCount: number;
  t0: number;
  /** Mensagem de erro quando o parse falha — o path de FOTO usa uma variante
   *  que fala em "imagem mais nítida". Default = variante de texto/áudio. */
  parseErrorMessage?: string;
}): Promise<IntakeResult> {
  const { supabase, intakeId, rawText, provider, playbook, docType, sctx, userId, childCount, t0 } = p;

  // 3. Parse + validação estrita do schema (fora do schema é descartado).
  let raw: unknown;
  try {
    raw = parseVisionJson(rawText);
  } catch {
    await markFailed(supabase, intakeId, "vision_parse_error");
    captureServerEvent(userId, "brain_intake_extraction_failed", { intake_id: intakeId, error_type: "vision_parse_error", provider });
    return {
      kind: "error",
      message: p.parseErrorMessage ?? "Não consegui interpretar agora. Tente reformular ou mandar uma foto mais nítida.",
    };
  }

  const data = playbook.parse(raw, sctx);
  if (!data) {
    await supabase
      .from("brain_intakes")
      .update({ status: "failed", error: "unknown_document", doc_type: "unknown_document", analysis_provider: provider, analyzed_at: new Date().toISOString() })
      .eq("id", intakeId);
    captureServerEvent(userId, "brain_intake_extraction_failed", { intake_id: intakeId, doc_type: "unknown_document", error_type: "unrecognized", provider });
    return { kind: "unknown_document", intakeId, message: "Não tenho certeza do que é. Quer que eu procure datas de provas?" };
  }

  const skippedLines = (data as { skipped?: number }).skipped ?? 0;
  if (skippedLines > 0) {
    captureServerEvent(userId, "brain_intake_lines_skipped", { intake_id: intakeId, skipped_count: skippedLines, doc_type: docType });
  }

  // 4. Plano + dedup intra-plano + dedup contra histórico + impacto + prioridade.
  const planned = playbook.plan(data, sctx);

  // Dedup de SAÚDE contra o histórico (espelho do escolar abaixo): o MESMO
  // relato reenviado não pode virar segunda consulta/retorno/medicação nem
  // segunda notificação pro coparente. Só duplicata INTEGRAL bloqueia —
  // qualquer componente novo segue pro preview (pode ser complemento).
  if (planned.health) {
    const existingHealth = await loadExistingHealthSnapshot(supabase, planned.health);
    if (isFullHealthDuplicate(planned.health, existingHealth)) {
      await supabase
        .from("brain_intakes")
        .update({ status: "failed", error: "duplicate", doc_type: docType, analysis_provider: provider, analyzed_at: new Date().toISOString() })
        .eq("id", intakeId)
        .eq("status", "analyzing");
      captureServerEvent(userId, "brain_intake_duplicate_all", { intake_id: intakeId, doc_type: docType, count: 1 });
      return {
        kind: "duplicate",
        intakeId,
        priorIntakeId: intakeId,
        message: "Essa consulta já está registrada no Kindar 🙂. Nada a adicionar.",
      };
    }
  }

  const { unique, dropped } = dedupeWithinPlan(planned.activities ?? []);
  if (dropped.length > 0) {
    captureServerEvent(userId, "brain_intake_duplicate_detected", { intake_id: intakeId, dropped_count: dropped.length });
  }

  const window = planDateWindow({ ...planned, activities: unique });
  const existing = await loadExistingOccurrences(supabase, sctx.resolvedChildId, window);

  const { fresh, duplicates } = partitionAgainstExisting(unique, existing);
  if (fresh.length === 0 && duplicates.length > 0) {
    await supabase
      .from("brain_intakes")
      .update({ status: "failed", error: "duplicate", doc_type: docType, analysis_provider: provider, analyzed_at: new Date().toISOString() })
      .eq("id", intakeId)
      .eq("status", "analyzing");
    captureServerEvent(userId, "brain_intake_duplicate_all", { intake_id: intakeId, count: duplicates.length });
    const one = duplicates.length === 1;
    return {
      kind: "duplicate",
      intakeId,
      priorIntakeId: intakeId,
      message: one ? "Essa prova já está no Kindar 🙂. Nada a adicionar." : "Essas provas já estão no Kindar 🙂. Nada a adicionar.",
    };
  }
  if (duplicates.length > 0) {
    captureServerEvent(userId, "brain_intake_duplicate_partial", { intake_id: intakeId, already: duplicates.length, fresh: fresh.length });
  }

  const plan: MaterializationPlan = { ...planned, activities: fresh };
  const impacts = analyzeImpact(plan, existing);
  const priority = prioritize(plan, sctx.today);

  const planHash = computePlanHash({ plan, playbookVersion: playbook.playbookVersion, policyVersion: playbook.policyVersion });
  const confirmationToken = randomUUID();
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();

  const { error: saveErr } = await supabase
    .from("brain_intakes")
    .update({
      status: "awaiting_confirmation",
      doc_type: docType,
      extracted: data,
      impacts,
      plan,
      plan_hash: planHash,
      plan_version: 1,
      playbook_version: playbook.playbookVersion,
      policy_version: playbook.policyVersion,
      analysis_provider: provider,
      confirmation_token: confirmationToken,
      confirmation_expires_at: expiresAt,
      analyzed_at: new Date().toISOString(),
    })
    .eq("id", intakeId)
    .eq("status", "analyzing");
  if (saveErr) {
    await reportServerError(saveErr, { filePath: FILE, metadata: { step: "save_analysis", intakeId } });
    return { kind: "error", message: "Falha ao salvar a análise." };
  }

  const activityCount = plan.activities?.length ?? 0;
  const needsReview = (plan.activities ?? []).some((a) => (a.lowConfidenceFields?.length ?? 0) > 0);
  captureServerEvent(userId, "brain_intake_analyzed", {
    intake_id: intakeId,
    doc_type: docType,
    child_count: childCount,
    artifact_count: activityCount,
    confidence_level: needsReview ? "needs_review" : "high",
    provider,
    latency_ms: Date.now() - t0,
  });
  captureServerEvent(userId, "brain_intake_preview_shown", { intake_id: intakeId, doc_type: docType });

  const preview: IntakePreview = {
    intakeId,
    docType,
    confirmation: plan.confirmation,
    plan,
    impacts,
    priority,
    planHash,
    confirmationToken,
    alreadyPresent: duplicates.length > 0 ? duplicates.length : undefined,
  };
  return { kind: "preview", preview };
}

export interface AnalyzeIntakeTextArgs {
  supabase: SupabaseServer;
  intakeId: string;
  /** Texto do responsável (digitado ou transcrição de áudio). */
  text: string;
  ctx: PlaybookContext;
  /** Playbook a usar. Default 'school_calendar' (path escolar byte-idêntico). */
  docType?: DocType;
}

/** Sufixo de referência do prompt de TEXTO por docType. Escolar byte-idêntico. */
function textReferenceSuffix(docType: DocType, sctx: PlaybookContext): string {
  if (docType === "health_visit") {
    return `(Referência: hoje é ${sctx.today}. Resolva datas relativas — retorno "em 1 mês" etc. — contra a data da consulta ou hoje, em ISO "AAAA-MM-DD".)`;
  }
  return `(Referência: hoje é ${sctx.today}; ano letivo ${sctx.schoolYearAnchor}. Resolva datas relativas ou sem ano contra isso.)`;
}

/**
 * Analisa um intake de TEXTO (assistente/áudio): begin_analysis → extração por
 * texto (mesmo schema da visão) → finalizeAnalysis (fluxo compartilhado).
 * Mesmo cérebro do documento — só a origem da saída bruta muda.
 */
export async function analyzeIntakeText(args: AnalyzeIntakeTextArgs): Promise<IntakeResult> {
  const { supabase, intakeId, text, ctx } = args;
  const t0 = Date.now();
  try {
    // Ambígua ANTES do begin_analysis (evita órfão em 'analyzing'). Ver
    // task_7d0ff951; createAndAnalyzeText já barra antes de criar o intake.
    if (ctx.resolvedChildId === null && ctx.children.length > 1) {
      return { kind: "needs_child_selection", intakeId, options: ctx.children };
    }

    const { data: started } = await supabase.rpc("brain_intake_begin_analysis", {
      p_intake_id: intakeId,
      p_actor_user_id: ctx.userId,
    });
    if (!started || !(started as { id?: string }).id) return { kind: "already_processing", intakeId };

    const docType: DocType = args.docType ?? "school_calendar";
    const playbook = getPlaybook(docType);
    if (!playbook?.textExtractionPrompt) return { kind: "error", message: "Playbook indisponível." };
    const sctx: PlaybookContext = { ...ctx, timezone: safeTimezone(ctx.timezone) };

    // O texto do usuário entra como CONTEÚDO (dado não confiável) — o prompt de
    // sistema já barra prompt-injection; datas relativas resolvem contra hoje.
    const userPrompt =
      `${playbook.textExtractionPrompt.user}\n${text}\n\n` + textReferenceSuffix(docType, sctx);
    const messages: AIChatMessage[] = [
      { role: "system", content: playbook.textExtractionPrompt.system },
      { role: "user", content: userPrompt },
    ];
    const result = await routeTextRequest(messages, { temperature: 0.1, maxTokens: 2000 });

    return await finalizeAnalysis({
      supabase,
      intakeId,
      rawText: result.text,
      provider: result.provider,
      playbook,
      docType,
      sctx,
      userId: ctx.userId,
      childCount: ctx.children.length,
      t0,
    });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "analyze_text", intakeId, note: sanitizeForLogPreview(String(err)) } });
    await markFailed(supabase, intakeId, "analyze_exception");
    return { kind: "error", message: "Não consegui processar agora. Tente de novo em instantes." };
  }
}

export interface CreateAndAnalyzeTextArgs {
  supabase: SupabaseServer;
  groupId: string;
  userId: string;
  channel: IntakeChannel;
  /** "message" (digitado) | "audio" (transcrito). Default "message". */
  source?: Extract<IntakeSource, "message" | "audio">;
  text: string;
  children: BrainChild[];
  requestedChildId: string | null;
  /** Playbook a usar. Default 'school_calendar'. 'health_visit' p/ consulta. */
  docType?: DocType;
}

/**
 * Orquestração COMPARTILHADA de intake por TEXTO (assistente, WhatsApp áudio…):
 * resolve criança + timezone, cria o brain_intake (source 'message'/'audio',
 * sem mídia) e analisa. Espelha `createAndAnalyzeIntake` sem o upload de buffer.
 */
export async function createAndAnalyzeText(args: CreateAndAnalyzeTextArgs): Promise<IntakeResult> {
  const { supabase, groupId, userId, channel, text, children, requestedChildId } = args;
  const source = args.source ?? "message";
  try {
    const resolvedChildId =
      requestedChildId && children.some((c) => c.id === requestedChildId)
        ? requestedChildId
        : children.length === 1
          ? children[0].id
          : // Nome citado no próprio texto ("Otto tem prova…") resolve sem
            // perguntar — só se exatamente 1 criança bate (senão null → pergunta).
            resolveChildIdFromText(text, children);

    // Ambígua: pergunta ANTES de criar o intake (sem órfão / sem duplicado).
    // Ver task_7d0ff951; espelha createAndAnalyzeIntake.
    if (resolvedChildId === null && children.length > 1) {
      return { kind: "needs_child_selection", options: children };
    }

    const { data: groupRow } = await supabase.from("coparenting_groups").select("timezone").eq("id", groupId).single();
    const timezone = safeTimezone((groupRow?.timezone as string | undefined) || DEFAULT_TIMEZONE);
    const today = todayInTz(timezone);

    const { data: intake, error: insErr } = await supabase
      .from("brain_intakes")
      .insert({
        group_id: groupId,
        child_id: resolvedChildId,
        created_by: userId,
        source,
        channel,
        status: "uploaded",
        source_sha256: createHash("sha256").update(text).digest("hex"),
      })
      .select("id")
      .single();
    if (insErr || !intake) {
      await reportServerError(insErr, { filePath: FILE, metadata: { step: "create_intake_text", groupId } });
      return { kind: "error", message: "Falha ao iniciar o processamento." };
    }
    const intakeId = intake.id as string;
    captureServerEvent(userId, "brain_intake_uploaded", { intake_id: intakeId, channel, mime: "text/plain" });

    const ctx: PlaybookContext = {
      groupId,
      userId,
      channel,
      today,
      timezone,
      children,
      resolvedChildId,
      schoolYearAnchor: Number(today.slice(0, 4)),
    };
    return await analyzeIntakeText({ supabase, intakeId, text, ctx, docType: args.docType });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "create_and_analyze_text", groupId } });
    return { kind: "error", message: "Não consegui processar agora. Tente de novo em instantes." };
  }
}

async function markFailed(supabase: SupabaseServer, intakeId: string, reason: string): Promise<void> {
  try {
    await supabase.from("brain_intakes").update({ status: "failed", error: reason }).eq("id", intakeId);
  } catch {
    /* non-fatal */
  }
}

export interface ConfirmIntakeArgs {
  supabase: SupabaseServer;
  intakeId: string;
  planHash: string;
  confirmationToken: string;
  /** Índices das atividades do plano que o usuário MANTEVE (deseleção no
   *  preview). Ausente = todas. O plan_hash guarda o contexto do plano
   *  salvo; a seleção é um subconjunto do que o usuário viu. */
  keepIndices?: number[];
  /** Edições por item no preview (título/matéria/data/hora/conteúdo), por
   *  índice na lista ORIGINAL do plano salvo. Aplicadas ANTES da seleção; o
   *  plan_hash ainda valida que o intake não foi reanalisado no servidor. */
  edits?: ActivityEdit[];
  /** Ator EXPLÍCITO (canais sem JWT, ex: WhatsApp com client service_role).
   *  Ausente (PWA/Native) → cai no auth.uid() do client do usuário. A RPC
   *  usa coalesce(auth.uid(), este) — auth.uid() sempre vence quando existe,
   *  então este só é confiado sob service_role. Ver migration 00132. */
  actorUserId?: string;
}

/**
 * Confirma e materializa uma CONSULTA (docType health_visit): valida o plano de
 * saúde, monta os payloads (consulta completed + retorno scheduled + episódio +
 * medicações) e chama a RPC atômica execute_health_plan. A0 confirma a cena
 * inteira (sem deseleção por item — refino posterior). Ator explícito p/ WhatsApp.
 */
async function confirmHealthVisit(args: {
  supabase: SupabaseServer;
  intakeId: string;
  planHash: string;
  confirmationToken: string;
  savedPlan: MaterializationPlan;
  actorId: string;
  actorUserId?: string;
  recipientIds: string[];
  today: string;
}): Promise<IntakeResult> {
  const { supabase, intakeId, planHash, confirmationToken, savedPlan, actorId, recipientIds, today } = args;
  if (!savedPlan.health) {
    return { kind: "error", message: "Não há nada para confirmar neste item." };
  }

  // Revalida no app ANTES da RPC (UUID/ISO/horizonte/enums; dose NÃO é exigida
  // — transportador). É o guard que a RPC assume (casts crus + plan_hash).
  const validation = validateHealthPlanForExecution(savedPlan, today);
  if (!validation.ok) {
    await reportServerError(new Error("health_plan_validation_failed"), {
      filePath: FILE,
      metadata: { step: "confirm_health_validate", intakeId, errors: validation.errors },
    });
    return { kind: "error", message: "A consulta tem itens inválidos. Revise antes de confirmar." };
  }

  const payloads = buildHealthPayloads(savedPlan)!;
  const outbox = buildHealthOutboxPayloads({
    intakeId,
    recipientIds,
    childId: savedPlan.health.appointment.childId,
    appointmentTitle: savedPlan.health.appointment.title,
    medicationCount: payloads.medications.length,
    hasFollowUp: savedPlan.health.followUp != null,
  });

  const { data: result, error: rpcErr } = await supabase.rpc("brain_intake_execute_health_plan", {
    p_intake_id: intakeId,
    p_plan_hash: planHash,
    p_token: confirmationToken,
    p_appointments: payloads.appointments,
    p_medications: payloads.medications,
    p_episodes: payloads.episodes,
    p_outbox: outbox,
    p_actor_user_id: args.actorUserId ?? null,
  });
  if (rpcErr) {
    await reportServerError(rpcErr, { filePath: FILE, metadata: { step: "execute_health_plan", intakeId } });
    return { kind: "error", message: "Falha ao confirmar. Tente de novo." };
  }

  const outcome = (result as { outcome?: string; created_count?: number } | null)?.outcome;
  if (outcome === "executed") {
    const createdCount = (result as { created_count: number }).created_count;
    captureServerEvent(actorId, "brain_intake_confirmed", { intake_id: intakeId, doc_type: "health_visit" });
    captureServerEvent(actorId, "brain_intake_executed", { intake_id: intakeId, doc_type: "health_visit", artifact_count: createdCount });
    return { kind: "executed", intakeId, createdCount };
  }

  // not_claimed → relê o estado atual pra classificar (igual ao escolar).
  const { data: fresh } = await supabase
    .from("brain_intakes")
    .select("status, confirmation_expires_at")
    .eq("id", intakeId)
    .single();
  const freshStatus = fresh?.status as string | undefined;
  if (freshStatus === "executed" || freshStatus === "executing") {
    return { kind: "already_processing", intakeId };
  }
  const freshExpiry = fresh?.confirmation_expires_at as string | null | undefined;
  if (freshExpiry && new Date(freshExpiry) <= new Date()) {
    return { kind: "stale_plan", intakeId, message: "A confirmação expirou. Quer revisar o plano de novo?" };
  }
  return { kind: "stale_plan", intakeId, message: "A rotina mudou desde que preparei este plano. Quer revisar?" };
}

/**
 * Confirma e materializa o plano. Revalida limites no app, monta os
 * payloads e chama a RPC atômica execute_plan (claim + materializa +
 * outbox + proveniência + executed numa transação). O confirmador sai do
 * ator explícito (WhatsApp) ou do auth.uid() do client do usuário (PWA).
 */
export async function confirmIntake(args: ConfirmIntakeArgs): Promise<IntakeResult> {
  const { supabase, intakeId, planHash, confirmationToken } = args;

  try {
    const actorId = args.actorUserId ?? (await supabase.auth.getUser()).data.user?.id;
    if (!actorId) return { kind: "error", message: "Sessão expirada. Entre de novo." };

    // 1. Carrega o intake (RLS já restringe ao grupo do usuário).
    const { data: intake, error: loadErr } = await supabase
      .from("brain_intakes")
      .select("group_id, child_id, plan, plan_hash, status, confirmation_expires_at")
      .eq("id", intakeId)
      .single();
    if (loadErr || !intake) return { kind: "error", message: "Intake não encontrado." };

    // 2. O plano mudou desde que o usuário viu? → reanálise (não confirma às cegas).
    if (intake.plan_hash !== planHash) {
      return { kind: "stale_plan", intakeId, message: "A rotina mudou desde que preparei este plano. Quer revisar?" };
    }

    const savedPlan = intake.plan as MaterializationPlan | null;
    if (!savedPlan) {
      return { kind: "error", message: "Não há nada para confirmar neste item." };
    }
    const today = new Date().toISOString().slice(0, 10);

    // Destinatários da coordenação = membros do grupo, menos o confirmador.
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", intake.group_id);
    const recipientIds = (members ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== actorId);

    // Dispatch por docType: SAÚDE materializa em medical_appointments/active_
    // medications/illness_episodes via RPC própria (não school_logs).
    if (savedPlan.docType === "health_visit") {
      return await confirmHealthVisit({
        supabase, intakeId, planHash, confirmationToken, savedPlan,
        actorId, actorUserId: args.actorUserId, recipientIds, today,
      });
    }

    // --- ESCOLAR (school_calendar): activities → school_logs ---
    if (!savedPlan.activities || savedPlan.activities.length === 0) {
      return { kind: "error", message: "Não há nada para confirmar neste item." };
    }
    // Edição + deseleção por item (ambas por índice ORIGINAL): aplica as
    // edições do usuário e materializa só o subconjunto mantido.
    const editedActivities = applyActivityEdits(savedPlan.activities, args.edits);
    const plan: MaterializationPlan = {
      ...savedPlan,
      activities: selectActivitiesByIndex(editedActivities, args.keepIndices),
    };
    if (!plan.activities || plan.activities.length === 0) {
      return { kind: "error", message: "Selecione ao menos uma atividade para criar." };
    }

    // 3. Revalida limites no app ANTES da RPC (data/nome/qtd/horizonte/UUID).
    const validation = validatePlanForExecution(plan, today);
    if (!validation.ok) {
      await reportServerError(new Error("plan_validation_failed"), {
        filePath: FILE,
        metadata: { step: "confirm_validate", intakeId, errors: validation.errors },
      });
      return { kind: "error", message: "O plano tem itens inválidos. Revise antes de confirmar." };
    }

    const activities = buildSchoolLogPayloads(plan);
    const outbox = buildOutboxPayloads({
      intakeId,
      recipientIds,
      docType: plan.docType,
      childId: (intake.child_id as string | null) ?? null,
      createdCount: activities.length,
    });

    // 5. RPC atômica: claim + materializa + outbox + proveniência + executed.
    const { data: result, error: rpcErr } = await supabase.rpc("brain_intake_execute_plan", {
      p_intake_id: intakeId,
      p_plan_hash: planHash,
      p_token: confirmationToken,
      p_activities: activities,
      p_outbox: outbox,
      p_actor_user_id: args.actorUserId ?? null,
    });
    if (rpcErr) {
      await reportServerError(rpcErr, { filePath: FILE, metadata: { step: "execute_plan", intakeId } });
      return { kind: "error", message: "Falha ao confirmar. Tente de novo." };
    }

    const outcome = (result as { outcome?: string; created_count?: number } | null)?.outcome;
    if (outcome === "executed") {
      const createdCount = (result as { created_count: number }).created_count;
      captureServerEvent(actorId, "brain_intake_confirmed", { intake_id: intakeId });
      captureServerEvent(actorId, "brain_intake_executed", { intake_id: intakeId, artifact_count: createdCount });
      return { kind: "executed", intakeId, createdCount };
    }

    // not_claimed → relê o estado ATUAL (não o cache de 60 linhas atrás) pra
    // classificar com precisão: já executado/executando, expirado, ou em
    // reanálise/falha (plano não mais confirmável → revisar).
    const { data: fresh } = await supabase
      .from("brain_intakes")
      .select("status, confirmation_expires_at")
      .eq("id", intakeId)
      .single();
    const freshStatus = fresh?.status as string | undefined;
    if (freshStatus === "executed" || freshStatus === "executing") {
      return { kind: "already_processing", intakeId };
    }
    const freshExpiry = fresh?.confirmation_expires_at as string | null | undefined;
    if (freshExpiry && new Date(freshExpiry) <= new Date()) {
      return { kind: "stale_plan", intakeId, message: "A confirmação expirou. Quer revisar o plano de novo?" };
    }
    return { kind: "stale_plan", intakeId, message: "A rotina mudou desde que preparei este plano. Quer revisar?" };
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "confirm", intakeId } });
    return { kind: "error", message: "Não consegui confirmar agora. Tente de novo." };
  }
}
