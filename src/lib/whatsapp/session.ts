/* ------------------------------------------------------------------ */
/* WhatsApp Session Manager                                           */
/* Manages conversation state (pending confirmations, group, etc.)     */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { WASessionState } from "./types";

export interface WASession {
  id: string;
  phone_number: string;
  user_id: string | null;
  group_id: string | null;
  state: WASessionState;
  last_message_at: string;
  message_count: number;
}

const CONFIRMATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
// Fluxo do Brain (foto → revisar → confirmar/desfazer) é mais demorado que uma
// confirmação simples; janela maior. A RPC ainda valida confirmation_expires_at
// do lado do servidor — este timeout só evita que um brain_intake velho
// sequestre mensagens normais indefinidamente.
const BRAIN_INTAKE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Load or create a session for a phone number.
 */
export async function loadSession(
  supabase: SupabaseClient,
  phoneNumber: string,
  userId?: string,
  groupId?: string
): Promise<WASession> {
  // Try to load existing session
  const { data: existing } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number, user_id, group_id, state, last_message_at, message_count")
    .eq("phone_number", phoneNumber)
    .single();

  if (existing) {
    // Update last_message_at and increment count
    await supabase
      .from("whatsapp_sessions")
      .update({
        last_message_at: new Date().toISOString(),
        message_count: (existing.message_count || 0) + 1,
        ...(userId && !existing.user_id ? { user_id: userId } : {}),
        ...(groupId && !existing.group_id ? { group_id: groupId } : {}),
      })
      .eq("id", existing.id);

    return {
      ...existing,
      state: (existing.state || {}) as WASessionState,
    };
  }

  // Create new session
  const newSession = {
    phone_number: phoneNumber,
    user_id: userId || null,
    group_id: groupId || null,
    state: {},
    last_message_at: new Date().toISOString(),
    message_count: 1,
  };

  const { data: created } = await supabase
    .from("whatsapp_sessions")
    .insert(newSession)
    .select("id, phone_number, user_id, group_id, state, last_message_at, message_count")
    .single();

  return {
    ...(created || { id: "", ...newSession }),
    state: {},
  };
}

/**
 * Check if session has a pending confirmation that hasn't timed out.
 */
export function hasPendingConfirmation(session: WASession): boolean {
  if (!session.state.pending_action || !session.state.pending_at) {
    return false;
  }

  const pendingAt = new Date(session.state.pending_at).getTime();
  const elapsed = Date.now() - pendingAt;

  return elapsed < CONFIRMATION_TIMEOUT_MS;
}

/**
 * Set a pending action for confirmation.
 */
export async function setPendingAction(
  supabase: SupabaseClient,
  sessionId: string,
  action: string,
  params: Record<string, string>,
  confirmationText: string,
  originalText: string
): Promise<void> {
  const state: WASessionState = {
    pending_action: action,
    pending_params: params,
    pending_confirmation_text: confirmationText,
    pending_at: new Date().toISOString(),
    original_text: originalText,
  };

  await supabase
    .from("whatsapp_sessions")
    .update({ state })
    .eq("id", sessionId);
}

/**
 * Clear the pending action (after confirm or cancel).
 */
export async function clearPendingAction(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  await supabase
    .from("whatsapp_sessions")
    .update({ state: {} })
    .eq("id", sessionId);
}

/**
 * Persiste o estado do fluxo do Brain (calendário escolar). Igual ao
 * receipt flow, SUBSTITUI o state inteiro — um fluxo por vez. `pending_at`
 * dá o timeout via hasBrainIntake.
 */
export async function setBrainIntake(
  supabase: SupabaseClient,
  sessionId: string,
  brain: NonNullable<WASessionState["brain_intake"]>,
): Promise<void> {
  const state: WASessionState = {
    brain_intake: brain,
    pending_at: new Date().toISOString(),
  };
  await supabase.from("whatsapp_sessions").update({ state }).eq("id", sessionId);
}

/**
 * Há um fluxo do Brain aguardando resposta (e não expirou)?
 */
export function hasBrainIntake(session: WASession): boolean {
  if (!session.state.brain_intake || !session.state.pending_at) return false;
  const elapsed = Date.now() - new Date(session.state.pending_at).getTime();
  return elapsed < BRAIN_INTAKE_TIMEOUT_MS;
}

/**
 * Guarda o media_id de uma imagem cujo OCR de recibo falhou, pra reprocessar
 * como calendário se o usuário confirmar. SUBSTITUI o state (igual aos outros).
 */
export async function setBrainFallbackPhoto(
  supabase: SupabaseClient,
  sessionId: string,
  photo: NonNullable<WASessionState["brain_fallback_photo"]>,
): Promise<void> {
  const state: WASessionState = {
    brain_fallback_photo: photo,
    pending_at: new Date().toISOString(),
  };
  await supabase.from("whatsapp_sessions").update({ state }).eq("id", sessionId);
}

/** Há uma imagem aguardando "é calendário?" (fallback de recibo), não expirada? */
export function hasBrainFallbackPhoto(session: WASession): boolean {
  if (!session.state.brain_fallback_photo || !session.state.pending_at) return false;
  const elapsed = Date.now() - new Date(session.state.pending_at).getTime();
  return elapsed < BRAIN_INTAKE_TIMEOUT_MS;
}

/** Guarda o media_id + opções pra resolver a criança do calendário SEM reenviar
 *  a foto. SUBSTITUI o state (igual aos outros). */
export async function setBrainChildSelection(
  supabase: SupabaseClient,
  sessionId: string,
  sel: NonNullable<WASessionState["brain_child_selection"]>,
): Promise<void> {
  const state: WASessionState = {
    brain_child_selection: sel,
    pending_at: new Date().toISOString(),
  };
  await supabase.from("whatsapp_sessions").update({ state }).eq("id", sessionId);
}

/** Há um calendário aguardando o usuário dizer de qual criança é? */
export function hasBrainChildSelection(session: WASession): boolean {
  if (!session.state.brain_child_selection || !session.state.pending_at) return false;
  const elapsed = Date.now() - new Date(session.state.pending_at).getTime();
  return elapsed < BRAIN_INTAKE_TIMEOUT_MS;
}

/**
 * Set the group for a session.
 */
export async function setSessionGroup(
  supabase: SupabaseClient,
  sessionId: string,
  groupId: string
): Promise<void> {
  await supabase
    .from("whatsapp_sessions")
    .update({ group_id: groupId })
    .eq("id", sessionId);
}

/**
 * Set group selection state in session.
 */
export async function setGroupSelectionState(
  supabase: SupabaseClient,
  sessionId: string,
  groups: Array<{ id: string; name: string }>
): Promise<void> {
  const state: WASessionState = {
    awaiting_group_selection: true,
    group_options: groups,
  };

  await supabase
    .from("whatsapp_sessions")
    .update({ state })
    .eq("id", sessionId);
}

/**
 * Start the multi-step receipt flow (category → child → confirm).
 * Persists the OCR draft and the next step the user is being asked.
 */
export async function setReceiptStep(
  supabase: SupabaseClient,
  sessionId: string,
  step: "category" | "child",
  draft: {
    description: string;
    amount: number;
    expense_date: string;
    category?: string;
    child_id?: string | null;
  },
): Promise<void> {
  const state: WASessionState = {
    receipt_step: step,
    receipt_draft: draft,
    pending_at: new Date().toISOString(),
  };
  await supabase
    .from("whatsapp_sessions")
    .update({ state })
    .eq("id", sessionId);
}
