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
import { routeVisionRequest } from "@/lib/ai/router";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { getPlaybook } from "@/lib/ai/brain/understanding/registry";
import { analyzeImpact, type ExistingOccurrence } from "@/lib/ai/brain/impact";
import { prioritize } from "@/lib/ai/brain/prioritize";
import { dedupeWithinPlan } from "@/lib/ai/brain/dedupe";
import { computePlanHash } from "@/lib/ai/brain/plan-hash";
import { validatePlanForExecution } from "@/lib/ai/brain/validate-plan";
import { buildActivityPayloads, buildOutboxPayloads, selectActivitiesByIndex } from "@/lib/ai/brain/materialize-payload";
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
  const { data, error } = await supabase
    .from("calendar_occurrences")
    .select("occurrence_date, child_id")
    .eq("child_id", childId)
    .gte("occurrence_date", window.from)
    .lte("occurrence_date", window.to);
  if (error || !data) return [];
  return data.map((row) => ({
    childId: row.child_id as string | null,
    date: row.occurrence_date as string,
    title: "",
  }));
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
          : null; // >1 sem escolha → analyzeIntakeImage devolve needs_child_selection

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
    return await analyzeIntakeImage({ supabase, intakeId, imageBuffer: buffer, ctx });
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
    // 1. Trava de concorrência: uploaded/analyzed/failed → analyzing.
    const { data: started } = await supabase.rpc("brain_intake_begin_analysis", {
      p_intake_id: intakeId,
    });
    if (!started || !(started as { id?: string }).id) {
      return { kind: "already_processing", intakeId };
    }

    // Criança ambígua bloqueia antes de planejar (não cria sozinho).
    if (ctx.resolvedChildId === null && ctx.children.length > 1) {
      return { kind: "needs_child_selection", intakeId, options: ctx.children };
    }

    // 2. Visão (impura) → saída bruta. school_calendar é o único playbook A0.
    const docType: DocType = "school_calendar";
    const playbook = getPlaybook(docType);
    if (!playbook) return { kind: "error", message: "Playbook indisponível." };

    // Normaliza o timezone do contexto (IANA válida) antes de planejar.
    const sctx: PlaybookContext = { ...ctx, timezone: safeTimezone(ctx.timezone) };

    const { base64, mimeType } = await compressImageForVision(imageBuffer);
    // Injeta o ano letivo de referência: o modelo resolve a data em ISO mesmo
    // quando o ano não aparece na imagem (evita data sem ano / formato ambíguo).
    const userPrompt =
      `${playbook.extractionPrompt.user}\n\n` +
      `Ano letivo de referência (use se o ano não aparecer na imagem): ${sctx.schoolYearAnchor}.`;
    const vision = await routeVisionRequest(
      base64,
      mimeType,
      playbook.extractionPrompt.system,
      userPrompt,
      { temperature: 0.1, maxTokens: 4000 },
    );

    // 3. Parse + validação estrita do schema (fora do schema é descartado).
    let raw: unknown;
    try {
      raw = parseVisionJson(vision.text);
    } catch {
      await markFailed(supabase, intakeId, "vision_parse_error");
      captureServerEvent(ctx.userId, "brain_intake_extraction_failed", {
        intake_id: intakeId,
        error_type: "vision_parse_error",
        provider: vision.provider,
      });
      return { kind: "error", message: "Não consegui interpretar a foto. Tente uma imagem mais nítida." };
    }

    const data = playbook.parse(raw, sctx);
    if (!data) {
      // Não reconheceu como calendário escolar. Estado terminal NÃO-alarmante
      // (sem plan/token → nunca confirmável) mas RE-PROCESSÁVEL: begin_analysis
      // aceita 'failed' → permite reclassificar com hint depois. doc_type
      // distingue de falha real (doc_type null) nas métricas. (Status dedicado
      // 'needs_clarification' fica pro refino pós-A0.)
      await supabase
        .from("brain_intakes")
        .update({ status: "failed", error: "unknown_document", doc_type: "unknown_document", analysis_provider: vision.provider, analyzed_at: new Date().toISOString() })
        .eq("id", intakeId);
      captureServerEvent(ctx.userId, "brain_intake_extraction_failed", {
        intake_id: intakeId,
        doc_type: "unknown_document",
        error_type: "unrecognized",
        provider: vision.provider,
      });
      return {
        kind: "unknown_document",
        intakeId,
        message: "Não tenho certeza do que é. Quer que eu procure datas de provas?",
      };
    }

    // Telemetria: linhas reconhecidas como prova mas descartadas por não terem
    // matéria (ex: "Segunda chamada"). Mede a frequência antes de investir em UI.
    const skippedLines = (data as { skipped?: number }).skipped ?? 0;
    if (skippedLines > 0) {
      captureServerEvent(ctx.userId, "brain_intake_lines_skipped", {
        intake_id: intakeId,
        skipped_count: skippedLines,
        doc_type: docType,
      });
    }

    // 4. Plano + dedup intra-plano + impacto escopado + prioridade.
    const planned = playbook.plan(data, sctx);
    const { unique, dropped } = dedupeWithinPlan(planned.activities ?? []);
    const plan: MaterializationPlan = { ...planned, activities: unique };
    if (dropped.length > 0) {
      captureServerEvent(ctx.userId, "brain_intake_duplicate_detected", {
        intake_id: intakeId,
        dropped_count: dropped.length,
      });
    }

    const window = planDateWindow(plan);
    const existing = await loadExistingOccurrences(supabase, sctx.resolvedChildId, window);
    const impacts = analyzeImpact(plan, existing);
    const priority = prioritize(plan, sctx.today);

    // 5. plan_hash canônico (inclui playbook+policy version) + token + expiração.
    const planHash = computePlanHash({
      plan,
      playbookVersion: playbook.playbookVersion,
      policyVersion: playbook.policyVersion,
    });
    const confirmationToken = randomUUID();
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();

    // 6. Salva o preview. `extracted` guarda o dado ESTRUTURADO (não o OCR cru).
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
        analysis_provider: vision.provider,
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
    captureServerEvent(ctx.userId, "brain_intake_analyzed", {
      intake_id: intakeId,
      doc_type: docType,
      child_count: ctx.children.length,
      artifact_count: activityCount,
      confidence_level: needsReview ? "needs_review" : "high",
      provider: vision.provider,
      latency_ms: Date.now() - t0,
    });
    captureServerEvent(ctx.userId, "brain_intake_preview_shown", { intake_id: intakeId, doc_type: docType });

    const preview: IntakePreview = {
      intakeId,
      docType,
      confirmation: plan.confirmation,
      plan,
      impacts,
      priority,
      planHash,
      confirmationToken,
    };
    return { kind: "preview", preview };
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
}

