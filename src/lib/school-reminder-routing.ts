/**
 * Roteamento do lembrete de véspera de prova pela PESSOA CERTA DO DIA
 * (Fatia R2 da épica Guarda & Rotina).
 *
 * Antes: o lembrete ia pra TODOS os admin/member do grupo. Agora, quando a
 * família tem guarda/rotina configurada, vai pra quem realmente responde
 * pela criança: a união de {responsável da VÉSPERA} ∪ {responsável do DIA
 * DA PROVA} — quem ajuda a estudar/arrumar na noite anterior E quem leva de
 * manhã. Deduplicado (na maioria dos dias é a mesma pessoa).
 *
 * FAIL-OPEN (inegociável): sem escala/rotina configurada, sem criança no
 * evento, ou alvo que saiu do grupo → cai no fanout atual (todos). Nunca
 * se deixa de avisar uma prova por falta de configuração.
 *
 * PURO: recebe snapshots, devolve user ids. O serviço faz o I/O.
 */

import type { CustodyEvent } from "./custody-resolve";
import type { RoutineOverride, RoutineSlot } from "./care-routine-resolve";
import { resolveResponsibleForDay, type GroupArrangement } from "./responsible-resolve";

/** Véspera (dateKey - 1 dia), UTC-safe. */
export function eveOf(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface PickExamReminderTargetsInput {
  arrangement: GroupArrangement;
  custodyEvents: readonly CustodyEvent[];
  slots: readonly RoutineSlot[];
  overrides: readonly RoutineOverride[];
  /** Criança da prova; null (evento sem criança) → fallback. */
  childId: string | null;
  /** Dia da prova (YYYY-MM-DD no fuso do grupo). */
  examDate: string;
  /** Membros elegíveis do grupo (admin/member) — o fallback E o filtro. */
  memberIds: readonly string[];
}

/**
 * Alvos do lembrete de véspera. Retorna SEMPRE uma lista não-vazia enquanto
 * houver membros: roteada quando dá, fanout completo quando não dá.
 */
export function pickExamReminderTargets(input: PickExamReminderTargetsInput): string[] {
  const fallback = [...new Set(input.memberIds)];
  if (input.childId === null || fallback.length === 0) return fallback;

  const membSet = new Set(input.memberIds);
  const targets = new Set<string>();
  for (const dateKey of [eveOf(input.examDate), input.examDate]) {
    const r = resolveResponsibleForDay({
      arrangement: input.arrangement,
      custodyEvents: input.custodyEvents,
      slots: input.slots,
      overrides: input.overrides,
      childId: input.childId,
      dateKey,
    });
    // Só membros elegíveis: um responsável que saiu do grupo não conta —
    // e se por isso ninguém sobrar, o fallback cobre.
    if (r.primary && membSet.has(r.primary.userId)) targets.add(r.primary.userId);
  }
  return targets.size > 0 ? [...targets] : fallback;
}
