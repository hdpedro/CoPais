/* ------------------------------------------------------------------ */
/* services/child-sizes.ts                                              */
/*                                                                      */
/* Tamanhos da criança (sapato/calça/camiseta/casaco/outro) — Foundation*/
/* Collab adoção #7 (migration 00086). Dor real do coparenting: "vou    */
/* comprar tênis, qual o número?" / "comprou jaqueta, qual o tamanho?"  */
/*                                                                      */
/* Single source of truth chamada por:                                  */
/*   - src/actions/child-sizes.ts (PWA server actions)                  */
/*   - src/app/api/children/[childId]/sizes/route.ts (Native)           */
/*   - src/app/api/children/[childId]/sizes/[sizeId]/route.ts (Native)  */
/*   - src/lib/ai/tools.ts: record_child_size (in-app + WhatsApp)       */
/*                                                                      */
/* Semântica importante:                                                */
/*   - Cada registro = INSERT novo (histórico immutable por design).    */
/*   - UPDATE permitido pra correções (typos, datas erradas, notas).    */
/*   - DELETE hard (sem soft-delete) — uso raro pra entradas erradas.   */
/*   - "Tamanho atual" derivado: latest row per (child_id, kind).       */
/*   - Notification só no CREATE (não no edit/delete) — pattern         */
/*     Foundation (vide expenses, school_logs).                         */
/* ------------------------------------------------------------------ */

import type { SupabaseClient } from "@supabase/supabase-js";
import { notifySaudeFamiliaSize } from "./child-sizes-collab";
import { captureServerEvent } from "@/lib/posthog-server";

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

/**
 * Tipos de tamanho suportados — match com enum SQL `public.size_kind`.
 * Mantenha sincronizado com migration 00086.
 */
export type SizeKind = "shoe" | "pants" | "shirt" | "coat" | "other";

const ALL_KINDS: readonly SizeKind[] = ["shoe", "pants", "shirt", "coat", "other"];
export function isSizeKind(value: unknown): value is SizeKind {
  return typeof value === "string" && (ALL_KINDS as readonly string[]).includes(value);
}

/** Shape persistido na tabela `child_sizes` + name resolvido do criador. */
export interface ChildSizeRecord {
  id: string;
  group_id: string;
  child_id: string;
  kind: SizeKind;
  custom_label: string | null;
  size_value: string;
  size_value_numeric: number | null;
  recorded_on: string; // ISO date (YYYY-MM-DD)
  notes: string | null;
  is_confirmation: boolean;
  priority: "info" | "important" | "urgent";
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Resolvido server-side via join com profiles.full_name (UI display). */
  creator_first_name?: string;
}

/** Snapshot "tamanho atual" por kind — derivado da row mais recente. */
export interface CurrentSize {
  kind: SizeKind;
  custom_label: string | null;
  size_value: string;
  recorded_on: string;
  is_confirmation: boolean;
  size_id: string;
  created_by: string;
  creator_first_name?: string;
  days_since_recorded: number;
}

export interface RecordSizeInput {
  groupId: string;
  childId: string;
  kind: SizeKind;
  /** Obrigatório quando kind === 'other'. 1-40 chars. */
  customLabel?: string | null;
  /** Free-text 1-24 chars. Ex: "27", "27.5", "4 anos", "P". */
  sizeValue: string;
  /** ISO date (YYYY-MM-DD). Default = today. */
  recordedOn?: string | null;
  notes?: string | null;
  createdBy: string;
  /**
   * true → user só renovou o mesmo valor via check-in passivo ("ainda
   * usa 27?"). Histórico não destaca como mudança. Default false.
   */
  isConfirmation?: boolean;
}

export interface UpdateSizeInput {
  sizeId: string;
  actorId: string;
  patch: {
    sizeValue?: string;
    recordedOn?: string;
    notes?: string | null;
    customLabel?: string | null;
  };
}

/* ─── Helpers ────────────────────────────────────────────────────── */