/**
 * Confirma e materializa o plano. Revalida limites no app, monta os
 * payloads e chama a RPC atômica execute_plan (claim + materializa +
 * outbox + proveniência + executed numa transação). O confirmador sai do
 * auth.uid() do client do usuário.
 */
export async function confirmIntake(args: ConfirmIntakeArgs): Promise<IntakeResult> {
  const { supabase, intakeId, planHash, confirmationToken } = args;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { kind: "error", message: "Sessão expirada. Entre de novo." };

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
    // Sem plano (ex: unknown_document) → nada a confirmar (mensagem calma).
    if (!savedPlan || !savedPlan.activities || savedPlan.activities.length === 0) {
      return { kind: "error", message: "Não há nada para confirmar neste item." };
    }
    // Deseleção por item: materializa só o subconjunto mantido pelo usuário.
    const plan: MaterializationPlan = {
      ...savedPlan,
      activities: selectActivitiesByIndex(savedPlan.activities, args.keepIndices),
    };
    if (!plan.activities || plan.activities.length === 0) {
      return { kind: "error", message: "Selecione ao menos uma atividade para criar." };
    }
    const today = new Date().toISOString().slice(0, 10);

    // 3. Revalida limites no app ANTES da RPC (data/nome/qtd/horizonte/UUID).
    const validation = validatePlanForExecution(plan, today);
    if (!validation.ok) {
      await reportServerError(new Error("plan_validation_failed"), {
        filePath: FILE,
        metadata: { step: "confirm_validate", intakeId, errors: validation.errors },
      });
      return { kind: "error", message: "O plano tem itens inválidos. Revise antes de confirmar." };
    }

    // 4. Destinatários da coordenação = membros do grupo, menos o confirmador.
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", intake.group_id);
    const recipientIds = (members ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== user.id);

    const activities = buildActivityPayloads(plan);
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
    });
    if (rpcErr) {
      await reportServerError(rpcErr, { filePath: FILE, metadata: { step: "execute_plan", intakeId } });
      return { kind: "error", message: "Falha ao confirmar. Tente de novo." };
    }

    const outcome = (result as { outcome?: string; created_count?: number } | null)?.outcome;
    if (outcome === "executed") {
      const createdCount = (result as { created_count: number }).created_count;
      captureServerEvent(user.id, "brain_intake_confirmed", { intake_id: intakeId });
      captureServerEvent(user.id, "brain_intake_executed", { intake_id: intakeId, artifact_count: createdCount });
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
