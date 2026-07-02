/* ------------------------------------------------------------------ */
/* family-memory.ts — Memória da Família (Fase 3, M1) — detector PURO   */
/*                                                                      */
/* O impact.ts olha pra FRENTE (conflitos que o plano cria); este       */
/* módulo olha pra TRÁS: o serviço injeta um SNAPSHOT do histórico      */
/* (escopado por playbook) e aqui viram ImpactFindings FACTUAIS —       */
/* datas, contagens e valores com fonte, nunca interpretação clínica    */
/* e nunca alarme (severity SEMPRE 'info'; Regra 6).                    */
/*                                                                      */
/* Puro por construção: sem I/O; testável com fixtures. Dormente: o     */
/* caller só busca o snapshot com FEATURE_BRAIN_FAMILY_MEMORY ligada.   */
/* ------------------------------------------------------------------ */

import type { ImpactFinding, MaterializationPlan } from "./types";

/** Mesma forma do getServerT/useI18n (key + vars) — injetado, módulo puro. */
export type MemoryTFn = (key: string, vars?: Record<string, string | number>) => string;

/** Fato de última consulta da criança (medical_appointments). */
export interface LastVisitFact {
  childId: string;
  date: string; // YYYY-MM-DD
  title: string;
  professional: string | null;
  recordId: string;
}

/** Retorno já marcado (medical_appointments.return_date) perto da consulta nova. */
export interface PendingReturnFact {
  childId: string;
  returnDate: string; // YYYY-MM-DD
  recordId: string;
}

/** Agregado do mês corrente pra UMA categoria de despesa. */
export interface ExpenseMonthFact {
  category: string;
  count: number; // despesas JÁ existentes no mês (sem contar a nova)
  totalFormatted: string; // "480,00" — formatado na carga (detector puro)
}

/** Compromissos da criança na mesma semana do evento novo. */
export interface BusyWeekFact {
  childId: string;
  count: number; // eventos JÁ existentes na semana (sem contar o novo)
}

export interface FamilyMemorySnapshot {
  lastVisit?: LastVisitFact | null;
  pendingReturn?: PendingReturnFact | null;
  expenseMonth?: ExpenseMonthFact[];
  busyWeek?: BusyWeekFact | null;
}

/** Snapshot vazio = memória desligada/nada relevante → zero findings. */
export const EMPTY_MEMORY: FamilyMemorySnapshot = {};

/**
 * (plan, memória) → findings retrospectivos. Determinístico e calmo:
 * cada fato vira NO MÁXIMO um finding, todos 'info', ordenados por tipo.
 */
export function analyzeRetroImpact(
  plan: MaterializationPlan,
  memory: FamilyMemorySnapshot,
): ImpactFinding[] {
  const findings: ImpactFinding[] = [];

  // ── Saúde: contexto da última consulta + retorno que esta pode fechar ──
  const visit = plan.health?.appointment;
  if (visit?.date) {
    const lv = memory.lastVisit;
    // Só é "última consulta" se for ANTERIOR à nova (a carga já filtra; o
    // guard cobre chamada errada) e da MESMA criança do plano.
    if (lv && lv.date < visit.date && (visit.childId === null || lv.childId === visit.childId)) {
      findings.push({
        kind: "last_visit_context",
        severity: "info",
        date: visit.date,
        childId: visit.childId,
        titleKey: "brain.impact.lastVisitContext",
        titleVars: { lastDate: lv.date, provider: lv.professional ? ` (${lv.professional})` : "" },
        relatedRecordId: lv.recordId,
      });
    }
    const pr = memory.pendingReturn;
    if (pr && (visit.childId === null || pr.childId === visit.childId)) {
      findings.push({
        kind: "followup_candidate",
        severity: "info",
        date: visit.date,
        childId: visit.childId,
        titleKey: "brain.impact.followupCandidate",
        titleVars: { date: pr.returnDate },
        relatedRecordId: pr.recordId,
      });
    }
  }

  // ── Despesas: "é a Nª dessa categoria no mês" (N = existentes + a nova) ──
  for (const item of plan.expense?.items ?? []) {
    const agg = (memory.expenseMonth ?? []).find((e) => e.category === item.category);
    if (agg && agg.count >= 1) {
      findings.push({
        kind: "expense_month_context",
        severity: "info",
        date: item.expenseDate,
        childId: item.childId,
        titleKey: "brain.impact.expenseMonthContext",
        titleVars: { n: agg.count + 1, total: agg.totalFormatted },
      });
    }
  }

  // ── Convite: semana da criança já movimentada ──
  const invite = plan.invite;
  const bw = memory.busyWeek;
  if (invite?.eventDate && bw && bw.count >= 2 && invite.childId === bw.childId) {
    findings.push({
      kind: "busy_week_context",
      severity: "info",
      date: invite.eventDate,
      childId: invite.childId,
      titleKey: "brain.impact.busyWeekContext",
      titleVars: { count: bw.count },
    });
  }

  return findings;
}

/* ---- Renderização (compartilhada: rotas do app + WhatsApp) ---- */

const MEMORY_KINDS = new Set<string>([
  "last_visit_context",
  "followup_candidate",
  "expense_month_context",
  "busy_week_context",
]);

/** "YYYY-MM-DD" → "DD/MM" (texto curto de chat). */
function fmtBr(iso: unknown): string {
  const s = typeof iso === "string" ? iso : "";
  return s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "";
}

function memoryVars(f: ImpactFinding, childName: string): Record<string, string | number> {
  const v = (f.titleVars ?? {}) as Record<string, unknown>;
  return {
    child: childName,
    count: Number(v.count ?? 0),
    n: Number(v.n ?? 0),
    total: String(v.total ?? ""),
    provider: String(v.provider ?? ""),
    lastDate: fmtBr(v.lastDate),
    date: fmtBr(v.date),
  };
}

/**
 * Linhas de MEMÓRIA pro preview (saúde/despesa/convite) — uma linha por
 * fato, prefixo 💭, tom calmo. Entra ANTES do CTA nos build*PreviewMessage.
 * Puro (t injetado); o escolar segue com o renderPreview próprio.
 */
export function renderMemoryLines(
  impacts: ImpactFinding[],
  childName: string,
  t: MemoryTFn,
): string[] {
  return impacts
    .filter((f) => MEMORY_KINDS.has(f.kind))
    .map((f) => `💭 ${t(f.titleKey, memoryVars(f, childName))}`);
}
