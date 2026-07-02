/* ------------------------------------------------------------------ */
/* expense-preview.ts — copy PURA da prévia de despesas (Fase 2)        */
/*                                                                      */
/* Uma linha humana por despesa + o TOTAL + a verdade do split: v1      */
/* registra na divisão PADRÃO do grupo (o coparente aprova na tela      */
/* Despesas, fluxo normal do módulo). Se a narrativa disse "paguei      */
/* sozinho", a prévia declara o limite com honestidade em vez de mudar  */
/* regra financeira em silêncio. Reusável: widget + WhatsApp + native.  */
/* ------------------------------------------------------------------ */

import type { ExpensePlan } from "./types";

function brl(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Mensagem de prévia completa. `withCta:false` = sem a pergunta final
 *  (o WhatsApp anexa a própria mensagem de botões). */
export function buildExpensePreviewMessage(
  plan: ExpensePlan,
  nameOf: (childId: string) => string,
  opts?: { withCta?: boolean },
): string {
  const lines = plan.items.map((it) => {
    const child = it.childId ? nameOf(it.childId) : "";
    const who = child ? ` · ${child}` : "";
    return `• ${it.description} — ${brl(it.amount)}${who} · ${ddmm(it.expenseDate)}`;
  });
  const total = Math.round(plan.items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const payerOnly = plan.items.some((i) => i.splitHint === "payer_only");

  let msg = `💳 Entendi ${plan.items.length === 1 ? "essa despesa" : "essas despesas"}:\n${lines.join("\n")}`;
  if (plan.items.length > 1) msg += `\nTotal: ${brl(total)}`;
  msg += `\nRegistro na divisão padrão do grupo — quem divide aprova na tela Despesas.`;
  if (payerOnly) {
    msg += `\n(Você disse que pagou sozinho — dá pra ajustar a divisão na tela Despesas.)`;
  }
  if (opts?.withCta !== false) msg += `\nPosso registrar?`;
  return msg;
}