async function verifyMembership(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Valida payload de tamanho — chamado em record + update. */
function validateSizePayload(input: {
  kind?: SizeKind;
  customLabel?: string | null;
  sizeValue?: string;
  notes?: string | null;
  recordedOn?: string | null;
}): string | null {
  if (input.sizeValue !== undefined) {
    const v = input.sizeValue.trim();
    if (!v) return "Valor do tamanho obrigatório.";
    if (v.length > 24) return "Valor do tamanho muito longo (máx 24).";
  }
  if (input.kind === "other") {
    const label = (input.customLabel || "").trim();
    if (!label) return "Etiqueta personalizada obrigatória para 'Outro'.";
    if (label.length > 40) return "Etiqueta personalizada muito longa (máx 40).";
  }
  if (input.kind && input.kind !== "other" && input.customLabel) {
    return "Etiqueta personalizada só é usada quando o tipo é 'Outro'.";
  }
  if (input.notes && input.notes.length > 500) {
    return "Notas muito longas (máx 500).";
  }
  if (input.recordedOn !== null && input.recordedOn !== undefined) {
    // Aceita YYYY-MM-DD. Recusa formatos quebrados pra evitar timezone surprise.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.recordedOn)) {
      return "Data inválida. Use formato AAAA-MM-DD.";
    }
    const d = new Date(input.recordedOn + "T00:00:00");
    if (isNaN(d.getTime())) return "Data inválida.";
    // Não aceita data > hoje (registrar tamanho do futuro não faz sentido).
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (d.getTime() > today.getTime()) return "Data não pode ser futura.";
  }
  return null;
}

/* ─── CREATE: recordSize ─────────────────────────────────────────── */

/**
 * Registra um novo tamanho. Cria a row + dispara push collab pro
 * coparente (priority='info'). Falha de notify não bloqueia o save.
 *
 * Idempotência: não tem — cada chamada cria uma row nova. Caller que
 * queira "atualizar último" precisa fazer DELETE+INSERT ou usar
 * `updateSize` na row existente.
 */
export async function recordSize(
  supabase: SupabaseClient,
  input: RecordSizeInput,
): Promise<ServiceResult<{ id: string }>> {
  // Validação
  if (!isSizeKind(input.kind)) {
    return { ok: false, error: "Tipo de tamanho inválido.", status: 400 };
  }
  const validationError = validateSizePayload({
    kind: input.kind,
    customLabel: input.customLabel,
    sizeValue: input.sizeValue,
    notes: input.notes,
    recordedOn: input.recordedOn ?? null,
  });
  if (validationError) {
    return { ok: false, error: validationError, status: 400 };
  }

  // Membership check
  const isMember = await verifyMembership(supabase, input.groupId, input.createdBy);
  if (!isMember) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }

  // INSERT
  const payload = {
    group_id: input.groupId,
    child_id: input.childId,
    kind: input.kind,
    custom_label: input.kind === "other" ? (input.customLabel || "").trim() : null,
    size_value: input.sizeValue.trim(),
    recorded_on: input.recordedOn || new Date().toISOString().slice(0, 10),
    notes: input.notes?.trim() || null,
    is_confirmation: input.isConfirmation ?? false,
    created_by: input.createdBy,
    // priority fica no default 'info' do schema.
    // size_value_numeric é normalizado pelo trigger SQL pra sapato.
  };

  const { data, error } = await supabase
    .from("child_sizes")
    .insert(payload)
    .select("id, child_id, kind, custom_label, size_value, recorded_on, is_confirmation")
    .single();

  if (error) {
    // FK violation 23503 (child_id inexistente / wrong group) → 400 amigável
    if (error.code === "23503") {
      return { ok: false, error: "Criança não encontrada neste grupo.", status: 400 };
    }
    // Check constraint violation (custom_label, size_value length)
    if (error.code === "23514") {
      return { ok: false, error: "Dados inválidos para o tamanho.", status: 400 };
    }
    return { ok: false, error: error.message, status: 400 };
  }

  // Telemetria
  captureServerEvent(input.createdBy, "child_size_recorded", {
    kind: input.kind,
    is_confirmation: payload.is_confirmation,
    child_id: input.childId,
  });

  // Notificação Foundation Collab (fire-and-forget; falha silenciosa).
  // Skip notify quando is_confirmation=true (user só renovou, sem novidade).
  if (!payload.is_confirmation) {
    void notifySaudeFamiliaSize({
      recordId: data.id,
      childId: input.childId,
      groupId: input.groupId,
      actorUserId: input.createdBy,
      kind: input.kind,
      customLabel: payload.custom_label,
      sizeValue: payload.size_value,
    });
  }

  return { ok: true, data: { id: data.id } };
}

