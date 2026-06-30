/* ------------------------------------------------------------------ */
/* impact.ts — detectores de impacto (estágio 3, PURO)                  */
/*                                                                      */
/* Recebe o plano + um SNAPSHOT das ocorrências já existentes (o        */
/* serviço faz o bulk-load e injeta — aqui é só dado) e descreve o que  */
/* MUDA. Épico A0: dois detectores apenas, severidade no MÁXIMO         */
/* 'attention' — nunca alarmista (Regra 6). `urgent`/vermelho é A1.     */
/*                                                                      */
/*  - same_day:       o plano coloca uma atividade num dia em que a     */
/*                    criança já tem (ou ganha) outra. "{child} tem N   */
/*                    provas em {date}." — nunca "CONFLITO!".           */
/*  - tight_sequence: atividades em dias consecutivos. "confira o tempo */
/*                    de preparo."                                       */
/*                                                                      */
/* Escopo: só dispara em dias que o PRÓPRIO plano toca (não relata      */
/* conflitos pré-existentes que o usuário não acabou de criar). E é     */
/* date-local por construção: uma consulta de dezembro NÃO colide com   */
/* provas de agosto. Determinístico, ordenado por data.                 */
/* ------------------------------------------------------------------ */

import type { ImpactFinding, MaterializationPlan } from "./types";
import { isParseableIsoDate } from "./confidence";

/** Ocorrência já existente (snapshot injetado pelo serviço). */
export interface ExistingOccurrence {
  childId: string | null;
  date: string; // YYYY-MM-DD
  title: string;
  recordId?: string;
}

/** Severidade por tipo — ambas ≤ 'attention' (Regra 6, sem 'urgent'). */
const SEVERITY = {
  same_day: "attention",
  tight_sequence: "info",
} as const;

interface Occurrence {
  childId: string | null;
  date: string;
  fromPlan: boolean;
}

/** Diferença em dias inteiros entre duas datas ISO (b - a). */
function dayDiff(a: string, b: string): number {
  const ta = Date.parse(a + "T12:00:00Z");
  const tb = Date.parse(b + "T12:00:00Z");
  return Math.round((tb - ta) / 86_400_000);
}

/**
 * Analisa o impacto do plano sobre o que já existe. Puro — não toca
 * banco; o serviço passa o snapshot escopado (criança + janela do plano).
 */
export function analyzeImpact(
  plan: MaterializationPlan,
  existing: ExistingOccurrence[],
): ImpactFinding[] {
  const planOccs: Occurrence[] = (plan.activities ?? [])
    .filter((a) => isParseableIsoDate(a.startDate))
    .map((a) => ({ childId: a.childId, date: a.startDate, fromPlan: true }));

  // Sem nada novo pra criar → sem impacto (nunca relatamos o pré-existente).
  if (planOccs.length === 0) return [];

  const existingOccs: Occurrence[] = existing
    .filter((e) => isParseableIsoDate(e.date))
    .map((e) => ({ childId: e.childId, date: e.date, fromPlan: false }));

  const all = [...planOccs, ...existingOccs];

  // Agrupa por criança. `null` (criança não resolvida) é seu próprio bucket
  // e não se mistura com nenhuma criança específica.
  const byChild = new Map<string, Occurrence[]>();
  for (const occ of all) {
    const key = occ.childId ?? "__null__";
    const list = byChild.get(key);
    if (list) list.push(occ);
    else byChild.set(key, [occ]);
  }

  const findings: ImpactFinding[] = [];

  for (const [, occs] of byChild) {
    const childId = occs[0].childId;

    // ── same_day: dias com ≥2 ocorrências E ao menos uma do plano ──
    const byDate = new Map<string, { total: number; hasPlan: boolean }>();
    for (const o of occs) {
      const slot = byDate.get(o.date) ?? { total: 0, hasPlan: false };
      slot.total += 1;
      slot.hasPlan = slot.hasPlan || o.fromPlan;
      byDate.set(o.date, slot);
    }
    for (const [date, slot] of byDate) {
      if (slot.total >= 2 && slot.hasPlan) {
        findings.push({
          kind: "same_day",
          severity: SEVERITY.same_day,
          date,
          childId,
          titleKey: "brain.impact.sameDay",
          titleVars: { childId, count: slot.total, date },
        });
      }
    }

    // ── tight_sequence: AGREGA corridas de dias consecutivos num ÚNICO aviso.
    //    Uma semana de provas (08→09→10→…) vira "provas em N dias seguidos
    //    (DD a DD)", não N avisos pareados. Sem isso o preview vira parede de
    //    alarmes âmbar — fere a hierarquia visual e o tom calmo (Regra 6). ──
    const planDates = new Set(occs.filter((o) => o.fromPlan).map((o) => o.date));
    const distinctDates = Array.from(new Set(occs.map((o) => o.date))).sort();
    let i = 0;
    while (i < distinctDates.length) {
      let j = i;
      while (j + 1 < distinctDates.length && dayDiff(distinctDates[j], distinctDates[j + 1]) === 1) j++;
      const runLen = j - i + 1;
      // Vira aviso só se a corrida tem ≥2 dias E o plano tocou ao menos um deles
      // (não relatamos sequências 100% pré-existentes que o usuário não criou).
      if (runLen >= 2 && distinctDates.slice(i, j + 1).some((d) => planDates.has(d))) {
        findings.push({
          kind: "tight_sequence",
          severity: SEVERITY.tight_sequence,
          date: distinctDates[i],
          childId,
          titleKey: "brain.impact.tightSequenceRun",
          titleVars: { childId, date1: distinctDates[i], date2: distinctDates[j], count: runLen },
        });
      }
      i = j + 1;
    }
  }

  // Ordem determinística: por data, depois por tipo (same_day antes).
  findings.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "same_day" ? -1 : 1;
    return 0;
  });

  return findings;
}
