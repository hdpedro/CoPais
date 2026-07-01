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
 * Resumo de UMA linha do conteúdo da prova pro preview do WhatsApp (que não tem
 * card). O `notes` do playbook vem como `<conteúdo>\n\nOnde estudar: <fonte>` e
 * pode ser longo — no WhatsApp isso quebrava em várias linhas e o corte cego
 * caía no meio da palavra ("Onde e…"). Aqui: fica só o bloco PRIMÁRIO (o
 * conteúdo; "Onde estudar" é secundário e aparece inteiro no app/aba Escola),
 * colapsa espaços/quebras e trunca na FRONTEIRA DE PALAVRA. Puro/testável.
 */
export function clampNote(raw: string | undefined | null, max = 70): string {
  if (!raw) return "";
  // Só o 1º bloco (antes da 1ª linha em branco = antes do "Onde estudar").
  const primary = (raw.split(/\n\s*\n/)[0] || "").replace(/\s+/g, " ").trim();
  if (!primary) return "";
  // Borda: prova SEM conteúdo mas COM fonte → o playbook monta a nota já
  // começando por "Onde estudar" (sem paragrafo anterior). Como "Onde estudar" é
  // secundário (vive no app/aba Escola), no WhatsApp não mostramos snippet.
  if (/^onde\s+estudar/i.test(primary)) return "";
  if (primary.length <= max) return primary;
  const cut = primary.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  // Corta na última palavra inteira (a menos que isso jogue fora quase tudo);
  // remove pontuação/separador pendurado antes das reticências.
  const body = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:·—-]+$/, "");
  return `${body}…`;
}

/**
 * Detecta a intenção de "calendário escolar" pela legenda da foto/arquivo.
 * Slash-commands e palavras naturais; conservador (sem legenda → false, pra
 * não sequestrar o fluxo de recibo/receita por engano).
 */
export function isCalendarIntent(caption: string | undefined): boolean {
  const c = (caption || "").toLowerCase().trim();
  if (!c) return false;
  // "/escola" como SLASH-command explícito conta (intenção clara). Mas "escola"
  // NUA (sem barra) NÃO — legenda de recibo de mensalidade ("escola do João
  // R$ 850") é comum e deve ir pro OCR de despesa, não pro Brain.
  if (/^\/escola\b/.test(c)) return true;
  // Palavras fortes de calendário/prova, com ou sem barra.
  if (/^\/?(calend[aá]rio|provas?|av\d)\b/.test(c)) return true;
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
    const short = clampNote(a.notes);
    const note = short ? ` · ${short}` : "";
    return `${i + 1}. *${a.name}* — ${when}${note}`;
  });

  const header =
    acts.length === 1
      ? `Encontrei 1 prova para ${childName}:`
      : `Encontrei ${acts.length} provas para ${childName}:`;

  let msg = `${header}\n${lines.join("\n")}`;

  // Reenvio parcial: parte das provas já estava no Kindar (não repetimos).
  const already = preview.alreadyPresent ?? 0;
  if (already > 0) {
    msg +=
      `\n\n_(${already === 1 ? "1 prova dessa foto já estava" : `${already} provas dessa foto já estavam`} no Kindar — mostro só ${acts.length === 1 ? "a nova" : "as novas"}.)_`;
  }

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

/** Mensagem de undo (calma, factual). Espelha o serviço: quando `detached > 0`,
 *  uma prova foi ALTERADA depois (por outro responsável) e PERMANECE — não
 *  esconder isso (evita parecer perda de dado). `removed === 0` = nada a
 *  desfazer (ex: toque duplo). */
export function renderUndone(removed: number, detached = 0): string {
  if (removed === 0 && detached === 0) {
    return `Já estava desfeito — não havia nada a remover.`;
  }
  const n = removed === 1 ? "1 prova" : `${removed} provas`;
  if (detached > 0) {
    const d = detached === 1 ? "1 prova foi alterada" : `${detached} provas foram alteradas`;
    return `Desfeito — removi ${n}. ${d} depois e continua${detached === 1 ? "" : "m"} no calendário.`;
  }
  return `Desfeito — removi ${n}. Pode mandar a foto de novo quando quiser.`;
}

/* ------------------------------------------------------------------ */
/* SAÚDE (health_visit) no WhatsApp — helpers PUROS (pt-BR por design)   */
/* ------------------------------------------------------------------ */

/**
 * Intenção de CONSULTA pela legenda da foto/arquivo. Análogo conservador do
 * isCalendarIntent, SEM sobreposição (não pega "escola/calendário/provas").
 * "receita" nua NÃO conta (ambígua com recibo) — exige "receita médica" ou
 * slash/consulta explícita. Sem legenda → false.
 */