/* ─── UPDATE: updateSize ─────────────────────────────────────────── */

/**
 * Edita um registro existente — pra correção de typo/data/notas.
 * NÃO dispara push (já passou).
 *
 * Permissão: qualquer member do grupo da row (RLS enforce). Service-level
 * checagem extra: verifica se row pertence a um grupo onde actor é member
 * (cobre caso de admin client bypassing RLS).
 */
export async function updateSize(
  supabase: SupabaseClient,
  input: UpdateSizeInput,
): Promise<ServiceResult<{ id: string }>> {
  // Busca a row + kind atual pra validar custom_label coherence
  const { data: existing, error: fetchError } = await supabase
    .from("child_sizes")
    .select("id, group_id, kind, custom_label")
    .eq("id", input.sizeId)
    .single();
  if (fetchError || !existing) {
    return { ok: false, error: "Registro não encontrado.", status: 404 };
  }

  // Membership
  const isMember = await verifyMembership(supabase, existing.group_id, input.actorId);
  if (!isMember) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }

  // Validação do patch (em contexto do kind atual — edit não troca kind)
  const validationError = validateSizePayload({
    kind: existing.kind as SizeKind,
    customLabel: input.patch.customLabel,
    sizeValue: input.patch.sizeValue,
    notes: input.patch.notes,
    recordedOn: input.patch.recordedOn,
  });
  if (validationError) {
    return { ok: false, error: validationError, status: 400 };
  }

  // Monta patch — só campos presentes
  const updatePayload: Record<string, unknown> = {};
  if (input.patch.sizeValue !== undefined) {
    updatePayload.size_value = input.patch.sizeValue.trim();
    // Reset size_value_numeric pra trigger SQL recomputar (kind='shoe' only).
    updatePayload.size_value_numeric = null;
  }
  if (input.patch.recordedOn !== undefined) {
    updatePayload.recorded_on = input.patch.recordedOn;
  }
  if (input.patch.notes !== undefined) {
    updatePayload.notes = input.patch.notes?.trim() || null;
  }
  if (input.patch.customLabel !== undefined && existing.kind === "other") {
    updatePayload.custom_label = (input.patch.customLabel || "").trim() || null;
  }

  if (Object.keys(updatePayload).length === 0) {
    return { ok: true, data: { id: input.sizeId } };
  }

  const { error: updateError } = await supabase
    .from("child_sizes")
    .update(updatePayload)
    .eq("id", input.sizeId);

  if (updateError) {
    if (updateError.code === "23514") {
      return { ok: false, error: "Dados inválidos para o tamanho.", status: 400 };
    }
    return { ok: false, error: updateError.message, status: 400 };
  }

  captureServerEvent(input.actorId, "child_size_edited", {
    size_id: input.sizeId,
    fields_changed: Object.keys(updatePayload),
  });

  return { ok: true, data: { id: input.sizeId } };
}

/* ─── DELETE: deleteSize ─────────────────────────────────────────── */

/**
 * Remove permanentemente uma entrada (hard delete). Uso raro — pra
 * apagar typo grosso ou entrada criada por engano. Não dispara push.
 *
 * collab_reads relacionadas ficam órfãs (record_type+record_id sem
 * tabela) mas são limpas pelo CASCADE na deleção de child → group →
 * collab_reads. Ou ficam lá inofensivas (storage trivial).
 */
