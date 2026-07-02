/* ------------------------------------------------------------------ */
/* materialize-custody-payload.ts — plano de guarda/rotina → payloads   */
/*                                                                      */
/* PURO/determinístico (sem I/O). Espelha materialize-health-payload:   */
/* cada item vira payload snake_case pro RPC + payload_hash canônico    */
/* (base do undo seguro). O ROTEAMENTO DE GOVERNANÇA acontece aqui:     */
/*  - exceção/férias  → custody_events (notifica-e-vale + Desfazer)     */
/*  - leva/busca      → care_routine_overrides (idem); pessoa EXTERNA   */
/*    ("a avó") vira NOTE humano e o responsável no app é o NARRADOR    */
/*    (quem combinou responde pela logística — nunca se inventa membro) */
/*  - troca de dia    → swap_requests 'pending' (o fluxo BILATERAL      */
/*    existente aprova/materializa; aqui só se propõe)                  */
/*  - mudança PERMANENTE (slot) → NÃO escreve tabela: vira proposta no  */
/*    outbox (OK-do-outro antes de valer — decisão do dono 02/jul)      */
/* Ver C:\Users\henri\.claude\plans\brain-custody-routine-design.md.     */
/* ------------------------------------------------------------------ */

import { createHash } from "crypto";
import { canonicalize } from "./plan-hash";
import { outboxDedupeKey } from "./dedupe";
import type {
  CustodyExceptionItem,
  CustodyRoutinePlan,
  LegOverrideItem,
  SlotChangeItem,
  SwapProposalItem,
  VacationItem,
} from "./types";

