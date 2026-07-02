/* ------------------------------------------------------------------ */
/* expense.ts — playbook de DESPESAS (Fase 2)                           */
/*                                                                      */
/* Narrativa "paguei 250 na consulta do Otto, divide com a Fernanda" →  */
/* itens de despesa validados. PURO (sem I/O): o classificador extrai,  */
/* o parse valida/normaliza (valor NUNCA inventado — sem valor o item   */
/* cai), o plan descreve. A materialização (fatia E2) escreve na tabela */
/* `expenses` existente com split PADRÃO do grupo — o splitHint é       */
/* informativo e o preview declara isso com honestidade.                */
/* ------------------------------------------------------------------ */

import type {
  ExpenseCategory,
  ExpenseItem,
  ExpensePlan,
  ExpenseSplitHint,
  MaterializationPlan,
  PlaybookContext,
} from "../../types";

const MAX_ITEMS = 5;
/** Teto de sanidade por item (extração alucinada/erro de vírgula). */
const MAX_AMOUNT_BRL = 100_000;
/** Gasto no passado até ~1 ano; "futuro" só uns dias (conta agendada). */
const PAST_HORIZON_DAYS = 370;
const FUTURE_HORIZON_DAYS = 30;

const CATEGORIES: readonly ExpenseCategory[] = [
  "education", "health", "food", "clothing",
  "transport", "leisure", "housing", "other",
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T12:00:00Z").getTime();
  const b = new Date(bIso + "T12:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Nome citado → criança do grupo (palavra inteira, sem acento/caixa;
 *  ambíguo/desconhecido → null, nunca chuta). Mesmo espírito do custody. */
function resolveChildId(name: unknown, ctx: PlaybookContext): string | null {
  if (typeof name !== "string" || !name.trim()) return ctx.resolvedChildId;
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const n = norm(name);
  const hits = ctx.children.filter((c) => {
    const first = norm((c.name || "").split(" ")[0]);
    return first.length >= 2 && new RegExp(`(^|[^a-z0-9])${first}([^a-z0-9]|$)`).test(n);
  });
  return hits.length === 1 ? hits[0].id : ctx.resolvedChildId;
}

function parseAmount(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded <= 0 || rounded > MAX_AMOUNT_BRL) return null;
  return rounded;
}

function parseSplitHint(raw: unknown): ExpenseSplitHint {
  return raw === "default" || raw === "payer_only" ? raw : null;
}

interface RawPayload {
  recognized_as?: unknown;
  items?: unknown;
}

export const expensePlaybook = {
  docType: "expense" as const,
  confirmation: "single" as const,
  playbookVersion: 1,
  policyVersion: 1,

  parse(payload: unknown, ctx: PlaybookContext): ExpensePlan | null {
    const raw = payload as RawPayload | null;
    if (!raw || raw.recognized_as !== "expense" || !Array.isArray(raw.items)) return null;

    const items: ExpenseItem[] = [];
    for (const it of raw.items as Array<Record<string, unknown>>) {
      if (items.length >= MAX_ITEMS) break;
      const amount = parseAmount(it.amount);
      if (amount === null) continue; // sem valor claro NÃO existe despesa

      const description =
        typeof it.description === "string" && it.description.trim()
          ? it.description.trim().slice(0, 140)
          : "Despesa";

      const category: ExpenseCategory = CATEGORIES.includes(it.category as ExpenseCategory)
        ? (it.category as ExpenseCategory)
        : "other";

      let expenseDate = typeof it.expenseDate === "string" && ISO_DATE.test(it.expenseDate)
        ? it.expenseDate
        : ctx.today;
      const delta = daysBetween(ctx.today, expenseDate);
      if (delta > FUTURE_HORIZON_DAYS || delta < -PAST_HORIZON_DAYS) expenseDate = ctx.today;

      items.push({
        description,
        amount,
        category,
        childId: resolveChildId(it.childName, ctx),
        expenseDate,
        splitHint: parseSplitHint(it.splitHint),
      });
    }

    return items.length > 0 ? { items } : null;
  },

  plan(data: ExpensePlan): MaterializationPlan {
    return {
      docType: "expense",
      confirmation: "single",
      activities: [],
      expense: data,
      collabRecordType: "expense",
    };
  },
};