export function isConsultIntent(caption: string | undefined): boolean {
  const c = (caption || "").toLowerCase().trim();
  if (!c) return false;
  if (/^\/(consulta|receita|sa[uú]de)\b/.test(c)) return true;
  if (/^\/?(consulta|pediatra|dentista)\b/.test(c)) return true;
  return /consulta\s+(m[ée]dica|do|da|de|no|foi)|receita\s+m[ée]dica|resumo\s+da\s+consulta|pedido\s+de\s+exame|retorno\s+(m[ée]dico|do\s+m[ée]dico)/.test(
    c,
  );
}

/** Renderiza o preview de CONSULTA em texto (o WhatsApp não tem card). Mostra a
 *  consulta, a avaliação (citação), as medicações (dose/frequência ditas) e o
 *  retorno. É pro SUBMITTER revisar (dado dele) — o coparente recebe o resumo
 *  moderado via outbox. A0 confirma a cena inteira (sem deseleção numerada). */
export function renderHealthPreview(
  preview: IntakePreview,
  childName: string,
  opts?: { withCta?: boolean },
): string {
  const h = preview.plan.health;
  if (!h) return "";
  const lines: string[] = [`• ${h.appointment.title}${h.appointment.date ? ` — ${fmtBr(h.appointment.date)}` : ""}`];
  if (h.episode?.diagnosis) lines.push(`• Avaliação: ${h.episode.diagnosis}`);
  for (const m of h.medications ?? []) {
    const dose = [m.dosage, m.frequency].filter(Boolean).join(" · ") || "conforme prescrição";
    lines.push(`• 💊 ${m.name} — ${dose}`);
  }
  if (h.followUp?.date) lines.push(`• 🔁 Retorno: ${fmtBr(h.followUp.date)}`);
  let msg = `🩺 Organizei a consulta de ${childName}:\n${lines.join("\n")}`;
  if (opts?.withCta !== false) {
    msg += `\n\nRegistro no histórico de Saúde? Responda *Confirmar* ou *Cancelar*.`;
  }
  return msg;
}

/** Sucesso da consulta (espelha o app). */
export function renderHealthExecuted(): string {
  return `Pronto! Registrei a consulta no histórico de Saúde e vou avisar o outro responsável. 🩺\n\nSe quiser, responda *Desfazer* pra reverter.`;
}

