/* ------------------------------------------------------------------ */
/* brain-flow.ts — núcleo PURO do fluxo do Kindar Brain no WhatsApp     */
/*                                                                      */
/* O processador (I/O) fica fino; a lógica conversacional propensa a    */
/* erro mora aqui, pura e testável: detectar a intenção de calendário,  */
/* renderizar o preview/coordenação em TEXTO (o WhatsApp não tem card)  */
/* e PARSEAR a deseleção por mensagem ("tirar 2 e 4" / "manter 1 e 3" / */
/* "confirmar"). O mesmo IntakePreview vira card no PWA e frase no WA —  */
/* mesmo cérebro, canal diferente. i18n via `t` injetado (getServerT).  */
/* ------------------------------------------------------------------ */

import type { ImpactFinding, IntakePreview } from "@/lib/ai/brain/types";

/** Função de tradução (mesma forma do getServerT/useI18n: key + vars). */
export type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** "YYYY-MM-DD" → "DD/MM" (texto curto pro WhatsApp). */
function fmtBr(iso: string | undefined | null): string {
  if (!iso || iso.length < 10) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * Detecta a intenção de "calendário escolar" pela legenda da foto/arquivo.
 * Slash-commands e palavras naturais; conservador (sem legenda → false, pra
 * não sequestrar o fluxo de recibo/receita por engano).
 */
export function isCalendarIntent(caption: string | undefined): boolean {
  const c = (caption || "").toLowerCase().trim();
  if (!c) return false;
  // Slash/keyword explícita no início.
  if (/^\/?(escola|calend[aá]rio|provas?|av\d)\b/.test(c)) return true;
  // Natural.
  return /calend[aá]rio\s+(de\s+|das\s+)?(provas?|escolar|avalia)|cronograma\s+(de\s+)?provas?|datas?\s+(de\s+|das\s+)?provas?|calend[aá]rio\s+de\s+av/.test(
    c,
  );
}

/** Vars de impacto resolvendo o id da criança pro nome (igual ao PWA). */
function impactVars(f: ImpactFinding, childName: string): Record<string, string | number> {
  const v = (f.titleVars ?? {}) as Record<string, unknown>;
  return {
    child: childName,
    count: Number(v.count ?? 0),
    date: fmtBr(v.date as string),
    date1: fmtBr(v.date1 as string),
    date2: fmtBr(v.date2 as string),
  };
}

/**
 * Renderiza o preview como texto numerado (1 linha por prova: título — data
 * [· hora] [· conteúdo curto]) + impactos resumidos + chamada à ação. O número
 * de cada item é a base do "tirar 2 e 4". Mantém tom calmo (sem alarme).
 */
export function renderPreview(
  preview: IntakePreview,
  childName: string,
  t: TFn,
  opts?: { withCta?: boolean },
): string {
  const acts = preview.plan.activities ?? [];
  const lines = acts.map((a, i) => {
    const when = [fmtBr(a.startDate), a.timeStart || null].filter(Boolean).join(" ");
    const note = a.notes ? ` · ${a.notes.length > 80 ? a.notes.slice(0, 79) + "…" : a.notes}` : "";
    return `${i + 1}. *${a.name}* — ${when}${note}`;
  });

  const header =
    acts.length === 1
      ? `Encontrei 1 prova para ${childName}:`
      : `Encontrei ${acts.length} provas para ${childName}:`;

  let msg = `${header}\n${lines.join("\n")}`;

  if (preview.impacts.length > 0) {
    const impacts = preview.impacts.map((f) => `• ${t(f.titleKey, impactVars(f, childName))}`);
    msg += `\n\n${impacts.join("\n")}`;
  }

  // CTA de texto: incluído por padrão (canal sem botões). No WhatsApp com
  // botões interativos, o caller passa withCta:false e a chamada à ação vira o
  // corpo da mensagem de botões — evita CTA duplicado.
  if (opts?.withCta !== false) {
    msg += `\n\nConfirmo todas? Responda *Confirmar*, *Escolher* (pra tirar alguma) ou *Cancelar*.`;
  }
  return msg;
}

/** Mensagem de sucesso (espelha brain.confirm.savedNotice do app). */
export function renderExecuted(createdCount: number): string {
  const n = createdCount === 1 ? "1 prova" : `${createdCount} provas`;
  return `Pronto! Criei ${n} e vou avisar os responsáveis do grupo. 🗓️\n\nSe quiser, responda *Desfazer* pra reverter.`;
}

/** Mensagem de undo (calma, factual). */
export function renderUndone(removed: number): string {
  const n = removed === 1 ? "1 prova" : `${removed} provas`;
  return `Desfeito — removi ${n}. Pode mandar a foto de novo quando quiser.`;
}

const ALL = /\b(confirmar|confirma|todas|todos|tudo|sim|pode|criar)\b/;
const REMOVE = /\b(tirar|tira|remover|remove|excluir|exclui|menos|sem|n[aã]o)\b/;
const KEEP = /\b(manter|mant[eé]m|s[oó]|somente|apenas|deixar|deixa)\b/;

/**
 * Parseia a resposta da deseleção em keepIndices (0-based) prontos pro
 * confirmIntake. Aceita:
 *   - "confirmar" / "todas" / "sim"           → manter todas
 *   - "tirar 2 e 4" / "remover 2,4" / "sem 3" → remover esses (mantém o resto)
 *   - "manter 1 e 3" / "só 1 e 3" / "1 3"     → manter só esses
 * Números são 1-based (como o usuário vê). Fora do intervalo é ignorado.
 * Devolve null quando não dá pra entender (o caller repete a pergunta).
 */
export function parseKeepIndices(reply: string, total: number): number[] | null {
  if (total <= 0) return null;
  const r = (reply || "").toLowerCase().trim();
  if (!r) return null;

  const all = Array.from({ length: total }, (_, i) => i);
  const nums = Array.from(new Set((r.match(/\d+/g) ?? []).map(Number)))
    .filter((n) => n >= 1 && n <= total)
    .map((n) => n - 1)
    .sort((a, b) => a - b);

  const wantsRemove = REMOVE.test(r);
  const wantsKeep = KEEP.test(r);

  // "confirmar/todas/sim" SEM números e sem intenção de tirar → mantém todas.
  if (nums.length === 0) {
    if (ALL.test(r) && !wantsRemove) return all;
    return null; // não entendi (sem números e sem "todas")
  }

  if (wantsRemove && !wantsKeep) {
    return all.filter((i) => !nums.includes(i));
  }
  // "manter/só" OU só os números → manter exatamente esses.
  return nums;
}