function sha256(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/* ---- custody_events (exceção pontual + férias) ---- */

export interface CustodyEventPayload {
  child_id: string | null; // null = família toda (só vacation)
  responsible_user_id: string;
  start_date: string;
  end_date: string;
  custody_type: "exception" | "vacation";
  notes: string | null;
  payload_hash: string;
}

export function custodyEventPayloadHash(input: {
  childId: string | null;
  responsibleUserId: string;
  startDate: string;
  endDate: string;
  custodyType: string;
  notes: string | null;
}): string {
  return sha256(
    canonicalize({
      childId: input.childId,
      custodyType: input.custodyType,
      endDate: input.endDate,
      notes: input.notes,
      responsibleUserId: input.responsibleUserId,
      startDate: input.startDate,
    }),
  );
}

function buildCustodyEventPayload(
  childId: string | null,
  item: CustodyExceptionItem | VacationItem,
): CustodyEventPayload {
  const custodyType = item.kind === "custody_exception" ? "exception" : "vacation";
  const notes = item.kind === "custody_exception" ? item.reason : item.notes;
  // responsible.memberId é garantido != null pelo parse (guarda exige membro).
  const responsibleUserId = item.responsible.memberId as string;
  return {
    child_id: childId,
    responsible_user_id: responsibleUserId,
    start_date: item.startDate,
    end_date: item.endDate,
    custody_type: custodyType,
    notes,
    payload_hash: custodyEventPayloadHash({
      childId,
      responsibleUserId,
      startDate: item.startDate,
      endDate: item.endDate,
      custodyType,
      notes,
    }),
  };
}

/** Exceção: 1 linha por criança citada. Férias: childIds null (família toda)
 *  → 1 linha com child_id null; lista → 1 linha por criança. */
export function buildCustodyEventPayloads(plan: CustodyRoutinePlan): CustodyEventPayload[] {
  const out: CustodyEventPayload[] = [];
  for (const item of plan.items) {
    if (item.kind === "custody_exception") {
      for (const childId of item.childIds) out.push(buildCustodyEventPayload(childId, item));
    } else if (item.kind === "vacation") {
      if (item.childIds === null) out.push(buildCustodyEventPayload(null, item));
      else for (const childId of item.childIds) out.push(buildCustodyEventPayload(childId, item));
    }
  }
  return out;
}

/* ---- care_routine_overrides (leva/busca pontual) ---- */

export interface LegOverridePayload {
  child_id: string;
  occurrence_date: string;
  leg: "dropoff" | "pickup";
  responsible_id: string; // sempre MEMBRO (externo → narrador, ver nota)
  note: string | null;
  payload_hash: string;
}

export function legOverridePayloadHash(input: {
  childId: string;
  occurrenceDate: string;
  leg: string;
  responsibleId: string;
  note: string | null;
}): string {
  return sha256(
    canonicalize({
      childId: input.childId,
      leg: input.leg,
      note: input.note,
      occurrenceDate: input.occurrenceDate,
      responsibleId: input.responsibleId,
    }),
  );
}

/** Rótulo humano da perna (pra note de pessoa externa). */
function legLabel(leg: "dropoff" | "pickup"): string {
  return leg === "pickup" ? "busca" : "leva";
}

export function buildLegOverridePayloads(plan: CustodyRoutinePlan, actorId: string): LegOverridePayload[] {
  const out: LegOverridePayload[] = [];
  for (const item of plan.items) {
    if (item.kind !== "leg_override") continue;
    const it = item as LegOverrideItem;
    const external = it.responsible.memberId === null;
    // Pessoa externa: a VERDADE humana vai no note; a responsabilidade no app
    // fica com o narrador (que combinou). O preview diz isso explicitamente.
    const responsibleId = it.responsible.memberId ?? actorId;
    const noteParts = [
      external ? `Quem ${legLabel(it.leg)}: ${it.responsible.label}` : null,
      it.time ? `às ${it.time}` : null,
      it.note,
    ].filter((s): s is string => s !== null && s !== "");
    const note = noteParts.length > 0 ? noteParts.join(" — ") : null;
    for (const childId of it.childIds) {
      out.push({
        child_id: childId,
        occurrence_date: it.date,
        leg: it.leg,
        responsible_id: responsibleId,
        note,
        payload_hash: legOverridePayloadHash({
          childId,
          occurrenceDate: it.date,
          leg: it.leg,
          responsibleId,
          note,
        }),
      });
    }
  }
  return out;
}

/* ---- swap_requests (proposta de troca — bilateral EXISTENTE) ---- */

export interface SwapRequestPayload {
  target_user_id: string;
  original_date: string;
  proposed_date: string | null;
  reason: string | null;
  payload_hash: string;
}

export function swapRequestPayloadHash(input: {
  targetUserId: string;
  originalDate: string;
  proposedDate: string | null;
  reason: string | null;
}): string {
  return sha256(
    canonicalize({
      originalDate: input.originalDate,
      proposedDate: input.proposedDate,
      reason: input.reason,
      targetUserId: input.targetUserId,
    }),
  );
}

export function buildSwapRequestPayloads(plan: CustodyRoutinePlan): SwapRequestPayload[] {
  const out: SwapRequestPayload[] = [];
  for (const item of plan.items) {
    if (item.kind !== "swap_proposal") continue;
    const it = item as SwapProposalItem;
    const targetUserId = it.counterpart.memberId as string; // parse garante membro ≠ narrador
    out.push({
      target_user_id: targetUserId,
      original_date: it.originalDate,
      proposed_date: it.proposedDate,
      reason: it.reason,
      payload_hash: swapRequestPayloadHash({
        targetUserId,
        originalDate: it.originalDate,
        proposedDate: it.proposedDate,
        reason: it.reason,
      }),
    });
  }
  return out;
}

/* ---- proposta de mudança PERMANENTE (slot) — OK-do-outro (N4) ----
 * A partir da 00138 a RPC INSERE em care_routine_slot_proposals; o slot
 * semanal em si só muda quando o OUTRO responsável aceitar. */

export interface SlotChangeProposalPayload {
  child_ids: string[];
  weekday: number;
  leg: "dropoff" | "pickup";
  responsible_id: string;
  /** Rótulo humano ("Fernanda") pro card da proposta — a RPC persiste. */
  responsible_label: string;
  time: string | null;
  payload_hash: string;
}

export function slotChangeProposalHash(input: {
  childIds: string[];
  weekday: number;
  leg: string;
  responsibleId: string;
  time: string | null;
}): string {
  return sha256(
    canonicalize({
      childIds: [...input.childIds].sort(),
      leg: input.leg,
      responsibleId: input.responsibleId,
      time: input.time,
      weekday: input.weekday,
    }),
  );
}

export function buildSlotChangeProposals(plan: CustodyRoutinePlan): SlotChangeProposalPayload[] {
  const out: SlotChangeProposalPayload[] = [];
  for (const item of plan.items) {
    if (item.kind !== "slot_change") continue;
    const it = item as SlotChangeItem;
    const responsibleId = it.responsible.memberId as string; // parse garante membro
    out.push({
      child_ids: it.childIds,
      weekday: it.weekday,
      leg: it.leg,
      responsible_id: responsibleId,
      responsible_label: it.responsible.label,
      time: it.time,
      payload_hash: slotChangeProposalHash({
        childIds: it.childIds,
        weekday: it.weekday,
        leg: it.leg,
        responsibleId,
        time: it.time,
      }),
    });
  }
  return out;
}

/* ---- Coordenação (outbox): notifica-e-vale + proposta ---- */

export interface CustodyOutboxPayload {
  event_type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
}

/** 1 collab_notify por destinatário (membros ≠ ator): resumo do que valeu
 *  na hora (exceções/férias/leva-busca) + o que está PROPOSTO (troca/slot).
 *  O worker ramifica por payload.kind = 'custody_routine'. */
export function buildCustodyOutboxPayloads(args: {
  intakeId: string;
  recipientIds: string[];
  appliedCount: number; // exceções+férias+overrides materializados
  swapProposalCount: number;
  slotProposalCount: number;
}): CustodyOutboxPayload[] {
  const seen = new Set<string>();
  const out: CustodyOutboxPayload[] = [];
  for (const recipientId of args.recipientIds) {
    if (seen.has(recipientId)) continue;
    seen.add(recipientId);
    out.push({
      event_type: "collab_notify",
      dedupe_key: outboxDedupeKey(args.intakeId, "collab_notify", recipientId),
      payload: {
        kind: "custody_routine",
        intake_id: args.intakeId,
        recipient_id: recipientId,
        applied_count: args.appliedCount,
        swap_proposal_count: args.swapProposalCount,
        slot_proposal_count: args.slotProposalCount,
      },
    });
  }
  return out;
}

/** Conveniência: todos os payloads do plano de uma vez. */
export function buildCustodyPayloads(
  plan: CustodyRoutinePlan,
  actorId: string,
): {
  custodyEvents: CustodyEventPayload[];
  legOverrides: LegOverridePayload[];
  swapRequests: SwapRequestPayload[];
  slotProposals: SlotChangeProposalPayload[];
} {
  return {
    custodyEvents: buildCustodyEventPayloads(plan),
    legOverrides: buildLegOverridePayloads(plan, actorId),
    swapRequests: buildSwapRequestPayloads(plan),
    slotProposals: buildSlotChangeProposals(plan),
  };
}