/** Undo da consulta (calmo, factual). `removed === 0` = nada a desfazer. */
export function renderHealthUndone(removed: number): string {
  if (removed === 0) return `Já estava desfeito — não havia nada a remover.`;
  return `Desfeito — removi o registro da consulta do histórico de Saúde. Pode mandar de novo quando quiser.`;
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

/* ------------------------------------------------------------------ */
/* Classificação da resposta ao preview (fase preview) — PURA          */
/*                                                                     */
/* CRÍTICO: distinguir uma resposta AO BRAIN de uma mensagem qualquer, */
/* sem NUNCA confirmar por engano. Confirmação por palavra exige que a */
/* mensagem SEJA só palavras de confirmação (ancorada) — "pode ser dia */
/* 20?" NÃO confirma. Deseleção exige número no intervalo OU verbo de   */
/* tirar/manter. O que não for reconhecido vira `unknown` → o caller    */
/* deixa o assistente responder (não sequestra o processador).         */
/* ------------------------------------------------------------------ */

/** Só-confirmação: a mensagem inteira é composta de palavras de "sim". */
const CONFIRM_ONLY =
  /^((sim|ok|okay|pode|confirmar?|confirmo|confirmado|todas|todos|tudo|criar|isso|certo|manda|bora|beleza|blz|vai|pode ser|por favor|pf)[\s,.!]*)+$/i;
/** Só-cancelamento. */
const CANCEL_ONLY =
  /^((cancelar?|cancela|n[aã]o|nao|deixa|esquece|esque[cç]a|para|parar|nada|nenhuma|melhor n[aã]o)[\s,.!]*)+$/i;
/** Undo (fase executed): a mensagem inteira é composta de palavras de desfazer
 *  + fillers. Ancorada pra NÃO desfazer por engano (undo remove provas). */
const UNDO_ONLY =
  /^((desfazer|desfa[cç]a|desfaz|reverter|revert[aeê]|cancelar?|cancela|apagar?|apaga|voltar?|volta atr[aá]s|tudo|isso|essas?|as provas?|a prova|aquilo|de novo|por favor|pf)[\s,.!]*)+$/i;

export type BrainReplyIntent =
  | { action: "confirm" }
  | { action: "cancel" }
  | { action: "deselect"; keepIndices: number[] }
  | { action: "empty_selection" } // deseleção que não sobra nenhuma
  | { action: "bad_numbers" } // intenção de escolher, mas números inválidos
  | { action: "unknown" }; // não é resposta ao Brain → deixa cair no assistente

/**
 * Classifica a resposta de texto na fase preview. `awaitingSelection` = o
 * usuário acabou de tocar "Escolher" (esperamos números). Puro/testável.
 */
export function classifyBrainReply(
  reply: string,
  total: number,
  awaitingSelection: boolean,
): BrainReplyIntent {
  const r = (reply || "").trim();
  if (!r || total <= 0) return { action: "unknown" };
  if (CANCEL_ONLY.test(r)) return { action: "cancel" };

  const inRange = Array.from(new Set((r.match(/\d+/g) ?? []).map(Number))).filter(
    (n) => n >= 1 && n <= total,
  );
  const wantsSubset = REMOVE.test(r.toLowerCase()) || KEEP.test(r.toLowerCase());

  if (inRange.length > 0 || wantsSubset) {
    const keep = parseKeepIndices(r, total);
    if (keep === null) return { action: "bad_numbers" };
    if (keep.length === 0) return { action: "empty_selection" };
    if (keep.length >= total) return { action: "confirm" }; // manteve todas
    return { action: "deselect", keepIndices: keep };
  }

  // Dígito fora do intervalo só é tratado como resposta (número errado) quando
  // acabamos de pedir a seleção; senão é mensagem qualquer ("pode ser dia 20?").
  if (awaitingSelection && /\d/.test(r)) return { action: "bad_numbers" };

  if (CONFIRM_ONLY.test(r)) return { action: "confirm" };
  return { action: "unknown" };
}

/** A resposta (fase executed) é um pedido de desfazer? Puro/ancorado. */
export function isUndoReply(reply: string): boolean {
  return UNDO_ONLY.test((reply || "").trim());
}

/** RECUSA do desfazer (fase executed): o usuário respondeu "Precisa reverter?"
 *  dizendo que está tudo certo ("não", "tá bom", "pode deixar", "obrigado"…).
 *  Ancorado (mensagem INTEIRA é uma recusa/fechamento) pra não capturar uma
 *  pergunta qualquer ("não sei o saldo") — essa cai no assistente. Checado
 *  DEPOIS do undo, então frases com "desfazer" já foram tratadas. Puro. */
const DECLINE_UNDO =
  /^(n[aã]o|nao|nops?|nn|deixa|deixa assim|t[aá] bom|t[aá] certo|tudo certo|tudo bem|pode deixar|n[aã]o precisa|n[aã]o precisa desfazer|sem desfazer|n[aã]o quero desfazer|obrigad[oa]|valeu|perfeito|[óo]timo|t[aá] [óo]timo|beleza|blz|ok|okay|show|isso mesmo|combinado|tranquilo|ta tranquilo)[\s,.!👍🙂✅😊]*$/i;
export function isDeclineUndoReply(reply: string): boolean {
  return DECLINE_UNDO.test((reply || "").trim());
}

/** Casa a resposta do usuário a uma criança pelo PRIMEIRO nome (sem acento/caso).
 *  Aceita o nome exato ou uma frase que o contenha ("quero o Martim"). Retorna o
 *  id ou null. Puro. */
export function matchChildName(
  reply: string,
  options: Array<{ id: string; name: string }>,
): string | null {
  const norm = (s: string) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const r = norm(reply);
  if (!r) return null;
  for (const o of options) {
    const first = norm((o.name || "").split(" ")[0] || "");
    if (first && (r === first || new RegExp(`\\b${first}\\b`).test(r))) return o.id;
  }
  return null;
}

/** Confirma "é calendário" (fallback quando o recibo falhou). Ancorado — só
 *  palavras de sim/calendário, pra não capturar uma mensagem qualquer. */
// Sem "escola"/"escolar"/"pode" soltos (a oferta pede "responda *calendário*";
// eram falso-positivos — uma msg qualquer com "pode"/"escola" reprocessava).
const CALENDAR_YES =
  /^((calend[aá]rio|provas?|prova|sim|isso|[eé]|eh|ok|isso mesmo|[ée] sim)[\s,.!]*)+$/i;
export function isCalendarYes(reply: string): boolean {
  return CALENDAR_YES.test((reply || "").trim());
}