export async function deleteSize(
  supabase: SupabaseClient,
  args: { sizeId: string; actorId: string },
): Promise<ServiceResult<{ id: string }>> {
  const { data: existing, error: fetchError } = await supabase
    .from("child_sizes")
    .select("id, group_id")
    .eq("id", args.sizeId)
    .single();
  if (fetchError || !existing) {
    return { ok: false, error: "Registro não encontrado.", status: 404 };
  }

  const isMember = await verifyMembership(supabase, existing.group_id, args.actorId);
  if (!isMember) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }

  const { error: deleteError } = await supabase
    .from("child_sizes")
    .delete()
    .eq("id", args.sizeId);

  if (deleteError) {
    return { ok: false, error: deleteError.message, status: 400 };
  }

  captureServerEvent(args.actorId, "child_size_deleted", { size_id: args.sizeId });

  return { ok: true, data: { id: args.sizeId } };
}

/* ─── READ: getCurrentSizes ──────────────────────────────────────── */

/**
 * Retorna o tamanho ATUAL (last by recorded_on, tiebreak created_at) por
 * kind pra uma criança. Inclui days_since_recorded pra UI sinalizar
 * freshness.
 *
 * Pra kind='other', cada custom_label distinto vira uma entrada própria.
 */
export async function getCurrentSizes(
  supabase: SupabaseClient,
  childId: string,
): Promise<CurrentSize[]> {
  // Busca todos + reduz client-side. Volume é pequeno (poucas mudanças por
  // kind por criança); UI não precisa otimização de servidor.
  const { data, error } = await supabase
    .from("child_sizes")
    .select(
      "id, kind, custom_label, size_value, recorded_on, is_confirmation, created_by, " +
        "profiles!child_sizes_created_by_fkey(full_name)",
    )
    .eq("child_id", childId)
    .order("recorded_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const seen = new Map<string, CurrentSize>();
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  // Cast: FK join (`profiles!...(full_name)`) confunde o type infer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of data as any[]) {
    // Pra kind='other', a key inclui o custom_label.
    const key = row.kind === "other" ? `other:${row.custom_label || ""}` : row.kind;
    if (seen.has(key)) continue;

    const recordedDate = new Date(row.recorded_on + "T00:00:00");
    const daysSince = Math.floor(
      (todayMidnight.getTime() - recordedDate.getTime()) / 86_400_000,
    );

    seen.set(key, {
      kind: row.kind as SizeKind,
      custom_label: row.custom_label as string | null,
      size_value: row.size_value as string,
      recorded_on: row.recorded_on as string,
      is_confirmation: row.is_confirmation as boolean,
      size_id: row.id as string,
      created_by: row.created_by as string,
      creator_first_name:
        (row.profiles?.full_name || "").split(" ")[0] || undefined,
      days_since_recorded: Math.max(0, daysSince),
    });
  }
  return Array.from(seen.values());
}

/* ─── READ: getSizeHistory ───────────────────────────────────────── */

/**
 * Histórico completo (ou filtrado por kind) ordenado desc.
 * Limita a 200 entries (suficiente pra anos de uso).
 */
export async function getSizeHistory(
  supabase: SupabaseClient,
  childId: string,
  options?: { kind?: SizeKind; limit?: number },
): Promise<ChildSizeRecord[]> {
  let query = supabase
    .from("child_sizes")
    .select(
      "id, group_id, child_id, kind, custom_label, size_value, size_value_numeric, " +
        "recorded_on, notes, is_confirmation, priority, created_by, created_at, " +
        "updated_at, profiles!child_sizes_created_by_fkey(full_name)",
    )
    .eq("child_id", childId)
    .order("recorded_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 200);

  if (options?.kind) query = query.eq("kind", options.kind);

  const { data, error } = await query;
  if (error || !data) return [];

  // Cast pra any local: select string com FK join não infere bem o shape
  // (supabase-js parsing limitation). Vide health-collab.ts pra precedente.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((row) => ({
    id: row.id as string,
    group_id: row.group_id as string,
    child_id: row.child_id as string,
    kind: row.kind as SizeKind,
    custom_label: row.custom_label as string | null,
    size_value: row.size_value as string,
    size_value_numeric: row.size_value_numeric as number | null,
    recorded_on: row.recorded_on as string,
    notes: row.notes as string | null,
    is_confirmation: row.is_confirmation as boolean,
    priority: row.priority as ChildSizeRecord["priority"],
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    creator_first_name:
      (row.profiles?.full_name || "").split(" ")[0] || undefined,
  }));
}
