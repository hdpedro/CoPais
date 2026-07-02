/**
 * Resolvedor ÚNICO "quem responde pela criança no dia X" — ciente do ARRANJO.
 *
 * O Kindar tem guarda PLURAL: pais separados (rotating/custom, via
 * `custody_events` com precedência swap > exceção/férias > regular) E pais
 * juntos/solo (together/single, via rotina de leva & busca). Este módulo
 * COMPÕE os dois resolvedores puros já existentes (`custody-resolve.ts` e
 * `care-routine-resolve.ts`) num retorno rico + uma política de `primary`
 * (o alvo padrão de notificação single-destinatário — ex.: lembrete de
 * véspera de prova vai pra quem está com a criança, não pro admin fixo).
 *
 * Regras:
 *  - ZERO lógica nova de precedência de guarda: reusa `pickCustodyWinner`.
 *  - Férias/eventos FAMÍLIA-TODA (`child_id = null`) valem pra criança —
 *    mesclamos candidatos da criança + do grupo numa aplicação ÚNICA da
 *    precedência (uma vacation família-toda prio-2 vence o regular prio-3
 *    da criança; um swap prio-1 da criança vence a vacation).
 *  - `custody_based` da rotina ganha o resolver de guarda injetado de graça.
 *  - Evento de guarda EXPLÍCITO (swap/exceção/férias) vence a rotina mesmo
 *    em together/single: registrar um evento é intenção explícita da família.
 *  - Fail-open: sem dado → `primary: null` → o call-site MANTÉM o fanout
 *    atual (nunca se deixa de avisar por falta de escala configurada).
 *
 * PURO: sem I/O, sem Date.now — data é injetada (dateKey YYYY-MM-DD, BRT).
 */

import { pickCustodyWinner, type CustodyEvent } from "./custody-resolve";
import {
  resolveRoutineOnDate,
  type ResolvedLeg,
  type RoutineOverride,
  type RoutineSlot,
} from "./care-routine-resolve";

/** Valores de coparenting_groups.arrangement (migration 00113). */
export type GroupArrangement = "rotating" | "together" | "single" | "custom";

export type ResolvedCustodian = {
  userId: string;
  /** custody_type vencedor (swap/exception/vacation/regular/holiday/special). */
  source: string;
};

export type ResponsiblePrimary = {
  userId: string;
  reason: "custodian" | "dropoff" | "pickup";
};

export interface ResponsibleForDay {
  /** Vencedor da GUARDA no dia (null quando não há evento cobrindo). */
  custodian: ResolvedCustodian | null;
  /** Quem LEVA no dia (override > slot; null sem atribuição). */
  dropoff: ResolvedLeg | null;
  /** Quem BUSCA no dia. */
  pickup: ResolvedLeg | null;
  /** Alvo padrão pra notificação de destinatário único. null = sem dado →
   *  o call-site usa o comportamento atual (fanout largo). */
  primary: ResponsiblePrimary | null;
}

export interface ResolveResponsibleInput {
  arrangement: GroupArrangement;
  /** Eventos de guarda do GRUPO (a mescla criança+família-toda é daqui). */
  custodyEvents: readonly CustodyEvent[];
  slots: readonly RoutineSlot[];
  overrides: readonly RoutineOverride[];
  childId: string;
  /** YYYY-MM-DD no fuso do grupo. */
  dateKey: string;
}

/** Tipos de guarda que representam intenção EXPLÍCITA (vencem a rotina
 *  mesmo em together/single). Exportado: o calendário usa a MESMA lista pra
 *  mostrar dias combinados quando a escala está desligada (custody_enabled
 *  false — ex.: pais que moram juntos). */
export const EXPLICIT_CUSTODY = new Set(["swap", "exception", "vacation"]);

/**
 * Vencedor da guarda no dia considerando eventos da criança E da família
 * toda (`child_id = null`) numa única aplicação da precedência.
 * (O `resolveCustodyOnDate` existente filtra por igualdade estrita de
 * child_id, então férias família-toda ficariam de fora — por isso a mescla
 * vive aqui, reusando o MESMO `pickCustodyWinner`.)
 */
export function resolveCustodianOnDate(
  events: readonly CustodyEvent[],
  childId: string,
  dateKey: string,
): ResolvedCustodian | null {
  const candidates = events.filter(
    (e) =>
      (e.child_id === childId || e.child_id === null) &&
      e.start_date <= dateKey &&
      e.end_date >= dateKey,
  );
  const winner = pickCustodyWinner(candidates);
  return winner ? { userId: winner.responsible_user_id, source: winner.custody_type } : null;
}

/** Política do alvo padrão por arranjo (documentada no design doc). */
function pickPrimary(
  arrangement: GroupArrangement,
  custodian: ResolvedCustodian | null,
  dropoff: ResolvedLeg | null,
  pickup: ResolvedLeg | null,
): ResponsiblePrimary | null {
  if (arrangement === "rotating" || arrangement === "custom") {
    // Separados: quem está COM a criança. Rotina só como fallback (grupos
    // custom podem viver de leva/busca sem escala noturna configurada).
    if (custodian) return { userId: custodian.userId, reason: "custodian" };
    if (dropoff) return { userId: dropoff.responsibleId, reason: "dropoff" };
    if (pickup) return { userId: pickup.responsibleId, reason: "pickup" };
    return null;
  }
  // Juntos/solo: o dia é da ROTINA — mas um evento de guarda explícito
  // (férias/exceção/troca registrada) representa intenção e vence.
  if (custodian && EXPLICIT_CUSTODY.has(custodian.source)) {
    return { userId: custodian.userId, reason: "custodian" };
  }
  if (dropoff) return { userId: dropoff.responsibleId, reason: "dropoff" };
  if (pickup) return { userId: pickup.responsibleId, reason: "pickup" };
  if (custodian) return { userId: custodian.userId, reason: "custodian" };
  return null;
}

/**
 * Resolve o dia inteiro de uma criança: guarda + leva/busca + alvo padrão.
 */
export function resolveResponsibleForDay(input: ResolveResponsibleInput): ResponsibleForDay {
  const custodian = resolveCustodianOnDate(input.custodyEvents, input.childId, input.dateKey);
  // Slots custody_based derivam da guarda — injeta o resolvedor daqui,
  // já com a mescla família-toda.
  const routine = resolveRoutineOnDate(
    input.slots,
    input.overrides,
    input.childId,
    input.dateKey,
    (cid, dk) => resolveCustodianOnDate(input.custodyEvents, cid, dk)?.userId ?? null,
  );
  return {
    custodian,
    dropoff: routine.dropoff,
    pickup: routine.pickup,
    primary: pickPrimary(input.arrangement, custodian, routine.dropoff, routine.pickup),
  };
}
