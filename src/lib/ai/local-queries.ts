/* ------------------------------------------------------------------ */
/* local-queries.ts                                                    */
/* Determinístico — substitui o LLM em queries, síntese e drafts.      */
/*                                                                      */
/* Fluxo:                                                              */
/*   1. parseQueryIntent(text)  — regex pra ~40 perguntas frequentes   */
/*   2. fuzzyMatchIntent(text)  — BM25-light fallback (sem ML)         */
/*   3. dispatchCustomAction()  — handlers customizados (síntese/drafts)*/
/* ------------------------------------------------------------------ */

import type { ToolContext, ToolResult } from "./tools";
import { parseRelativeDate } from "./local-parser";
import {
  levenshtein,
  stemPT,
  findNextHoliday,
  parseRelativeOffset,
  parseOrdinalDayInMonth,
  splitMultiIntent,
  hasPronoun,
  expandAbbreviations,
} from "./local-helpers";
import { formatBRL as formatBRLShared } from "@/lib/format/currency";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface QueryIntent {
  action: string;
  params: Record<string, string>;
  confidence: number;
}

export interface ResolvedPeriod {
  startISO: string;
  endISO: string;
  label: string;
  kind: "day" | "week" | "month" | "year" | "custom";
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function fmtBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRL(v: number): string {
  // Delegamos ao helper canônico pra grouping correto (R$ 1.234,56).
  return formatBRLShared(v);
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Resolução de filhos (com apelido por prefixo)                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve nome de filho aceitando prefixos curtos (apelidos): "Bê" → "Bernardo".
 * Exige prefixo de pelo menos 2 chars únicos entre os filhos pra evitar colisão.
 */
export function resolveChild(
  text: string,
  children: ToolContext["children"],
): ToolContext["children"][number] | null {
  const n = norm(text);
  if (children.length === 0) return null;

  // Match por nome completo primeiro
  for (const c of children) {
    const first = norm(c.name.split(" ")[0]);
    if (!first) continue;
    if (new RegExp(`\\b${first}\\b`).test(n)) return c;
  }

  // Tenta apelido: prefixo de 2-4 chars que casa com exatamente um filho
  const tokens = n.split(/\s+/).filter((t) => t.length >= 2 && t.length <= 4);
  for (const tok of tokens) {
    const candidates = children.filter((c) =>
      norm(c.name.split(" ")[0]).startsWith(tok),
    );
    if (candidates.length === 1) return candidates[0];
  }

  // Se há só 1 filho e a frase fala em "filho/criança/ele/ela", auto-resolve
  if (children.length === 1) {
    if (/\b(filh[oa]|crianc|nene|bebe|ele|ela)\b/.test(n)) return children[0];
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Resolução de membros / coparente                                    */
/* ------------------------------------------------------------------ */

/**
 * Detecta se o usuário se refere a si mesmo: "eu", "comigo", "meu/minha".
 */
export function refersToSelf(text: string): boolean {
  const n = norm(text);
  return /\b(eu|comigo|mim|meu|minha|meus|minhas)\b/.test(n);
}

/**
 * Resolve um membro do grupo a partir de nome próprio OU papel
 * ("mãe", "pai", "ex", "outro pai", "outra mãe"). Quando há ambiguidade
 * (2+ membros do mesmo gênero), retorna o primeiro que NÃO é o currentUser.
 */
export function resolveMember(
  text: string,
  members: ToolContext["members"],
  currentUserId: string,
): ToolContext["members"][number] | null {
  const n = norm(text);
  if (members.length === 0) return null;

  // 1. Nome próprio
  for (const m of members) {
    const first = norm(m.name.split(" ")[0]);
    if (!first) continue;
    if (new RegExp(`\\b${first}\\b`).test(n)) return m;
  }

  // 2. Papel — "mãe/pai/ex/coparente/outro/outra/marido/esposa"
  const isCoparentRef = /\b(mae|pai|mamae|papai|ex|coparente|marido|esposa|companheir[oa]|outr[oa]\s+(pai|mae|coparente))\b/.test(n);
  if (isCoparentRef) {
    const others = members.filter((m) => m.id !== currentUserId);
    if (others.length === 1) return others[0];
    if (others.length > 1) return others[0]; // primeiro coparente
  }

  return null;
}

/**
 * Resolve avós como alvo de mensagem. Retorna o membro real se existir
 * no grupo; senão devolve apenas a string do papel ("vovó", "vovô").
 */
export function resolveGrandparentLabel(text: string, members: ToolContext["members"]): string {
  const n = norm(text);
  if (/\b(vov[oó]|av[oó]|minha\s+m[ãa]e|meu\s+pai|sogr[oa])\b/.test(n)) {
    // Tenta achar membro com role tipo "grandparent" — se não houver, retorna label
    for (const m of members) {
      const fn = norm(m.name);
      if (/\b(vov|av|sogr)/.test(fn)) return m.name.split(" ")[0];
    }
    if (/vov[oô]|av[oô]/.test(n)) return "vovô";
    return "vovó";
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Períodos: "esse mês", "em junho", "essa semana", "fim de semana"   */
/* ------------------------------------------------------------------ */

const PT_MONTHS_FULL: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

export function parsePeriod(text: string): ResolvedPeriod | null {
  const n = norm(text);
  const today = new Date();

  // "hoje"
  if (/\bhoje\b/.test(n)) {
    const t = todayISO();
    return { startISO: t, endISO: t, label: "hoje", kind: "day" };
  }

  // "ontem"
  if (/\bontem\b/.test(n)) {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    const iso = isoOf(d);
    return { startISO: iso, endISO: iso, label: "ontem", kind: "day" };
  }

  // "amanhã"
  if (/\bamanha\b/.test(n)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    const iso = isoOf(d);
    return { startISO: iso, endISO: iso, label: "amanhã", kind: "day" };
  }

  // "fim de semana"
  if (/\bfim\s+de\s+semana\b|\bfinde\b/.test(n)) {
    const d = new Date(today);
    const dow = d.getDay();
    let satOffset: number;
    if (/que\s+vem|proxim/.test(n)) {
      satOffset = (6 - dow + 7) % 7 || 7; // próximo sábado
    } else {
      // fim de semana atual: se hoje é dom, usa o anterior; senão próximo
      satOffset = dow === 0 ? -1 : (6 - dow);
    }
    const sat = new Date(d); sat.setDate(d.getDate() + satOffset);
    const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    return {
      startISO: isoOf(sat),
      endISO: isoOf(sun),
      label: "fim de semana",
      kind: "custom",
    };
  }

  // "semana passada"
  if (/semana\s+passad/.test(n)) {
    const d = new Date(today);
    const dow = d.getDay() || 7;
    const monday = new Date(d); monday.setDate(d.getDate() - dow - 6);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { startISO: isoOf(monday), endISO: isoOf(sunday), label: "semana passada", kind: "week" };
  }

  // "semana que vem" / "próxima semana"
  if (/semana\s+que\s+vem|proxim[ao]?\s+semana/.test(n)) {
    const d = new Date(today);
    const dow = d.getDay() || 7;
    const monday = new Date(d); monday.setDate(d.getDate() - dow + 8);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { startISO: isoOf(monday), endISO: isoOf(sunday), label: "semana que vem", kind: "week" };
  }

  // "essa semana" / "nessa semana"
  if (/(?:ess?a|nessa|esta|nesta)\s+semana|\bsemana\b/.test(n)) {
    const d = new Date(today);
    const dow = d.getDay() || 7;
    const monday = new Date(d); monday.setDate(d.getDate() - dow + 1);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { startISO: isoOf(monday), endISO: isoOf(sunday), label: "essa semana", kind: "week" };
  }

  // "mês passado"
  if (/m[eê]s\s+passad/.test(n)) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { startISO: isoOf(start), endISO: isoOf(end), label: "mês passado", kind: "month" };
  }

  // "mês que vem" / "próximo mês"
  if (/m[eê]s\s+que\s+vem|proxim[oa]?\s+m[eê]s/.test(n)) {
    const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return { startISO: isoOf(start), endISO: isoOf(end), label: "mês que vem", kind: "month" };
  }

  // "em junho" / "no mês de junho" / "no mês de jun"
  const monthMatch = n.match(/(?:em|no\s+m[eê]s\s+de|de)\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/);
  if (monthMatch) {
    const monthIdx = PT_MONTHS_FULL[monthMatch[1]];
    const year = monthIdx < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear();
    const start = new Date(year, monthIdx, 1);
    const end = new Date(year, monthIdx + 1, 0);
    return { startISO: isoOf(start), endISO: isoOf(end), label: monthMatch[1], kind: "month" };
  }

  // "esse mês"
  if (/(?:ess?e|nesse|este|neste)\s+m[eê]s|\bm[eê]s\b/.test(n)) {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { startISO: isoOf(start), endISO: isoOf(end), label: "esse mês", kind: "month" };
  }

  // "esse ano"
  if (/(?:ess?e|este)\s+ano|\bno\s+ano\b/.test(n)) {
    const start = new Date(today.getFullYear(), 0, 1);
    const end = new Date(today.getFullYear(), 11, 31);
    return { startISO: isoOf(start), endISO: isoOf(end), label: "esse ano", kind: "year" };
  }

  // "daqui 3 dias", "em 2 semanas", "daqui a 1 mês"
  const offset = parseRelativeOffset(text);
  if (offset) {
    const iso = isoOf(offset);
    return { startISO: iso, endISO: iso, label: text.toLowerCase().match(/daqui[^.]*|em[^.]*dias?|em[^.]*semanas?|em[^.]*m[eê]s/)?.[0] || "data futura", kind: "day" };
  }

  // "primeiro fim de semana de junho", "última segunda de maio"
  const ord = parseOrdinalDayInMonth(text);
  if (ord) {
    const iso = isoOf(ord);
    // Se foi "fim de semana", expande pra sáb+dom
    if (/fim\s+de\s+semana|finde|fds/.test(n)) {
      const sun = new Date(ord); sun.setDate(ord.getDate() + 1);
      return { startISO: iso, endISO: isoOf(sun), label: "fim de semana", kind: "custom" };
    }
    return { startISO: iso, endISO: iso, label: "data ordinal", kind: "day" };
  }

  // "no carnaval", "na páscoa", "no feriado de [nome]"
  const holiday = findNextHoliday(text);
  if (holiday) {
    const iso = isoOf(holiday.date);
    return { startISO: iso, endISO: iso, label: holiday.name, kind: "day" };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* parseQueryIntent — orquestrador principal                           */
/* ------------------------------------------------------------------ */

export interface QueryParseContext {
  children: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
  currentUserId: string;
}

export function parseQueryIntent(
  text: string,
  ctx: QueryParseContext,
): QueryIntent | null {
  if (!text || !text.trim()) return null;
  // Expansão de abreviações ANTES da normalização (vc, tb, q, pq, hj, amh, ...)
  const expanded = expandAbbreviations(text);
  const n = norm(expanded);

  /* ---- 0a. HELP / O QUE VOCÊ FAZ ---- */
  if (/^\s*(?:ajuda|help|comandos?|tutorial|menu|\?+|o\s+que\s+(?:voc[eê]|vc)\s+faz|como\s+(?:funciona|usar?|uso)|posso\s+fazer\s+o\s+qu[eê])\s*[?!.]*\s*$/.test(n)
      || /\bcomandos\s+disponiveis\b/.test(n)) {
    return { action: "customHelp", params: {}, confidence: 0.95 };
  }

  /* ---- 0b. GREETING (oi, olá, bom dia, tchê, oxe, mano) ---- */
  if (/^\s*(?:oi+|ola+|opa|alo+|bom\s+dia|boa\s+(?:tarde|noite)|hey|e\s*ai+|salve(?:\s+familia)?|tche|oxe|mano|fala|fala\s*ai|qual\s+a\s+boa)\s*[!.,?]*\s*$/.test(n)) {
    return { action: "customGreeting", params: {}, confidence: 0.9 };
  }

  /* ---- 0c. THANKS (obrigado, valeu) ---- */
  if (/^\s*(?:obrigad[oa]+|valeu+|vlw+|thx+|brigad[oa]+|agradec)[!.\s]*$/.test(n)) {
    return { action: "customThanks", params: {}, confidence: 0.95 };
  }

  /* ---- 0d. DRAFT MESSAGE (cedo — signal forte de redação) ---- */
  if (/(?:redig|escrev[ae]r?\s+(?:uma\s+)?mensagem|mensagem\s+pra|mensagem\s+para|mandar?\s+mensagem|preciso\s+falar\s+com|como\s+(?:eu\s+)?(?:falo|digo)|texto\s+pra|texto\s+para)/.test(n)) {
    const target = resolveMember(expanded, ctx.members, ctx.currentUserId);
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "customDraftMessage",
      params: {
        rawText: text,
        targetName: target?.name.split(" ")[0] || resolveGrandparentLabel(expanded, ctx.members) || "",
        childName: child?.name.split(" ")[0] || "",
      },
      confidence: 0.8,
    };
  }

  /* ---- 1. CUSTODY COUNT (quantos dias / quantos finais de semana) ---- */
  if (/quantos?\s+(?:dias?|finais|fins\s+de\s+semana|fim\s+de\s+semana|fds)/.test(n)
      && /(guarda|fic[oa]|comigo|com\s+(?:o\s+)?(?:pai|mae|coparente)|tenho|peg[oa])/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    const period = parsePeriod(expanded);
    const target = resolveMember(expanded, ctx.members, ctx.currentUserId);
    const isSelf = refersToSelf(text) || (!target);
    const granularity = /finais|fins\s+de\s+semana|fim\s+de\s+semana/.test(n) ? "weekend" : "day";

    return {
      action: "customCustodyCount",
      params: {
        childName: child?.name || "",
        periodStart: period?.startISO || "",
        periodEnd: period?.endISO || "",
        periodLabel: period?.label || "esse mês",
        targetUserId: isSelf ? ctx.currentUserId : (target?.id || ctx.currentUserId),
        targetName: isSelf ? "você" : (target?.name.split(" ")[0] || "você"),
        granularity,
      },
      confidence: 0.85,
    };
  }

  /* ---- 2. NEXT CUSTODY (quando vou pegar / próxima vez) ---- */
  if (/(?:quando|qual\s+a\s+proxim[ao]?\s+vez)\s+(?:vou|que\s+(?:eu\s+)?(?:vou|fico|pego))/.test(n)
      || /proxim[ao]?\s+vez\s+que\s+(?:fico|pego)/.test(n)
      || /quando\s+(?:eu\s+)?(?:fico|pego)\s+(?:com|o|a)/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "customNextCustody",
      params: { childName: child?.name || "" },
      confidence: 0.8,
    };
  }

  /* ---- 3. CUSTODY HOJE / DIA X (get_custody_info) ---- */
  if (/(quem\s+(?:esta|ta|fica|pega|leva)\s+com|de\s+quem\s+e\s+a\s+vez|guarda\s+(?:hoje|amanha|dia)|com\s+quem\s+(?:esta|fica))/.test(n)
      || /\bguarda\b/.test(n)) {
    const explicitDate = parseRelativeDate(expanded) || todayISO();
    return {
      action: "queryCustody",
      params: { date: explicitDate },
      confidence: 0.85,
    };
  }

  /* ---- 11.5. ESCOLA (info escolar) ---- */
  if (/(?:em\s+que\s+)?(?:escola|colegio|serie|turma|professor|coordenador|diretor)\b/.test(n)
      && !/criar?|nov[oa]|registr|paguei|gast|despesa|endereco|onde\s+(?:busco|pego|deixo)/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "customSchoolInfo",
      params: { childName: child?.name || "" },
      confidence: 0.8,
    };
  }

  /* ---- 11.6. NOTAS RECENTES (anotações privadas) ---- */
  if (/(?:minhas?\s+notas|notas\s+recentes|ultimas?\s+anotac|ultimas?\s+notas?|tenho\s+(?:alguma|alguma\s+)?nota|lembret)/.test(n)
      && !/\b(?:criar|nova|anotar|registrar)\b/.test(n)) {
    return { action: "customRecentNotes", params: {}, confidence: 0.8 };
  }

  /* ---- 11.7. DECISÕES ABERTAS ---- */
  if (/(?:decis(?:ao|ões|oes)\s+(?:abertas?|pendent|em\s+(?:votac|aberto))|votac(?:ao|oes)\s+(?:em\s+)?aberto|pra\s+decidir|temos?\s+(?:que\s+)?decidir)/.test(n)) {
    return { action: "customOpenDecisions", params: {}, confidence: 0.85 };
  }

  /* ---- 11.8. ACORDOS ATIVOS ---- */
  if (/(?:acordos?\s+(?:ativos?|atuais?|em\s+vigor|combinad)|combinamos|nossos?\s+acordos?|regras?\s+(?:da\s+)?(?:familia|casa))/.test(n)) {
    return { action: "customActiveAgreements", params: {}, confidence: 0.85 };
  }

  /* ---- 11.9. PRÓXIMO ITEM DA AGENDA HOJE ---- */
  if (/(?:proxim[ao]|qual\s+a\s+proxim[ao])\s+(?:coisa|atividade|evento|item|consulta|compromiss)\s+(?:de\s+)?hoje|hoje\s+tem\s+(?:o\s+)?qu[eê]|o\s+que\s+vem\s+(?:agora|na\s+sequencia)/.test(n)) {
    return { action: "customTodayNext", params: {}, confidence: 0.85 };
  }

  /* ---- 0e. DAY OVERVIEW (cedo pra não cair em queryStatus via "como ta") ---- */
  if (/(?:tudo\s+(?:certo|bem|ok)\s+(?:pra|para|hoje|hj)|esta\s+tudo\s+certo|panorama\s+(?:de\s+|do\s+)?(?:hoje|dia)|como\s+(?:esta|ta)\s+(?:o\s+)?dia|tem\s+algo\s+(?:de\s+)?diferente\s+hoje|surpresa\s+hoje|resumo\s+(?:de\s+|do\s+)?hoje)/.test(n)) {
    return { action: "customDayOverview", params: {}, confidence: 0.85 };
  }

  /* ---- 0f. CARTEIRA DE VACINAÇÃO (cedo pra não cair em queryHealth) ---- */
  if (/(?:carteira\s+de\s+vacin|historico\s+de\s+vacin|vacinas?\s+(?:tomada|aplicada|em\s+dia|atrasada|que\s+ja)|lista\s+de\s+vacin|quais\s+vacinas|todas\s+as\s+vacinas)/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "customVaccinationRecord",
      params: { childName: child?.name || "" },
      confidence: 0.9,
    };
  }

  /* ---- 0g. ENDEREÇO (cedo pra não cair em customSchoolInfo/queryChildren) ---- */
  if (/(?:onde\s+(?:busco|pego|deixo)|endereco\s+(?:da\s+)?escola|qual\s+(?:o\s+)?endereco|qual\s+(?:a\s+)?localiz)/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "customAddress",
      params: { childName: child?.name || "" },
      confidence: 0.9,
    };
  }

  /* ---- 0h. CONTATO PROFISSIONAL (cedo pra não cair em queryHealth) ---- */
  if (/(?:telefone|tel|numero|contato|whatsapp|wpp|endereco)\s+(?:do|da|de)?\s*(?:pediatra|medic[ao]|dentista|oftalm|dermat|ortop|fonoaud|psico|nutri|terapeu|profissional|doutor[a]?)/.test(n)
      || /(?:qual\s+o\s+|qual\s+a\s+)?(?:pediatra|dentista|medic[ao]|profissional)\s+(?:do|da|de\s+)\b/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "customProfessionalContact",
      params: { childName: child?.name || "", rawText: text },
      confidence: 0.85,
    };
  }

  /* ---- 13a. UPCOMING BIRTHDAYS (cedo pra não cair em queryUpcoming via "aniversario") ---- */
  if (/(?:proxim[oa]s?\s+aniversario|quando\s+(?:e|sera|vai\s+ser|cai)\s+(?:o\s+)?aniversario|que\s+dia\s+(?:e|cai|eh)\s+(?:o\s+)?aniversario|aniversari[oa]s?\s+(?:proxim|deste\s+mes|esse\s+mes|do\s+\w+|da\s+\w+)|qual\s+(?:o\s+)?aniversario|faz\s+anos|^aniversario\s+d[oa]\s+\w+)/.test(n)
      && !/redig|escrev|texto\s+(?:pra|para)|mensagem|parabens/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "customBirthday",
      params: { childName: child?.name || "" },
      confidence: 0.85,
    };
  }

  /* ---- 7. HEALTH SUMMARY (antes de upcoming pra "próxima vacina" não cair em agenda) ---- */
  if (/(?:saude|alerg|medicament|remedio[s]?\b|vacina|esta\s+tomando|toma\s+remedio)/.test(n)
      && !/marc[ao]r|registr|cri[ae]r|paguei/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    if (child) {
      return {
        action: "queryHealth",
        params: { child_name: child.name },
        confidence: 0.85,
      };
    }
  }

  /* ---- 4. UPCOMING / AGENDA ---- */
  if (/(?:proxim[oa]s?|que\s+tem|agenda|compromisso|evento|festa|aniversari|reuniao)/.test(n)
      && !/criar?|nov[oa]|marc[ao]r/.test(n)) {
    const period = parsePeriod(expanded);
    let days = 30;
    if (period) {
      const ms = new Date(period.endISO).getTime() - new Date(period.startISO).getTime();
      days = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
    } else if (/semana/.test(n)) {
      days = 7;
    } else if (/hoje|amanha|dia/.test(n)) {
      days = 2;
    }
    return {
      action: "queryUpcoming",
      params: { days: String(Math.min(days, 60)) },
      confidence: 0.8,
    };
  }

  /* ---- 5. EXPENSES SUMMARY ---- */
  if (/(?:quanto\s+(?:gast|paguei|deve|sai)|total\s+(?:de\s+)?gast|despesa|gasto[s]?\b|paguei|gastos\s+com)/.test(n)
      && !/registr|cri[ae]r|nov[oa]/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    const period = parsePeriod(expanded);
    let periodKey = "month";
    if (period?.kind === "week") periodKey = "week";
    else if (period?.kind === "year") periodKey = "year";
    return {
      action: "queryExpenses",
      params: {
        period: periodKey,
        child_name: child?.name || "",
      },
      confidence: 0.85,
    };
  }

  /* ---- 6. BALANCE / SALDO ---- */
  if (/(?:meu\s+saldo|saldo|estamos?\s+quites|quite|quanto\s+(?:eu\s+)?devo|devo\s+algo|quanto\s+me\s+devem|reembolso)/.test(n)) {
    return { action: "queryBalance", params: {}, confidence: 0.9 };
  }

  /* ---- 8. CHILDREN INFO ---- */
  if (/(?:informac|infos?\b|quantos\s+anos|qual\s+a?\s+idade|escola|colegio|aniversario|data\s+de\s+nasc|nascimento)/.test(n)
      && /(?:dos?\s+filh|das?\s+criancas?|do\s+\w+|da\s+\w+|meu\s+filh|minha\s+filh)/.test(n)
      && !/endereco|onde\s+(?:busco|pego|deixo)|telefone|numero|contato|whatsapp/.test(n)) {
    return { action: "queryChildren", params: {}, confidence: 0.8 };
  }

  /* ---- 9. CHILD STATUS (doente?) ---- */
  if (/(?:esta\s+doente|ta\s+doente|esta\s+bem|como\s+(?:esta|ta)\s+(?:o|a))/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "queryStatus",
      params: { child_name: child?.name || "" },
      confidence: 0.8,
    };
  }

  /* ---- 10. PENDING APPROVALS ---- */
  if (/(?:aprovac|pendent|aprov[ao]r|trocas?\s+pendent|tem\s+(?:algo|coisa)\s+(?:pra|para)|tenho\s+(?:algo|coisa)\s+(?:pra|para))/.test(n)) {
    return { action: "queryPending", params: {}, confidence: 0.9 };
  }

  /* ---- 11. CHILD HISTORY ---- */
  if (/(?:historico|o\s+que\s+aconteceu|ultim[oa]s?\s+event|timeline|que\s+rolou)/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    if (child) {
      const period = parsePeriod(expanded);
      let days = 30;
      if (period?.kind === "week") days = 7;
      if (period?.kind === "year") days = 180;
      return {
        action: "queryHistory",
        params: { child_name: child.name, days: String(days) },
        confidence: 0.8,
      };
    }
  }

  /* ---- 12. FAMILY SUMMARY (síntese cross-domain) ---- */
  if (/(?:resumo|resume|sintese|panorama|geral)\s+(?:da\s+|do\s+)?(?:familia|casa|mes|semana|tudo)/.test(n)
      || /(?:o\s+que\s+(?:mais\s+)?aconteceu|como\s+foi)\s+(?:a|o|essa|nessa|na|esse|nesse|no)/.test(n)) {
    const period = parsePeriod(expanded);
    const child = resolveChild(expanded, ctx.children);
    if (child) {
      return {
        action: "customChildSummary",
        params: {
          childName: child.name,
          periodStart: period?.startISO || "",
          periodEnd: period?.endISO || "",
          periodLabel: period?.label || "esse mês",
        },
        confidence: 0.8,
      };
    }
    return {
      action: "customFamilySummary",
      params: {
        periodStart: period?.startISO || "",
        periodEnd: period?.endISO || "",
        periodLabel: period?.label || "esse mês",
      },
      confidence: 0.8,
    };
  }

  /* ---- 13b. WEEKEND PLAN (o que vamos fazer no fim de semana) ---- */
  if (/(?:o\s+que\s+(?:vamos|tem|temos|tenho)\s+(?:.{0,15})?(?:no|pro?|para\s+o|nesse|esse)\s+(?:fim\s+de\s+semana|finde|fds)|planos?\s+(?:do|pro|de|pra)\s+(?:fim\s+de\s+semana|finde|fds)|(?:fim\s+de\s+semana|finde|fds)\s+tem|programa(?:cao)?\s+(?:do|pro|de)\s+(?:fim\s+de\s+semana|finde|fds))/.test(n)) {
    return { action: "customWeekendPlan", params: {}, confidence: 0.85 };
  }

  /* ---- 13c. EXPENSE COMPARISON (gastei mais que o mês passado?) ---- */
  if (/(?:gast(?:ei|amos|o)|despesa[s]?)\s+.{0,30}(?:mais\s+que|menos\s+que|comparad|em\s+rela|do\s+que)/.test(n)
      || /(?:esse\s+mes|este\s+mes)\s+.{0,20}(?:foi\s+(?:mais|menos|maior|menor)|comparad)/.test(n)) {
    return { action: "customExpenseComparison", params: {}, confidence: 0.85 };
  }

  /* ---- 13d. WHO PAID WHAT (quem pagou o que) ---- */
  if (/(?:quem\s+pagou|quem\s+(?:gastou|pagou)\s+(?:mais|tanto)|breakdown|por\s+pessoa|por\s+pagador|cada\s+um)/.test(n)
      && /(?:gast|despesa|paguei)/.test(n)) {
    const period = parsePeriod(expanded);
    let periodKey = "month";
    if (period?.kind === "week") periodKey = "week";
    else if (period?.kind === "year") periodKey = "year";
    return {
      action: "queryExpenses",
      params: { period: periodKey, child_name: "" },
      confidence: 0.8,
    };
  }

  /* ---- 13e. STATUS SAÚDE SIMPLES ("tá com tosse?", "ainda doente?") ---- */
  if (/(?:esta|ta|continua|ainda|melhorou|piorou)\s+(?:com\s+)?(?:tosse|febre|gripe|resfri|dor|enjoo|diarreia|vomit|alerg|melhor|pior|doente|bem)/.test(n)
      || /\bmelhorou\??\s*$/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "queryStatus",
      params: { child_name: child?.name || "" },
      confidence: 0.85,
    };
  }

  /* ---- 13i. DOCUMENTOS ---- */
  if (/\b(?:documento[s]?|certidao|\brg\b|\bcpf\b|passaporte|carteira\s+(?:de\s+identidade|de\s+motorista))\b/.test(n)
      && !/criar?|nov[oa]|registr|paguei|gast|emergenc/.test(n)) {
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "customDocuments",
      params: { childName: child?.name || "" },
      confidence: 0.75,
    };
  }

  /* ---- 13k. QUEM DEVE A QUEM ---- */
  if (/(?:quanto\s+(?:eu\s+)?devo\s+(?:para|pro|a)|quanto\s+(?:o|a|do|da)?\s*\w+\s+(?:me\s+)?deve|quanto\s+(?:me\s+)?devem)/.test(n)) {
    return { action: "queryBalance", params: {}, confidence: 0.85 };
  }

  /* ---- 13l. DIA COMEMORATIVO (Mães, Pais, Crianças, Avós) ---- */
  if (/(?:dia\s+(?:das\s+|dos\s+)?(?:m[ãa]es?|pais|crian[cç]as?|av[oó][s]?))|quando\s+(?:e|sera|cai)\s+(?:o\s+)?dia\s+d/.test(n)) {
    return { action: "customCommemorativeDate", params: { rawText: text }, confidence: 0.85 };
  }

  /* ---- 13. DRAFT MESSAGE ---- */
  if (/(?:redig|escrev[ae]r?\s+(?:uma\s+)?mensagem|mensagem\s+pra|mandar?\s+mensagem|preciso\s+falar|como\s+(?:eu\s+)?(?:falo|digo)|texto\s+pra)/.test(n)) {
    const target = resolveMember(expanded, ctx.members, ctx.currentUserId);
    const child = resolveChild(expanded, ctx.children);
    return {
      action: "customDraftMessage",
      params: {
        rawText: text,
        targetName: target?.name.split(" ")[0] || resolveGrandparentLabel(expanded, ctx.members) || "",
        childName: child?.name.split(" ")[0] || "",
      },
      confidence: 0.75,
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Session state — memória conversacional curta (TTL 30min)            */
/* ------------------------------------------------------------------ */

const SESSION_TTL_MS = 30 * 60 * 1000;

export interface SessionState {
  lastIntent: string | null;
  lastParams: Record<string, string> | null;
  lastChildId: string | null;
  lastPeriodStart: string | null;
  lastPeriodEnd: string | null;
}

export async function loadSessionState(
  ctx: ToolContext,
): Promise<SessionState | null> {
  const { data } = await ctx.supabase
    .from("assistant_session_state")
    .select("last_intent, last_params, last_child_id, last_period_start, last_period_end, updated_at")
    .eq("user_id", ctx.userId)
    .eq("group_id", ctx.groupId)
    .maybeSingle();

  if (!data) return null;
  const age = Date.now() - new Date(data.updated_at as string).getTime();
  if (age > SESSION_TTL_MS) return null;

  return {
    lastIntent: data.last_intent as string | null,
    lastParams: data.last_params as Record<string, string> | null,
    lastChildId: data.last_child_id as string | null,
    lastPeriodStart: data.last_period_start as string | null,
    lastPeriodEnd: data.last_period_end as string | null,
  };
}

export async function saveSessionState(
  ctx: ToolContext,
  intent: { action: string; params: Record<string, string> },
): Promise<void> {
  const childId = (() => {
    const cn = intent.params.childName || intent.params.child_name;
    if (!cn) return null;
    return ctx.children.find((c) => c.name === cn || resolveChild(cn, ctx.children)?.id === c.id)?.id || null;
  })();

  await ctx.supabase
    .from("assistant_session_state")
    .upsert({
      user_id: ctx.userId,
      group_id: ctx.groupId,
      last_intent: intent.action,
      last_params: intent.params as unknown as object,
      last_child_id: childId,
      last_period_start: intent.params.periodStart || null,
      last_period_end: intent.params.periodEnd || null,
      updated_at: new Date().toISOString(),
    });
}

/**
 * Detecta follow-up: mensagem curta que reusa intent anterior alterando só
 * o período. Ex: "e em julho?", "e na semana passada?", "e agora?".
 */
export function isFollowUp(text: string): boolean {
  const n = norm(text).trim();
  if (n.length > 40) return false;
  return /^(?:e|tambem|tb|agora)\s+(?:em|na|no|nessa|nesse|do|da)\s+/.test(n)
    || /^e\s+\w+\s*\??$/.test(n);
}

/**
 * Aplica session state pra resolver follow-ups e pronomes.
 * Retorna intent ajustado se conseguiu, senão null.
 */
export function applyFollowUp(
  text: string,
  state: SessionState | null,
  ctx: QueryParseContext,
): QueryIntent | null {
  if (!state || !state.lastIntent) return null;
  if (!isFollowUp(text) && !hasPronoun(text)) return null;

  // Tentamos parsear a frase nova com o periodo aplicado
  const period = parsePeriod(text);
  const params = { ...(state.lastParams || {}) } as Record<string, string>;
  if (period) {
    params.periodStart = period.startISO;
    params.periodEnd = period.endISO;
    params.periodLabel = period.label;
    if (state.lastIntent === "queryExpenses") {
      if (period.kind === "week") params.period = "week";
      else if (period.kind === "year") params.period = "year";
      else params.period = "month";
    }
    if (state.lastIntent === "queryUpcoming") {
      const ms = new Date(period.endISO).getTime() - new Date(period.startISO).getTime();
      params.days = String(Math.max(1, Math.ceil(ms / 86400000) + 1));
    }
  }

  // Pronome → resolve pra last_child
  if (hasPronoun(text) && state.lastChildId) {
    const child = ctx.children.find((c) => c.id === state.lastChildId);
    if (child) {
      params.childName = child.name;
      params.child_name = child.name;
    }
  }

  return {
    action: state.lastIntent,
    params,
    confidence: 0.75,
  };
}

/* ------------------------------------------------------------------ */
/* parseMultiIntent — divide a mensagem e processa múltiplas intents   */
/* ------------------------------------------------------------------ */

export function parseMultiIntent(
  text: string,
  ctx: QueryParseContext,
): QueryIntent[] {
  const parts = splitMultiIntent(text);
  if (parts.length <= 1) {
    const single = parseQueryIntent(text, ctx);
    return single ? [single] : [];
  }

  const intents: QueryIntent[] = [];
  for (const part of parts) {
    const intent = parseQueryIntent(part, ctx);
    if (intent && intent.confidence >= 0.7) intents.push(intent);
  }
  return intents;
}

/* ------------------------------------------------------------------ */
/* parseWithClarification — detecta ambiguidade de filho               */
/* ------------------------------------------------------------------ */

/**
 * Quando o texto sugere que o usuário se refere a um filho mas o nome
 * é ambíguo (ex: "Bê" entre Bernardo e Beatriz), retorna intent de
 * clarificação em vez de cair pro LLM.
 */
export function detectChildAmbiguity(
  text: string,
  children: ToolContext["children"],
): { ambiguous: boolean; candidates: ToolContext["children"] } {
  const n = norm(text);
  const tokens = n.split(/\s+/).filter((t) => t.length >= 2 && t.length <= 4);
  const matches = new Map<string, ToolContext["children"][number]>();
  for (const tok of tokens) {
    const cands = children.filter((c) =>
      norm(c.name.split(" ")[0]).startsWith(tok),
    );
    if (cands.length >= 2) {
      for (const c of cands) matches.set(c.id, c);
    }
  }
  const arr = Array.from(matches.values());
  return { ambiguous: arr.length >= 2, candidates: arr };
}

/* ------------------------------------------------------------------ */
/* fuzzyMatchIntent — Nível 2: BM25-light (sem ML)                     */
/* ------------------------------------------------------------------ */

interface FuzzyEntry {
  action: string;
  keywords: string[]; // já normalizados
  weight: number;     // raridade inversa (palavras genéricas pesam menos)
}

const FUZZY_TABLE: FuzzyEntry[] = [
  { action: "queryCustody",    keywords: ["guarda", "vez", "pega", "leva", "fica", "tutela", "domingo", "sabado", "fds", "finde", "comigo", "pernoit"], weight: 1.5 },
  { action: "queryUpcoming",   keywords: ["agenda", "compromisso", "evento", "festa", "proximo", "marcad", "rolando", "agendad", "programa", "role"], weight: 1.0 },
  { action: "queryExpenses",   keywords: ["gasto", "despesa", "paguei", "total", "custo", "gastei", "rombo", "fundo", "sai", "saiu", "torrei", "trampo", "grana", "pila", "conto"], weight: 1.5 },
  { action: "queryBalance",    keywords: ["saldo", "devo", "deve", "quites", "reembolso", "racha", "rachar", "fecha", "fechar", "deveu", "passa"], weight: 1.8 },
  { action: "queryHealth",     keywords: ["saude", "alergia", "remedio", "vacina", "medico", "pediatra", "doenca", "consulta", "remedinho", "vasina", "vacin", "vasin", "remed"], weight: 1.5 },
  { action: "queryChildren",   keywords: ["filhos", "criancas", "idade", "escola", "anos", "aniversario", "netos", "guri", "guria", "moleque", "molecada", "pivete"], weight: 1.2 },
  { action: "queryStatus",     keywords: ["doente", "bem", "estado", "passando", "como", "ta", "netinho", "netinha", "filhote", "molequinho", "molequinha", "tristezinha", "chorou"], weight: 1.5 },
  { action: "queryPending",    keywords: ["aprovacao", "pendente", "troca", "swap", "aprovar", "esperando"], weight: 1.8 },
  { action: "queryHistory",    keywords: ["historico", "ultimo", "rolou", "aconteceu", "timeline", "ultimos", "passad"], weight: 1.5 },
];

/**
 * Stopwords pt-BR — palavras de função sem carga de intenção. Filtradas
 * ANTES do matching pra evitar falso-positivo via prefixo: "com" casava
 * "comigo" (keyword de queryCustody) e qualquer frase com "com" disparava
 * consulta de guarda (bug: "Fono é com o Moacyr na rua X" → "Nenhum
 * registro de guarda encontrado"). Idem "pro"→"programa"/"proximo",
 * "esta"→"estado". Nenhuma destas é keyword do FUZZY_TABLE, então remover
 * é seguro; abreviações reais (fds, sab, vez) NÃO são stopwords.
 */
const FUZZY_STOPWORDS = new Set([
  "com", "para", "pra", "pro", "pelo", "pela", "por", "sem", "ate",
  "que", "uma", "uns", "umas", "dos", "das", "nos", "nas", "aos",
  "ele", "ela", "eles", "elas", "isso", "este", "esta", "esse", "essa",
  "isto", "aqui", "ali", "meu", "minha", "seu", "sua", "dele", "dela",
]);

export function fuzzyMatchIntent(
  text: string,
  ctx: QueryParseContext,
): QueryIntent | null {
  const n = norm(text);
  const tokens = new Set(
    n.split(/\s+/).filter((t) => t.length >= 3 && !FUZZY_STOPWORDS.has(t)),
  );
  if (tokens.size === 0) return null;

  // Stemmed tokens — cobre "gastando"/"gastei"/"gasto" via "gast"
  const stemmedTokens = new Set(Array.from(tokens).map((t) => stemPT(t)));

  let bestAction = "";
  let bestScore = 0;

  for (const entry of FUZZY_TABLE) {
    let score = 0;
    for (const kw of entry.keywords) {
      const kwStem = stemPT(kw);
      let matched = false;
      // Camada 1: substring/prefix match (rápido)
      for (const tok of tokens) {
        if (tok === kw || tok.startsWith(kw) || kw.startsWith(tok)) {
          score += entry.weight;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      // Camada 2: stem match
      for (const stem of stemmedTokens) {
        if (stem === kwStem || stem.startsWith(kwStem) || kwStem.startsWith(stem)) {
          score += entry.weight * 0.85;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      // Camada 3: Levenshtein (typos) — só pra tokens com 4+ chars
      for (const tok of tokens) {
        if (tok.length < 4 || kw.length < 4) continue;
        const dist = levenshtein(tok, kw);
        const maxLen = Math.max(tok.length, kw.length);
        // tolera até 1 edit pra 4-6 chars, 2 edits pra 7+ chars
        const limit = maxLen >= 7 ? 2 : 1;
        if (dist > 0 && dist <= limit) {
          score += entry.weight * (1 - dist / maxLen);
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestAction = entry.action;
    }
  }

  // Threshold: precisa pelo menos uma keyword forte (>= 1.5) ou duas fracas
  if (bestScore < 1.3) return null;

  // Reaproveita parsers de detalhes
  const child = resolveChild(text, ctx.children);
  const period = parsePeriod(text);

  switch (bestAction) {
    case "queryCustody":
      return { action: "queryCustody", params: { date: parseRelativeDate(text) || todayISO() }, confidence: 0.65 };
    case "queryUpcoming":
      return { action: "queryUpcoming", params: { days: period?.kind === "week" ? "7" : "30" }, confidence: 0.6 };
    case "queryExpenses": {
      let pk = "month";
      if (period?.kind === "week") pk = "week";
      if (period?.kind === "year") pk = "year";
      return { action: "queryExpenses", params: { period: pk, child_name: child?.name || "" }, confidence: 0.65 };
    }
    case "queryBalance":
      return { action: "queryBalance", params: {}, confidence: 0.7 };
    case "queryHealth":
      if (!child) return null;
      return { action: "queryHealth", params: { child_name: child.name }, confidence: 0.6 };
    case "queryChildren":
      return { action: "queryChildren", params: {}, confidence: 0.6 };
    case "queryStatus":
      return { action: "queryStatus", params: { child_name: child?.name || "" }, confidence: 0.6 };
    case "queryPending":
      return { action: "queryPending", params: {}, confidence: 0.7 };
    case "queryHistory":
      if (!child) return null;
      return { action: "queryHistory", params: { child_name: child.name, days: "30" }, confidence: 0.6 };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Handlers customizados — síntese, contagem e drafts                  */
/* ------------------------------------------------------------------ */

/**
 * "Quantos dias eu tenho a guarda do Bê em junho?"
 * Conta dias de custody_events do range onde responsible_user_id = targetUserId.
 */
export async function runCustodyCount(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const targetUserId = params.targetUserId || ctx.userId;
  const start = params.periodStart;
  const end = params.periodEnd;
  const label = params.periodLabel || "esse mês";
  const granularity = params.granularity || "day";
  const childName = params.childName;

  if (!start || !end) {
    return { success: false, message: "Não entendi o período. Tenta 'em junho' ou 'esse mês'." };
  }

  let query = ctx.supabase
    .from("custody_events")
    .select("child_id, responsible_user_id, start_date, end_date")
    .eq("group_id", ctx.groupId)
    .lte("start_date", end)
    .gte("end_date", start);

  if (childName) {
    const child = resolveChild(childName, ctx.children);
    if (child) query = query.eq("child_id", child.id);
  }

  const { data, error } = await query;
  if (error) return { success: false, message: `Erro: ${error.message}` };
  if (!data || data.length === 0) {
    return { success: true, message: `Nenhum registro de guarda em ${label}.` };
  }

  // Conta dias únicos do range que pertencem ao targetUserId
  const startD = new Date(start);
  const endD = new Date(end);
  const dayOwner = new Map<string, string>(); // ISO → user_id
  for (const ev of data) {
    const evStart = new Date(ev.start_date as string);
    const evEnd = new Date(ev.end_date as string);
    const from = evStart > startD ? evStart : startD;
    const to = evEnd < endD ? evEnd : endD;
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const iso = isoOf(d);
      // Se múltiplos eventos no mesmo dia, prevalece o último (não ideal, mas raro)
      dayOwner.set(iso, ev.responsible_user_id as string);
    }
  }

  const allDays = Array.from(dayOwner.entries());
  const myDays = allDays.filter(([, uid]) => uid === targetUserId);
  const totalDays = allDays.length;
  const myCount = myDays.length;

  if (granularity === "weekend") {
    const myWeekends = myDays.filter(([iso]) => {
      const dow = new Date(iso).getDay();
      return dow === 0 || dow === 6;
    });
    const totalWeekends = allDays.filter(([iso]) => {
      const dow = new Date(iso).getDay();
      return dow === 0 || dow === 6;
    }).length;
    const targetLabel = params.targetName || "você";
    return {
      success: true,
      message: `Em ${label}, ${targetLabel === "você" ? "você fica" : `${targetLabel} fica`} com ${myWeekends.length} de ${totalWeekends} dias de fim de semana${childName ? ` do ${resolveChild(childName, ctx.children)?.name.split(" ")[0] || childName}` : ""}.`,
      data: { count: myWeekends.length, total: totalWeekends },
    };
  }

  const targetLabel = params.targetName || "você";
  const childLabel = childName
    ? ` do ${resolveChild(childName, ctx.children)?.name.split(" ")[0] || childName}`
    : "";
  const verb = targetLabel === "você" ? "Você tem" : `${targetLabel} tem`;
  return {
    success: true,
    message: `Em ${label}, ${verb} a guarda${childLabel} em **${myCount} de ${totalDays} dias** registrados.`,
    data: { count: myCount, total: totalDays },
  };
}

/**
 * "Quando vou pegar o Bê?" — primeiro dia futuro com responsible_user = me.
 */
export async function runNextCustody(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const today = todayISO();
  const future = new Date(); future.setDate(future.getDate() + 60);
  const futureISO = isoOf(future);

  let query = ctx.supabase
    .from("custody_events")
    .select("child_id, responsible_user_id, start_date, end_date")
    .eq("group_id", ctx.groupId)
    .eq("responsible_user_id", ctx.userId)
    .gte("end_date", today)
    .lte("start_date", futureISO)
    .order("start_date");

  if (params.childName) {
    const child = resolveChild(params.childName, ctx.children);
    if (child) query = query.eq("child_id", child.id);
  }

  const { data } = await query.limit(1);
  if (!data || data.length === 0) {
    return { success: true, message: "Não achei próximos dias de guarda registrados nos próximos 60 dias." };
  }

  const ev = data[0];
  const start = ev.start_date as string;
  const isToday = start <= today;
  const child = ctx.children.find((c) => c.id === ev.child_id);
  const childLabel = child ? ` com ${child.name.split(" ")[0]}` : "";

  if (isToday) {
    return {
      success: true,
      message: `Você está com a guarda${childLabel} agora, até ${fmtBR(ev.end_date as string)}.`,
    };
  }

  return {
    success: true,
    message: `Próxima janela${childLabel}: ${fmtBR(start)} até ${fmtBR(ev.end_date as string)}.`,
  };
}

/**
 * "Resumo da família esse mês" — agrega 5 queries em paralelo, monta markdown.
 */
export async function runFamilySummary(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const now = new Date();
  const start = params.periodStart || isoOf(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = params.periodEnd || isoOf(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const label = params.periodLabel || "esse mês";

  const [expRes, eventsRes, apptsRes, custRes, statusRes] = await Promise.all([
    ctx.supabase
      .from("expenses")
      .select("amount, category")
      .eq("group_id", ctx.groupId)
      .gte("expense_date", start)
      .lte("expense_date", end),
    ctx.supabase
      .from("events")
      .select("title, event_date")
      .eq("group_id", ctx.groupId)
      .gte("event_date", start)
      .lte("event_date", end)
      .order("event_date")
      .limit(10),
    ctx.supabase
      .from("medical_appointments")
      .select("title, appointment_date, child_id")
      .eq("group_id", ctx.groupId)
      .gte("appointment_date", `${start}T00:00:00`)
      .lte("appointment_date", `${end}T23:59:59`)
      .order("appointment_date")
      .limit(10),
    ctx.supabase
      .from("custody_events")
      .select("responsible_user_id, start_date, end_date")
      .eq("group_id", ctx.groupId)
      .lte("start_date", end)
      .gte("end_date", start),
    ctx.supabase
      .from("child_current_status")
      .select("full_name, is_sick, active_illness_titles")
      .eq("group_id", ctx.groupId),
  ]);

  const lines: string[] = [`📋 **Resumo da família — ${label}**\n`];

  // Despesas
  const expData = expRes.data || [];
  if (expData.length > 0) {
    const total = expData.reduce((s, e) => s + Number(e.amount), 0);
    lines.push(`💸 **Despesas**: ${fmtBRL(total)} em ${expData.length} lançamentos.`);
  } else {
    lines.push("💸 **Despesas**: nada registrado no período.");
  }

  // Custódia
  const custData = custRes.data || [];
  if (custData.length > 0) {
    const dayCount = new Map<string, number>();
    const startD = new Date(start);
    const endD = new Date(end);
    for (const ev of custData) {
      const evStart = new Date(ev.start_date as string);
      const evEnd = new Date(ev.end_date as string);
      const from = evStart > startD ? evStart : startD;
      const to = evEnd < endD ? evEnd : endD;
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const uid = ev.responsible_user_id as string;
        dayCount.set(uid, (dayCount.get(uid) || 0) + 1);
      }
    }
    const myDays = dayCount.get(ctx.userId) || 0;
    const total = Array.from(dayCount.values()).reduce((a, b) => a + b, 0);
    lines.push(`👨‍👩‍👧 **Guarda**: você ficou ${myDays} de ${total} dias.`);
  }

  // Eventos + consultas
  const events = eventsRes.data || [];
  const appts = apptsRes.data || [];
  if (events.length + appts.length > 0) {
    lines.push(`\n📅 **Compromissos** (${events.length + appts.length}):`);
    for (const e of events.slice(0, 5)) {
      lines.push(`• ${fmtBR(e.event_date as string)} — ${e.title}`);
    }
    for (const a of appts.slice(0, 5)) {
      const dt = new Date(a.appointment_date as string);
      const child = ctx.children.find((c) => c.id === a.child_id);
      lines.push(`• ${fmtBR(isoOf(dt))} — 🏥 ${a.title}${child ? ` (${child.name.split(" ")[0]})` : ""}`);
    }
  }

  // Status saúde
  const status = statusRes.data || [];
  const sickKids = status.filter((s) => s.is_sick);
  if (sickKids.length > 0) {
    const names = sickKids.map((s) => String(s.full_name || "").split(" ")[0]).join(", ");
    lines.push(`\n🤒 **Saúde**: ${names} com episódio ativo.`);
  } else if (status.length > 0) {
    lines.push(`\n✅ **Saúde**: todas as crianças bem.`);
  }

  return { success: true, message: lines.join("\n") };
}

/**
 * "Como foi a semana do Bê?" — síntese específica de uma criança.
 */
export async function runChildSummary(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const child = resolveChild(params.childName, ctx.children);
  if (!child) return { success: false, message: "Não achei essa criança." };

  const start = params.periodStart || isoOf(new Date(Date.now() - 7 * 86400000));
  const end = params.periodEnd || todayISO();
  const label = params.periodLabel || "essa semana";

  const [appts, illness, events, expenses] = await Promise.all([
    ctx.supabase
      .from("medical_appointments")
      .select("title, appointment_date")
      .eq("child_id", child.id)
      .gte("appointment_date", `${start}T00:00:00`)
      .lte("appointment_date", `${end}T23:59:59`)
      .order("appointment_date"),
    ctx.supabase
      .from("illness_episodes")
      .select("title, start_date, status")
      .eq("child_id", child.id)
      .gte("start_date", start)
      .lte("start_date", end),
    ctx.supabase
      .from("events")
      .select("title, event_date")
      .eq("group_id", ctx.groupId)
      .eq("child_id", child.id)
      .gte("event_date", start)
      .lte("event_date", end),
    ctx.supabase
      .from("expenses")
      .select("amount, description")
      .eq("group_id", ctx.groupId)
      .eq("child_id", child.id)
      .gte("expense_date", start)
      .lte("expense_date", end),
  ]);

  const first = child.name.split(" ")[0];
  const lines: string[] = [`👶 **${first} — ${label}**\n`];

  const apptData = appts.data || [];
  if (apptData.length > 0) {
    lines.push(`🏥 ${apptData.length} consulta(s):`);
    apptData.slice(0, 5).forEach((a) => lines.push(`• ${fmtBR(isoOf(new Date(a.appointment_date as string)))} — ${a.title}`));
  }

  const ill = illness.data || [];
  if (ill.length > 0) {
    lines.push(`🤒 ${ill.length} episódio(s) de saúde: ${ill.map((i) => i.title).join(", ")}`);
  }

  const evs = events.data || [];
  if (evs.length > 0) {
    lines.push(`📅 ${evs.length} evento(s):`);
    evs.slice(0, 5).forEach((e) => lines.push(`• ${fmtBR(e.event_date as string)} — ${e.title}`));
  }

  const exps = expenses.data || [];
  if (exps.length > 0) {
    const total = exps.reduce((s, e) => s + Number(e.amount), 0);
    lines.push(`💸 ${exps.length} despesa(s) — total ${fmtBRL(total)}`);
  }

  if (lines.length === 1) {
    lines.push("Nada registrado no período.");
  }

  return { success: true, message: lines.join("\n") };
}

/* ------------------------------------------------------------------ */
/* Draft message — templates determinísticos                           */
/* ------------------------------------------------------------------ */

interface DraftTemplate {
  match: RegExp;
  build: (slots: { target: string; child: string; raw: string }) => string;
}

const DRAFT_TEMPLATES: DraftTemplate[] = [
  // Viagem com filho
  {
    match: /viaj(?:ar|em)\s+com|levar\s+(?:o\s+)?\w+\s+(?:em\s+)?viagem|autorizac\s+de\s+viagem/,
    build: ({ target, child, raw }) => {
      const dates = (raw.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s+de\s+\w+)/g) || []).slice(0, 2);
      const d1 = dates[0] || "[início]";
      const d2 = dates[1] || "[volta]";
      return `Oi${target ? ` ${target}` : ""}, vou viajar com${child ? ` o ${child}` : " a criança"} entre **${d1}** e **${d2}**. Pode confirmar e me mandar a autorização assinada?`;
    },
  },
  // Autorização (geral)
  {
    match: /autorizac|autorizar|assinatura|preciso\s+de\s+(?:uma\s+)?(?:assinatura|autorizac)/,
    build: ({ target, child }) =>
      `Oi${target ? ` ${target}` : ""}, preciso de uma autorização sua${child ? ` pro ${child}` : ""}. Posso te mandar o documento ou prefere assinar pelo Kindar?`,
  },
  // Emergência
  {
    match: /emergencia|urgente|hospital|pronto\s+socorro|acidente|caiu|machucou|febrao|febre\s+alta/,
    build: ({ target, child }) =>
      `${target ? `${target}, ` : ""}**preciso te avisar agora**: estou com${child ? ` o ${child}` : " a criança"} em uma situação que precisa de você. Me liga quando puder?`,
  },
  // Parabéns / conquista / boa nova
  {
    match: /parabens|conquist|aprov(?:ou|ado)|primeir[oa]\s+(?:vez|passo)|aniversari/,
    build: ({ target, child }) =>
      `Oi${target ? ` ${target}` : ""}, ótima notícia${child ? ` do ${child}` : ""} 🎉 — queria dividir com você. Quando puder, te conto.`,
  },
  // Atraso
  {
    match: /atras|chegar?\s+tarde|vou\s+demorar/,
    build: ({ target, child, raw }) => {
      const minMatch = raw.match(/(\d+)\s*min/);
      const min = minMatch ? minMatch[1] : "alguns";
      return `Oi${target ? ` ${target}` : ""}, vou atrasar uns **${min} minutos** pra trocar${child ? ` o ${child}` : ""}. Te aviso quando estiver chegando.`;
    },
  },
  // Troca de dia
  {
    match: /troc(?:ar?|a)\s+(?:o\s+)?(?:dia|guarda)|troca\s+de\s+dia|posso\s+trocar/,
    build: ({ target, raw }) => {
      const dates = (raw.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s+de\s+\w+)/g) || []).slice(0, 2);
      const d1 = dates[0] || "[data]";
      const d2 = dates[1] || "[outra data]";
      return `Oi${target ? ` ${target}` : ""}, posso trocar **${d1}** por **${d2}**? Se não der, me fala outra data que funcione.`;
    },
  },
  // Despesa nova
  {
    match: /despesa|gast(?:ei|o)|paguei|registrei.*r\$/,
    build: ({ target }) =>
      `Oi${target ? ` ${target}` : ""}, registrei uma despesa nova no Kindar. Pode dar uma olhada e validar quando puder?`,
  },
  // Consulta agendada
  {
    match: /consult|pediatr|dentist|medic[ao]\b|exame/,
    build: ({ target, child }) =>
      `Oi${target ? ` ${target}` : ""}, marquei uma consulta${child ? ` do ${child}` : ""}. Detalhes no Kindar — confirma se funciona pra você?`,
  },
  // Material escolar
  {
    match: /escola|colegio|material|uniforme|mochila|livro|reuniao\s+de\s+pais/,
    build: ({ target, child }) =>
      `Oi${target ? ` ${target}` : ""}, ${child ? `o ${child} ` : "o pequeno "}precisa de algo da escola. Você consegue providenciar ou prefere que eu cuide?`,
  },
  // Comportamento / situação
  {
    match: /comportamento|hoje\s+(?:o|a)|estou\s+preocupad|ach[oei]\s+que/,
    build: ({ target, child }) =>
      `Oi${target ? ` ${target}` : ""}, queria te contar uma coisa sobre${child ? ` o ${child}` : " as crianças"}. Quando você puder, a gente conversa.`,
  },
];

export function buildDraftMessage(params: Record<string, string>): string {
  const raw = (params.rawText || "").toLowerCase();
  const target = params.targetName || "";
  const child = params.childName || "";

  for (const tpl of DRAFT_TEMPLATES) {
    if (tpl.match.test(norm(raw))) {
      const msg = tpl.build({ target, child, raw });
      return `📝 Sugestão de mensagem${target ? ` para ${target}` : ""}:\n\n"${msg}"\n\n_Você pode ajustar antes de enviar._`;
    }
  }

  // Fallback genérico
  const generic = `Oi${target ? ` ${target}` : ""}, queria conversar sobre algo importante${child ? ` que envolve o ${child}` : ""}. Quando você puder, me responde por aqui?`;
  return `📝 Sugestão de mensagem${target ? ` para ${target}` : ""}:\n\n"${generic}"\n\n_Você pode ajustar antes de enviar._`;
}

/* ------------------------------------------------------------------ */
/* i18n — strings dos handlers em 5 idiomas                            */
/* ------------------------------------------------------------------ */

type Locale = "pt" | "en" | "es" | "fr" | "de";

function pickLocale(raw?: string): Locale {
  if (!raw) return "pt";
  const l = raw.toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  if (l.startsWith("fr")) return "fr";
  if (l.startsWith("de")) return "de";
  return "pt";
}

interface Strings {
  help: (kid: string) => string;
  greeting: {
    morning: string;
    afternoon: string;
    evening: string;
    night: string;
    body: (kid: string, hasKids: boolean) => string;
  };
  thanks: string[];
  birthdayToday: (name: string, age: number) => string;
  birthdayTomorrow: (name: string, age: number, date: string) => string;
  birthdayUpcoming: (name: string, date: string, days: number, age: number) => string;
  noBirthdays: string;
  weekendTitle: (label: string, from: string, to: string) => string;
  weekendDayWith: (day: string, date: string, who: string) => string;
  weekendCommitments: (n: number) => string;
  weekendFree: string;
  comparisonTitle: string;
  comparisonRow: (label: string, value: string, count: number) => string;
  comparisonMore: string;
  comparisonLess: string;
  comparisonEqual: string;
  notesTitle: (n: number) => string;
  noNotes: string;
  decisionsTitle: (n: number) => string;
  decisionsHint: string;
  noDecisions: string;
  agreementsTitle: (n: number) => string;
  noAgreements: string;
  schoolNoChildren: string;
  schoolNoData: string;
  todayNothing: string;
  todayPast: (n: number) => string;
  todayNext: string;
  todayThen: string;
}

const STRINGS: Record<Locale, Strings> = {
  pt: {
    help: (kid) => `🤖 **Kindar AI — o que dá pra perguntar**

📅 **Guarda e calendário**
• "Quem tá com o ${kid} hoje?"
• "Quantos dias eu tenho a guarda em junho?"
• "Quando vou pegar o ${kid}?"
• "O que tem essa semana?"

💸 **Despesas**
• "Quanto gastei esse mês?"
• "Qual meu saldo?"
• "Gastos com escola"

❤️ **Saúde**
• "Como tá a saúde do ${kid}?"
• "Próxima vacina?"

📋 **Síntese**
• "Resumo da família esse mês"
• "Como foi a semana do ${kid}?"

✏️ **Criação** (peço confirmação antes)
• "Paguei 50 reais de farmácia"
• "Marcar pediatra dia 15 às 14h"
• "Anotar que o ${kid} dormiu mal"

📝 **Comunicação**
• "Como falar com a mãe que vou atrasar?"
• "Mensagem pra trocar dia 15 por 20"

Pode usar gírias e abreviações — eu entendo.`,
    greeting: {
      morning: "Bom dia",
      afternoon: "Boa tarde",
      evening: "Boa noite",
      night: "Boa madrugada",
      body: (kid, hasKids) =>
        `Posso ajudar com guarda, despesas, agenda, saúde${hasKids ? ` e tudo do ${kid}` : ""}. Manda "ajuda" pra ver os comandos, ou pergunte direto — tipo:\n\n• "Quem tá com a guarda hoje?"\n• "Quanto gastei esse mês?"\n• "Resumo da família"`,
    },
    thanks: [
      "Por nada! 😊 Qualquer coisa, é só chamar.",
      "Tamo junto! 💪 Manda quando precisar.",
      "Disponha! Se precisar de algo, é só pedir.",
      "✨ Sempre que precisar.",
    ],
    birthdayToday: (n, a) => `🎂 **${n}** faz ${a} anos HOJE!`,
    birthdayTomorrow: (n, a, d) => `🎂 **${n}** faz ${a} anos amanhã (${d})`,
    birthdayUpcoming: (n, d, days, a) => `🎂 ${n}: ${d} (${days} dias) — ${a} anos`,
    noBirthdays: "Nenhuma data de nascimento cadastrada.",
    weekendTitle: (l, f, t) => `📅 **${l.toUpperCase()}** (${f} a ${t})\n`,
    weekendDayWith: (day, d, who) => `👨‍👩‍👧 **${day} (${d})**: com ${who}`,
    weekendCommitments: (n) => `\n📋 **Compromissos** (${n}):`,
    weekendFree: `\n✨ Nenhum compromisso marcado — fim de semana livre.`,
    comparisonTitle: `💸 **Comparação de despesas**`,
    comparisonRow: (label, val, count) => `${label}: ${val} (${count} lançamentos)`,
    comparisonMore: "📈 mais",
    comparisonLess: "📉 menos",
    comparisonEqual: "➖ igual",
    notesTitle: (n) => `📝 **Suas últimas ${n} notas:**`,
    noNotes: "Você não tem notas registradas.",
    decisionsTitle: (n) => `🗳️ **${n} decisão(ões) em votação:**`,
    decisionsHint: "Vote pelo app pra resolver.",
    noDecisions: "Nenhuma decisão em aberto. ✨",
    agreementsTitle: (n) => `📋 **${n} acordo(s):**`,
    noAgreements: "Nenhum acordo registrado ainda.",
    schoolNoChildren: "Nenhuma criança cadastrada.",
    schoolNoData: "Nenhuma informação escolar cadastrada.",
    todayNothing: "✨ Nada na agenda pra hoje.",
    todayPast: (n) => `Tudo de hoje já passou (${n} item(ns)). Amanhã tem coisa nova.`,
    todayNext: "⏭️ **Agora a próxima:**",
    todayThen: "Depois:",
  },
  en: {
    help: (kid) => `🤖 **Kindar AI — what you can ask**

📅 **Custody & calendar**
• "Who's with ${kid} today?"
• "How many days do I have custody in June?"
• "When do I pick up ${kid}?"
• "What's on this week?"

💸 **Expenses**
• "How much did I spend this month?"
• "What's my balance?"
• "School expenses"

❤️ **Health**
• "How's ${kid}'s health?"
• "Next vaccine?"

📋 **Summary**
• "Family summary this month"
• "How was ${kid}'s week?"

✏️ **Create** (I'll ask first)
• "Paid R$50 at the pharmacy"
• "Schedule pediatrician on the 15th at 2pm"
• "Note that ${kid} slept poorly"

📝 **Messaging**
• "How do I tell mom I'll be late?"
• "Message to swap day 15 for 20"

Casual language works fine.`,
    greeting: {
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening",
      night: "Good night",
      body: (kid, hasKids) =>
        `I can help with custody, expenses, calendar, health${hasKids ? ` and everything about ${kid}` : ""}. Send "help" to see commands or just ask — like:\n\n• "Who has custody today?"\n• "How much did I spend this month?"\n• "Family summary"`,
    },
    thanks: [
      "You're welcome! 😊 Anytime.",
      "Here whenever you need. 💪",
      "No problem! Just ask.",
      "✨ Always at your service.",
    ],
    birthdayToday: (n, a) => `🎂 **${n}** turns ${a} TODAY!`,
    birthdayTomorrow: (n, a, d) => `🎂 **${n}** turns ${a} tomorrow (${d})`,
    birthdayUpcoming: (n, d, days, a) => `🎂 ${n}: ${d} (${days} days) — turns ${a}`,
    noBirthdays: "No birthdates on record.",
    weekendTitle: (l, f, t) => `📅 **${l.toUpperCase()}** (${f} to ${t})\n`,
    weekendDayWith: (day, d, who) => `👨‍👩‍👧 **${day} (${d})**: with ${who}`,
    weekendCommitments: (n) => `\n📋 **Plans** (${n}):`,
    weekendFree: `\n✨ Nothing scheduled — free weekend.`,
    comparisonTitle: `💸 **Expense comparison**`,
    comparisonRow: (label, val, count) => `${label}: ${val} (${count} entries)`,
    comparisonMore: "📈 more",
    comparisonLess: "📉 less",
    comparisonEqual: "➖ same",
    notesTitle: (n) => `📝 **Your last ${n} notes:**`,
    noNotes: "You have no notes.",
    decisionsTitle: (n) => `🗳️ **${n} open decision(s):**`,
    decisionsHint: "Vote in the app to resolve.",
    noDecisions: "No open decisions. ✨",
    agreementsTitle: (n) => `📋 **${n} agreement(s):**`,
    noAgreements: "No agreements yet.",
    schoolNoChildren: "No children registered.",
    schoolNoData: "No school info registered.",
    todayNothing: "✨ Nothing on the agenda today.",
    todayPast: (n) => `Today's items are all done (${n}). Tomorrow brings new things.`,
    todayNext: "⏭️ **Up next:**",
    todayThen: "Then:",
  },
  es: {
    help: (kid) => `🤖 **Kindar AI — qué puedes preguntar**

📅 **Custodia y calendario**
• "¿Quién está con ${kid} hoy?"
• "¿Cuántos días tengo la custodia en junio?"
• "¿Cuándo recojo a ${kid}?"
• "¿Qué hay esta semana?"

💸 **Gastos**
• "¿Cuánto gasté este mes?"
• "¿Cuál es mi saldo?"
• "Gastos del colegio"

❤️ **Salud**
• "¿Cómo está la salud de ${kid}?"
• "¿Próxima vacuna?"

📋 **Resumen**
• "Resumen de la familia este mes"
• "¿Cómo fue la semana de ${kid}?"

✏️ **Crear** (pregunto antes)
• "Pagué 50 reales en la farmacia"
• "Agendar pediatra el día 15 a las 14h"
• "Anotar que ${kid} durmió mal"

📝 **Mensajes**
• "¿Cómo le digo a mamá que llegaré tarde?"
• "Mensaje para cambiar día 15 por 20"`,
    greeting: {
      morning: "Buenos días",
      afternoon: "Buenas tardes",
      evening: "Buenas noches",
      night: "Buenas noches",
      body: (kid, hasKids) =>
        `Puedo ayudar con custodia, gastos, agenda, salud${hasKids ? ` y todo de ${kid}` : ""}. Manda "ayuda" para ver los comandos.`,
    },
    thanks: [
      "¡De nada! 😊 Cuando quieras.",
      "¡Estamos juntos! 💪",
      "Disponible siempre.",
      "✨ Siempre que necesites.",
    ],
    birthdayToday: (n, a) => `🎂 **${n}** cumple ${a} HOY!`,
    birthdayTomorrow: (n, a, d) => `🎂 **${n}** cumple ${a} mañana (${d})`,
    birthdayUpcoming: (n, d, days, a) => `🎂 ${n}: ${d} (${days} días) — ${a} años`,
    noBirthdays: "Sin fechas de nacimiento registradas.",
    weekendTitle: (l, f, t) => `📅 **${l.toUpperCase()}** (${f} a ${t})\n`,
    weekendDayWith: (day, d, who) => `👨‍👩‍👧 **${day} (${d})**: con ${who}`,
    weekendCommitments: (n) => `\n📋 **Planes** (${n}):`,
    weekendFree: `\n✨ Sin compromisos — fin de semana libre.`,
    comparisonTitle: `💸 **Comparación de gastos**`,
    comparisonRow: (label, val, count) => `${label}: ${val} (${count} entradas)`,
    comparisonMore: "📈 más",
    comparisonLess: "📉 menos",
    comparisonEqual: "➖ igual",
    notesTitle: (n) => `📝 **Tus últimas ${n} notas:**`,
    noNotes: "No tienes notas registradas.",
    decisionsTitle: (n) => `🗳️ **${n} decisión(es) abiertas:**`,
    decisionsHint: "Vota en la app para resolver.",
    noDecisions: "Ninguna decisión abierta. ✨",
    agreementsTitle: (n) => `📋 **${n} acuerdo(s):**`,
    noAgreements: "Sin acuerdos registrados.",
    schoolNoChildren: "Ningún niño registrado.",
    schoolNoData: "Sin información escolar.",
    todayNothing: "✨ Nada en la agenda de hoy.",
    todayPast: (n) => `Todo el día de hoy ya pasó (${n}). Mañana habrá novedades.`,
    todayNext: "⏭️ **Lo próximo:**",
    todayThen: "Después:",
  },
  fr: {
    help: (kid) => `🤖 **Kindar AI — questions possibles**

📅 **Garde et calendrier**
• "Qui est avec ${kid} aujourd'hui ?"
• "Combien de jours de garde en juin ?"
• "Quand est-ce que je récupère ${kid} ?"
• "Qu'y a-t-il cette semaine ?"

💸 **Dépenses**
• "Combien j'ai dépensé ce mois ?"
• "Quel est mon solde ?"

❤️ **Santé**
• "Comment va la santé de ${kid} ?"

📋 **Résumé**
• "Résumé familial ce mois"
• "Comment s'est passée la semaine de ${kid} ?"`,
    greeting: {
      morning: "Bonjour",
      afternoon: "Bon après-midi",
      evening: "Bonsoir",
      night: "Bonne nuit",
      body: (kid, hasKids) =>
        `Je peux aider avec garde, dépenses, agenda, santé${hasKids ? ` et tout sur ${kid}` : ""}. Tapez "aide" pour voir les commandes.`,
    },
    thanks: [
      "De rien ! 😊 N'importe quand.",
      "Toujours là. 💪",
      "Pas de problème !",
      "✨ Quand vous voulez.",
    ],
    birthdayToday: (n, a) => `🎂 **${n}** a ${a} ans AUJOURD'HUI !`,
    birthdayTomorrow: (n, a, d) => `🎂 **${n}** a ${a} ans demain (${d})`,
    birthdayUpcoming: (n, d, days, a) => `🎂 ${n} : ${d} (${days} jours) — ${a} ans`,
    noBirthdays: "Aucune date de naissance enregistrée.",
    weekendTitle: (l, f, t) => `📅 **${l.toUpperCase()}** (${f} au ${t})\n`,
    weekendDayWith: (day, d, who) => `👨‍👩‍👧 **${day} (${d})** : avec ${who}`,
    weekendCommitments: (n) => `\n📋 **Engagements** (${n}) :`,
    weekendFree: `\n✨ Rien de prévu — week-end libre.`,
    comparisonTitle: `💸 **Comparaison des dépenses**`,
    comparisonRow: (label, val, count) => `${label} : ${val} (${count} entrées)`,
    comparisonMore: "📈 plus",
    comparisonLess: "📉 moins",
    comparisonEqual: "➖ égal",
    notesTitle: (n) => `📝 **Vos ${n} dernières notes :**`,
    noNotes: "Vous n'avez aucune note.",
    decisionsTitle: (n) => `🗳️ **${n} décision(s) en cours :**`,
    decisionsHint: "Votez dans l'app.",
    noDecisions: "Aucune décision en cours. ✨",
    agreementsTitle: (n) => `📋 **${n} accord(s) :**`,
    noAgreements: "Aucun accord enregistré.",
    schoolNoChildren: "Aucun enfant enregistré.",
    schoolNoData: "Aucune information scolaire.",
    todayNothing: "✨ Rien à l'agenda aujourd'hui.",
    todayPast: (n) => `Toute la journée est passée (${n}). Demain apportera du nouveau.`,
    todayNext: "⏭️ **Maintenant :**",
    todayThen: "Ensuite :",
  },
  de: {
    help: (kid) => `🤖 **Kindar AI — Was du fragen kannst**

📅 **Sorgerecht & Kalender**
• "Wer ist heute bei ${kid}?"
• "Wie viele Tage habe ich Sorgerecht im Juni?"
• "Wann hole ich ${kid} ab?"

💸 **Ausgaben**
• "Wie viel habe ich diesen Monat ausgegeben?"
• "Wie ist mein Saldo?"

❤️ **Gesundheit**
• "Wie geht es ${kid} gesundheitlich?"

📋 **Zusammenfassung**
• "Familienzusammenfassung diesen Monat"`,
    greeting: {
      morning: "Guten Morgen",
      afternoon: "Guten Tag",
      evening: "Guten Abend",
      night: "Gute Nacht",
      body: (kid, hasKids) =>
        `Ich helfe bei Sorgerecht, Ausgaben, Kalender, Gesundheit${hasKids ? ` und allem über ${kid}` : ""}. Tippe "hilfe" für Befehle.`,
    },
    thanks: [
      "Gern geschehen! 😊",
      "Immer hier. 💪",
      "Kein Problem!",
      "✨ Jederzeit.",
    ],
    birthdayToday: (n, a) => `🎂 **${n}** wird HEUTE ${a}!`,
    birthdayTomorrow: (n, a, d) => `🎂 **${n}** wird morgen ${a} (${d})`,
    birthdayUpcoming: (n, d, days, a) => `🎂 ${n}: ${d} (${days} Tage) — ${a} Jahre`,
    noBirthdays: "Keine Geburtsdaten gespeichert.",
    weekendTitle: (l, f, t) => `📅 **${l.toUpperCase()}** (${f} bis ${t})\n`,
    weekendDayWith: (day, d, who) => `👨‍👩‍👧 **${day} (${d})**: bei ${who}`,
    weekendCommitments: (n) => `\n📋 **Termine** (${n}):`,
    weekendFree: `\n✨ Nichts geplant — freies Wochenende.`,
    comparisonTitle: `💸 **Ausgabenvergleich**`,
    comparisonRow: (label, val, count) => `${label}: ${val} (${count} Einträge)`,
    comparisonMore: "📈 mehr",
    comparisonLess: "📉 weniger",
    comparisonEqual: "➖ gleich",
    notesTitle: (n) => `📝 **Deine letzten ${n} Notizen:**`,
    noNotes: "Du hast keine Notizen.",
    decisionsTitle: (n) => `🗳️ **${n} offene Entscheidung(en):**`,
    decisionsHint: "Stimme in der App ab.",
    noDecisions: "Keine offenen Entscheidungen. ✨",
    agreementsTitle: (n) => `📋 **${n} Vereinbarung(en):**`,
    noAgreements: "Keine Vereinbarungen.",
    schoolNoChildren: "Keine Kinder registriert.",
    schoolNoData: "Keine Schulinfo.",
    todayNothing: "✨ Heute nichts geplant.",
    todayPast: (n) => `Alles für heute vorbei (${n}). Morgen ist neuer Tag.`,
    todayNext: "⏭️ **Als nächstes:**",
    todayThen: "Danach:",
  },
};

function s(ctx: ToolContext): Strings {
  return STRINGS[pickLocale(ctx.locale)];
}

/* ------------------------------------------------------------------ */
/* Help / Greeting / Thanks — respostas determinísticas                */
/* ------------------------------------------------------------------ */

export function buildHelpMessage(ctx: ToolContext): string {
  const t = s(ctx);
  const kid = ctx.children[0]?.name?.split(" ")[0] || "criança";
  return t.help(kid);
}

export function buildGreetingMessage(ctx: ToolContext): string {
  const t = s(ctx);
  const hour = new Date().getHours();
  const greet = hour < 5 ? t.greeting.night
    : hour < 12 ? t.greeting.morning
    : hour < 18 ? t.greeting.afternoon
    : t.greeting.evening;
  const kid = ctx.children[0]?.name?.split(" ")[0] || "...";
  return `${greet}! 👋\n\n${t.greeting.body(kid, ctx.children.length > 0)}`;
}

export function buildThanksMessage(ctx?: ToolContext): string {
  const t = ctx ? s(ctx) : STRINGS.pt;
  return t.thanks[Math.floor(Math.random() * t.thanks.length)];
}

/* ------------------------------------------------------------------ */
/* Próximo aniversário                                                  */
/* ------------------------------------------------------------------ */

export async function runUpcomingBirthdays(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const today = new Date();
  const todayMD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const targetChildren = params.childName
    ? ctx.children.filter((c) => {
        const r = resolveChild(params.childName, ctx.children);
        return r?.id === c.id;
      })
    : ctx.children;

  if (targetChildren.length === 0) {
    return { success: true, message: "Não encontrei crianças cadastradas." };
  }

  // Pega birth_dates direto do toolCtx (já vem em ctx.children mas não tem birth_date no shape)
  const ids = targetChildren.map((c) => c.id);
  const { data } = await ctx.supabase
    .from("children")
    .select("id, full_name, birth_date")
    .in("id", ids);

  const upcoming = (data || [])
    .filter((c) => c.birth_date)
    .map((c) => {
      const bd = new Date(c.birth_date as string);
      const age = today.getFullYear() - bd.getFullYear();
      const mm = String(bd.getMonth() + 1).padStart(2, "0");
      const dd = String(bd.getDate()).padStart(2, "0");
      const md = `${mm}-${dd}`;
      let nextYear = today.getFullYear();
      if (md < todayMD) nextYear += 1;
      const nextDate = new Date(nextYear, bd.getMonth(), bd.getDate());
      const daysUntil = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        name: String(c.full_name).split(" ")[0],
        nextDate,
        daysUntil,
        ageNext: age + (md < todayMD ? 1 : 0),
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const t = s(ctx);
  if (upcoming.length === 0) {
    return { success: true, message: t.noBirthdays };
  }

  const lines = upcoming.map((u) => {
    const dateStr = `${String(u.nextDate.getDate()).padStart(2, "0")}/${String(u.nextDate.getMonth() + 1).padStart(2, "0")}`;
    if (u.daysUntil === 0) return t.birthdayToday(u.name, u.ageNext);
    if (u.daysUntil === 1) return t.birthdayTomorrow(u.name, u.ageNext, dateStr);
    return t.birthdayUpcoming(u.name, dateStr, u.daysUntil, u.ageNext);
  });

  return { success: true, message: lines.join("\n") };
}

/* ------------------------------------------------------------------ */
/* Plano de fim de semana — combina custódia + eventos do sábado/domingo */
/* ------------------------------------------------------------------ */

export async function runWeekendPlan(
  _params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const period = parsePeriod("fim de semana");
  if (!period) return { success: false, message: "Não consegui determinar o fim de semana." };
  const { startISO: sat, endISO: sun, label } = period;

  const [eventsRes, apptsRes, occsRes, custRes] = await Promise.all([
    ctx.supabase
      .from("events")
      .select("title, event_date, event_time, location, child_id")
      .eq("group_id", ctx.groupId)
      .eq("status", "active")
      .gte("event_date", sat)
      .lte("event_date", sun)
      .order("event_date"),
    ctx.supabase
      .from("medical_appointments")
      .select("title, appointment_date, child_id, location")
      .eq("group_id", ctx.groupId)
      .eq("status", "scheduled")
      .gte("appointment_date", `${sat}T00:00:00`)
      .lte("appointment_date", `${sun}T23:59:59`)
      .order("appointment_date"),
    ctx.supabase
      .from("calendar_occurrences")
      .select("occurrence_date, child_id, child_activities!inner(name, time_start, location)")
      .eq("group_id", ctx.groupId)
      .gte("occurrence_date", sat)
      .lte("occurrence_date", sun)
      .order("occurrence_date"),
    ctx.supabase
      .from("custody_events")
      .select("child_id, responsible_user_id, start_date, end_date")
      .eq("group_id", ctx.groupId)
      .lte("start_date", sun)
      .gte("end_date", sat),
  ]);

  const t = s(ctx);
  const lines: string[] = [t.weekendTitle(label, fmtBR(sat), fmtBR(sun))];

  // Custódia: quem fica em cada dia
  const custodyByDay: Record<string, string> = {};
  for (const ev of custRes.data || []) {
    const evStart = new Date(ev.start_date as string);
    const evEnd = new Date(ev.end_date as string);
    const startD = new Date(sat);
    const endD = new Date(sun);
    const from = evStart > startD ? evStart : startD;
    const to = evEnd < endD ? evEnd : endD;
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const iso = isoOf(d);
      const member = ctx.members.find((m) => m.id === ev.responsible_user_id);
      const me = ev.responsible_user_id === ctx.userId ? "você" : member?.name.split(" ")[0] || "?";
      custodyByDay[iso] = me;
    }
  }
  for (const day of [sat, sun]) {
    const owner = custodyByDay[day];
    if (owner) {
      const dayName = new Date(day).getDay() === 6 ? "Sábado" : "Domingo";
      lines.push(t.weekendDayWith(dayName, fmtBR(day), owner));
    }
  }

  // Compromissos
  const allItems: string[] = [];
  (eventsRes.data || []).forEach((e) => {
    const t = e.event_time ? ` ${String(e.event_time).slice(0, 5)}` : "";
    allItems.push(`• ${fmtBR(e.event_date as string)}${t} — ${e.title}${e.location ? ` (${e.location})` : ""}`);
  });
  (apptsRes.data || []).forEach((a) => {
    const dt = new Date(a.appointment_date as string);
    const t = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    const child = ctx.children.find((c) => c.id === a.child_id);
    allItems.push(`• ${fmtBR(isoOf(dt))} ${t} — 🏥 ${a.title}${child ? ` (${child.name.split(" ")[0]})` : ""}`);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (occsRes.data || []).forEach((o: any) => {
    const act = Array.isArray(o.child_activities) ? o.child_activities[0] : o.child_activities;
    if (!act) return;
    const t = act.time_start ? ` ${String(act.time_start).slice(0, 5)}` : "";
    const child = ctx.children.find((c) => c.id === o.child_id);
    allItems.push(`• ${fmtBR(o.occurrence_date as string)}${t} — ${act.name}${child ? ` (${child.name.split(" ")[0]})` : ""}`);
  });

  if (allItems.length > 0) {
    lines.push(t.weekendCommitments(allItems.length));
    lines.push(...allItems.slice(0, 10));
  } else {
    lines.push(t.weekendFree);
  }

  return { success: true, message: lines.join("\n") };
}

/* ------------------------------------------------------------------ */
/* Comparação de despesas: esse mês vs mês passado                     */
/* ------------------------------------------------------------------ */

export async function runExpenseComparison(
  _params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const now = new Date();
  const thisStart = isoOf(new Date(now.getFullYear(), now.getMonth(), 1));
  const thisEnd = isoOf(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const prevStart = isoOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevEnd = isoOf(new Date(now.getFullYear(), now.getMonth(), 0));

  const [thisRes, prevRes] = await Promise.all([
    ctx.supabase
      .from("expenses")
      .select("amount, category")
      .eq("group_id", ctx.groupId)
      .gte("expense_date", thisStart)
      .lte("expense_date", thisEnd),
    ctx.supabase
      .from("expenses")
      .select("amount, category")
      .eq("group_id", ctx.groupId)
      .gte("expense_date", prevStart)
      .lte("expense_date", prevEnd),
  ]);

  const sumThis = (thisRes.data || []).reduce((s, e) => s + Number(e.amount), 0);
  const sumPrev = (prevRes.data || []).reduce((s, e) => s + Number(e.amount), 0);
  const diff = sumThis - sumPrev;
  const pct = sumPrev > 0 ? Math.round((diff / sumPrev) * 100) : 0;

  const t = s(ctx);
  const arrow = diff > 0 ? t.comparisonMore : diff < 0 ? t.comparisonLess : t.comparisonEqual;
  const sign = diff > 0 ? "+" : diff < 0 ? "" : "";

  const lines = [
    t.comparisonTitle,
    ``,
    t.comparisonRow("→ atual", fmtBRL(sumThis), (thisRes.data || []).length),
    t.comparisonRow("→ anterior", fmtBRL(sumPrev), (prevRes.data || []).length),
    ``,
    `${arrow}: ${sign}${fmtBRL(Math.abs(diff))}${sumPrev > 0 ? ` (${sign}${pct}%)` : ""}`,
  ];

  return { success: true, message: lines.join("\n") };
}

/* ------------------------------------------------------------------ */
/* Escola, notas, decisões, acordos, próximo item de hoje              */
/* ------------------------------------------------------------------ */

export async function runSchoolInfo(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const childName = params.childName;
  const targetIds = childName
    ? ctx.children.filter((c) => resolveChild(childName, ctx.children)?.id === c.id).map((c) => c.id)
    : ctx.children.map((c) => c.id);

  const t = s(ctx);
  if (targetIds.length === 0) {
    return { success: true, message: t.schoolNoChildren };
  }

  const { data, error } = await ctx.supabase
    .from("child_education")
    .select("child_id, school_name, grade, teacher_name, period")
    .in("child_id", targetIds);

  if (error) return { success: false, message: `Erro: ${error.message}` };
  if (!data || data.length === 0) {
    return { success: true, message: t.schoolNoData };
  }

  const lines = data.map((row) => {
    const child = ctx.children.find((c) => c.id === row.child_id);
    const first = child?.name.split(" ")[0] || "?";
    const parts: string[] = [];
    if (row.school_name) parts.push(`📚 ${row.school_name}`);
    if (row.grade) parts.push(`série ${row.grade}`);
    if (row.period) parts.push(`período ${row.period}`);
    if (row.teacher_name) parts.push(`prof(a). ${row.teacher_name}`);
    return `**${first}**: ${parts.length > 0 ? parts.join(" · ") : "sem dados"}`;
  });

  return { success: true, message: lines.join("\n") };
}

export async function runRecentNotes(
  _params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { data, error } = await ctx.supabase
    .from("private_notes")
    .select("title, content, category, created_at")
    .eq("group_id", ctx.groupId)
    .eq("created_by", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(5);

  const t = s(ctx);
  if (error) return { success: false, message: `Erro: ${error.message}` };
  if (!data || data.length === 0) {
    return { success: true, message: t.noNotes };
  }

  const lines = data.map((n) => {
    const dt = new Date(n.created_at as string);
    const d = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const cat = n.category ? ` [${n.category}]` : "";
    return `• ${d}${cat} — ${n.title}`;
  });

  return { success: true, message: `${t.notesTitle(data.length)}\n${lines.join("\n")}` };
}

export async function runOpenDecisions(
  _params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { data, error } = await ctx.supabase
    .from("decisions")
    .select("title, description, category, deadline, created_at")
    .eq("group_id", ctx.groupId)
    .eq("status", "aberta")
    .order("created_at", { ascending: false })
    .limit(10);

  const t = s(ctx);
  if (error) return { success: false, message: `Erro: ${error.message}` };
  if (!data || data.length === 0) {
    return { success: true, message: t.noDecisions };
  }

  const lines = data.map((d) => {
    const deadline = d.deadline ? ` (${fmtBR(d.deadline as string)})` : "";
    const cat = d.category ? ` [${d.category}]` : "";
    return `• ${d.title}${cat}${deadline}`;
  });

  return {
    success: true,
    message: `${t.decisionsTitle(data.length)}\n${lines.join("\n")}\n\n${t.decisionsHint}`,
  };
}

export async function runActiveAgreements(
  _params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { data, error } = await ctx.supabase
    .from("agreements")
    .select("title, description, is_non_negotiable, category, created_at")
    .eq("group_id", ctx.groupId)
    .order("is_non_negotiable", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(15);

  const t = s(ctx);
  if (error) return { success: false, message: `Erro: ${error.message}` };
  if (!data || data.length === 0) {
    return { success: true, message: t.noAgreements };
  }

  const lines = data.map((a) => {
    const lock = a.is_non_negotiable ? "🔒" : "📌";
    const cat = a.category ? ` [${a.category}]` : "";
    return `${lock} ${a.title}${cat}`;
  });

  return { success: true, message: `${t.agreementsTitle(data.length)}\n${lines.join("\n")}` };
}

export async function runTodayNext(
  _params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const today = todayISO();
  const nowStr = new Date().toTimeString().slice(0, 5);

  const [eventsRes, apptsRes, occsRes] = await Promise.all([
    ctx.supabase
      .from("events")
      .select("title, event_date, event_time, location")
      .eq("group_id", ctx.groupId)
      .eq("status", "active")
      .eq("event_date", today)
      .order("event_time"),
    ctx.supabase
      .from("medical_appointments")
      .select("title, appointment_date, location, child_id")
      .eq("group_id", ctx.groupId)
      .eq("status", "scheduled")
      .gte("appointment_date", `${today}T00:00:00`)
      .lte("appointment_date", `${today}T23:59:59`)
      .order("appointment_date"),
    ctx.supabase
      .from("calendar_occurrences")
      .select("occurrence_date, child_id, child_activities!inner(name, time_start, location)")
      .eq("group_id", ctx.groupId)
      .eq("occurrence_date", today),
  ]);

  type Item = { time: string; line: string };
  const items: Item[] = [];
  for (const e of eventsRes.data || []) {
    const t = (e.event_time as string | null) || "23:59";
    items.push({ time: t.slice(0, 5), line: `${t.slice(0, 5)} — ${e.title}${e.location ? ` (${e.location})` : ""}` });
  }
  for (const a of apptsRes.data || []) {
    const dt = new Date(a.appointment_date as string);
    const t = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    const child = ctx.children.find((c) => c.id === a.child_id);
    items.push({ time: t, line: `${t} — 🏥 ${a.title}${child ? ` (${child.name.split(" ")[0]})` : ""}` });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (occsRes.data || []) as any[]) {
    const act = Array.isArray(o.child_activities) ? o.child_activities[0] : o.child_activities;
    if (!act) continue;
    const t = (act.time_start as string | null)?.slice(0, 5) || "23:59";
    const child = ctx.children.find((c) => c.id === o.child_id);
    items.push({ time: t, line: `${t} — ${act.name}${child ? ` (${child.name.split(" ")[0]})` : ""}` });
  }

  const t = s(ctx);
  if (items.length === 0) {
    return { success: true, message: t.todayNothing };
  }

  items.sort((a, b) => a.time.localeCompare(b.time));
  const upcoming = items.filter((i) => i.time >= nowStr);
  if (upcoming.length === 0) {
    return { success: true, message: t.todayPast(items.length) };
  }

  const next = upcoming[0];
  const rest = upcoming.slice(1, 4);
  const lines = [t.todayNext, next.line];
  if (rest.length > 0) {
    lines.push(``, t.todayThen, ...rest.map((i) => `• ${i.line}`));
  }
  return { success: true, message: lines.join("\n") };
}

/* ------------------------------------------------------------------ */
/* Day overview, contato profissional, vacinação, docs, endereço, datas*/
/* ------------------------------------------------------------------ */

/** "Tudo certo pra hoje?" — overview combinando custódia + agenda + saúde */
export async function runDayOverview(
  _params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const today = todayISO();
  const [custodyRes, eventsRes, apptsRes, statusRes, occsRes] = await Promise.all([
    ctx.supabase
      .from("custody_events")
      .select("child_id, responsible_user_id, custody_type")
      .eq("group_id", ctx.groupId)
      .lte("start_date", today)
      .gte("end_date", today),
    ctx.supabase
      .from("events")
      .select("title, event_time")
      .eq("group_id", ctx.groupId)
      .eq("status", "active")
      .eq("event_date", today)
      .order("event_time")
      .limit(5),
    ctx.supabase
      .from("medical_appointments")
      .select("title, appointment_date, child_id")
      .eq("group_id", ctx.groupId)
      .eq("status", "scheduled")
      .gte("appointment_date", `${today}T00:00:00`)
      .lte("appointment_date", `${today}T23:59:59`),
    ctx.supabase
      .from("child_current_status")
      .select("full_name, is_sick, active_illness_titles, active_medications_count")
      .eq("group_id", ctx.groupId),
    ctx.supabase
      .from("calendar_occurrences")
      .select("child_id, child_activities!inner(name, time_start)")
      .eq("group_id", ctx.groupId)
      .eq("occurrence_date", today),
  ]);

  const lines: string[] = [`📋 **Hoje** (${fmtBR(today)})\n`];

  // Custódia
  const custLines: string[] = [];
  for (const e of custodyRes.data || []) {
    const child = ctx.children.find((c) => c.id === e.child_id);
    const isMe = e.responsible_user_id === ctx.userId;
    const member = ctx.members.find((m) => m.id === e.responsible_user_id);
    const who = isMe ? "você" : (member?.name.split(" ")[0] || "?");
    custLines.push(`${child?.name.split(" ")[0] || "?"} com ${who}`);
  }
  if (custLines.length > 0) lines.push(`👨‍👩‍👧 ${custLines.join(", ")}`);

  // Saúde
  const sick = (statusRes.data || []).filter((s) => s.is_sick);
  if (sick.length > 0) {
    const names = sick.map((s) => String(s.full_name).split(" ")[0]).join(", ");
    lines.push(`🤒 ${names} com episódio ativo`);
  }

  // Itens hoje
  const items: string[] = [];
  for (const e of eventsRes.data || []) {
    const t = e.event_time ? `${String(e.event_time).slice(0, 5)} ` : "";
    items.push(`• ${t}${e.title}`);
  }
  for (const a of apptsRes.data || []) {
    const dt = new Date(a.appointment_date as string);
    const t = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")} `;
    items.push(`• ${t}🏥 ${a.title}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (occsRes.data || []) as any[]) {
    const act = Array.isArray(o.child_activities) ? o.child_activities[0] : o.child_activities;
    if (!act) continue;
    const t = act.time_start ? `${String(act.time_start).slice(0, 5)} ` : "";
    items.push(`• ${t}${act.name}`);
  }

  if (items.length === 0) {
    lines.push(`✨ Sem compromissos hoje.`);
  } else {
    lines.push(``, `📅 **Agenda** (${items.length}):`);
    items.slice(0, 8).forEach((i) => lines.push(i));
  }

  return { success: true, message: lines.join("\n") };
}

/** Telefone/WhatsApp/endereço de um profissional médico cadastrado */
export async function runProfessionalContact(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const raw = (params.rawText || "").toLowerCase();
  const specialtyMap: Record<string, string> = {
    pediatra: "pediatr",
    pediatria: "pediatr",
    dentista: "dent",
    oftalmo: "oftalm",
    dermato: "dermat",
    ortopedista: "ortop",
    fono: "fono",
    psico: "psic",
    psicologo: "psic",
    psiquiatra: "psiq",
    nutricionista: "nutri",
    terapeuta: "terapeu",
  };
  let specialtyFilter = "";
  for (const [key, frag] of Object.entries(specialtyMap)) {
    if (raw.includes(key)) { specialtyFilter = frag; break; }
  }

  let q = ctx.supabase
    .from("medical_professionals")
    .select("name, specialty, phone, whatsapp, address")
    .eq("group_id", ctx.groupId)
    .order("name");
  if (specialtyFilter) q = q.ilike("specialty", `%${specialtyFilter}%`);

  const { data, error } = await q.limit(5);
  if (error) return { success: false, message: `Erro: ${error.message}` };
  if (!data || data.length === 0) {
    return { success: true, message: "Nenhum profissional cadastrado pra essa busca." };
  }

  const lines = data.map((p) => {
    const parts = [`👤 **${p.name}**`];
    if (p.specialty) parts.push(`(${p.specialty})`);
    if (p.phone) parts.push(`📞 ${p.phone}`);
    if (p.whatsapp && p.whatsapp !== p.phone) parts.push(`💬 ${p.whatsapp}`);
    if (p.address) parts.push(`📍 ${p.address}`);
    return parts.join(" · ");
  });

  return { success: true, message: lines.join("\n") };
}

/** Carteira de vacinação — últimas vacinas tomadas */
export async function runVaccinationRecord(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const child = params.childName ? resolveChild(params.childName, ctx.children) : null;
  let q = ctx.supabase
    .from("vaccination_records")
    .select("vaccine_name, dose_label, administered_date, child_id")
    .eq("group_id", ctx.groupId)
    .order("administered_date", { ascending: false })
    .limit(15);
  if (child) q = q.eq("child_id", child.id);

  const { data, error } = await q;
  if (error) return { success: false, message: `Erro: ${error.message}` };
  if (!data || data.length === 0) {
    return { success: true, message: "Nenhuma vacina registrada." };
  }

  const lines = data.map((v) => {
    const c = ctx.children.find((ch) => ch.id === v.child_id);
    const cName = c ? ` (${c.name.split(" ")[0]})` : "";
    const dose = v.dose_label ? ` — ${v.dose_label}` : "";
    return `💉 ${fmtBR(v.administered_date as string)}${cName} — ${v.vaccine_name}${dose}`;
  });

  return { success: true, message: `**Vacinas registradas (últimas ${data.length}):**\n${lines.join("\n")}` };
}

/** Documentos cadastrados */
export async function runDocuments(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const child = params.childName ? resolveChild(params.childName, ctx.children) : null;
  let q = ctx.supabase
    .from("documents")
    .select("name, category, child_id, created_at")
    .eq("group_id", ctx.groupId)
    .order("created_at", { ascending: false })
    .limit(15);
  if (child) q = q.eq("child_id", child.id);

  const { data, error } = await q;
  if (error) return { success: false, message: `Erro: ${error.message}` };
  if (!data || data.length === 0) {
    return { success: true, message: "Nenhum documento cadastrado." };
  }

  const lines = data.map((d) => {
    const c = ctx.children.find((ch) => ch.id === d.child_id);
    const cName = c ? ` (${c.name.split(" ")[0]})` : "";
    const cat = d.category ? `[${d.category}] ` : "";
    return `📄 ${cat}${d.name}${cName}`;
  });

  return { success: true, message: `**${data.length} documento(s):**\n${lines.join("\n")}` };
}

/** Endereço da escola ou de profissional ou de ambos */
export async function runAddress(
  params: Record<string, string>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const child = params.childName ? resolveChild(params.childName, ctx.children) : null;
  const targetIds = child ? [child.id] : ctx.children.map((c) => c.id);

  const [eduRes, profRes] = await Promise.all([
    ctx.supabase
      .from("child_education")
      .select("child_id, school_name, school_address")
      .in("child_id", targetIds),
    ctx.supabase
      .from("medical_professionals")
      .select("name, specialty, address")
      .eq("group_id", ctx.groupId)
      .not("address", "is", null)
      .limit(5),
  ]);

  const lines: string[] = [];
  for (const row of eduRes.data || []) {
    const c = ctx.children.find((ch) => ch.id === row.child_id);
    const first = c?.name.split(" ")[0] || "?";
    if (row.school_name && row.school_address) {
      lines.push(`📚 **${first}** — ${row.school_name}: ${row.school_address}`);
    } else if (row.school_name) {
      lines.push(`📚 **${first}** — ${row.school_name} (endereço não cadastrado)`);
    }
  }

  if (lines.length === 0) {
    // Fallback: lista profissionais com endereço
    if (profRes.data && profRes.data.length > 0) {
      lines.push(`Sem endereço de escola registrado. Profissionais com endereço:`);
      for (const p of profRes.data) {
        lines.push(`• ${p.name}${p.specialty ? ` (${p.specialty})` : ""}: ${p.address}`);
      }
    } else {
      return { success: true, message: "Nenhum endereço cadastrado (escola ou profissional)." };
    }
  }

  return { success: true, message: lines.join("\n") };
}

/** Datas comemorativas: Dia das Mães, Dia dos Pais, Dia das Crianças, Dia dos Avós */
export async function runCommemorativeDate(
  params: Record<string, string>,
  _ctx: ToolContext,
): Promise<ToolResult> {
  void _ctx;
  const raw = (params.rawText || "").toLowerCase();
  const today = new Date();
  const year = today.getFullYear();

  // Calcula segundo domingo de um mês específico
  const secondSunday = (y: number, monthIdx: number): Date => {
    const d = new Date(y, monthIdx, 1);
    const firstSunday = (7 - d.getDay()) % 7;
    return new Date(y, monthIdx, 1 + firstSunday + 7);
  };

  const occasions: Array<{ name: string; date: Date }> = [];
  if (/m[ãa]e/.test(raw)) {
    occasions.push({ name: "Dia das Mães", date: secondSunday(year, 4) });
    if (secondSunday(year, 4) < today) {
      occasions.push({ name: "Dia das Mães (próximo)", date: secondSunday(year + 1, 4) });
    }
  }
  if (/pai/.test(raw)) {
    occasions.push({ name: "Dia dos Pais", date: secondSunday(year, 7) });
    if (secondSunday(year, 7) < today) {
      occasions.push({ name: "Dia dos Pais (próximo)", date: secondSunday(year + 1, 7) });
    }
  }
  if (/crian[cç]a/.test(raw)) {
    occasions.push({ name: "Dia das Crianças", date: new Date(year, 9, 12) });
  }
  if (/av[oó]/.test(raw)) {
    occasions.push({ name: "Dia dos Avós", date: new Date(year, 6, 26) });
  }

  if (occasions.length === 0) {
    return { success: true, message: "Não consegui identificar a data comemorativa. Tente 'dia das mães' ou 'dia dos pais'." };
  }

  const lines = occasions.map((o) => {
    const days = Math.ceil((o.date.getTime() - today.getTime()) / 86400000);
    if (days === 0) return `🎉 **${o.name}** é HOJE (${fmtBR(isoOf(o.date))})!`;
    if (days < 0) return `📅 ${o.name}: ${fmtBR(isoOf(o.date))} (já passou — vamos ao próximo)`;
    return `📅 **${o.name}**: ${fmtBR(isoOf(o.date))} (${days} dias)`;
  });

  return { success: true, message: lines.join("\n") };
}

/* ------------------------------------------------------------------ */
/* Dispatcher — route.ts chama isso pras actions custom*               */
/* ------------------------------------------------------------------ */

export async function dispatchCustomAction(
  intent: { action: string; params: Record<string, string> },
  ctx: ToolContext,
): Promise<ToolResult | null> {
  switch (intent.action) {
    case "customCustodyCount":
      return await runCustodyCount(intent.params, ctx);
    case "customNextCustody":
      return await runNextCustody(intent.params, ctx);
    case "customFamilySummary":
      return await runFamilySummary(intent.params, ctx);
    case "customChildSummary":
      return await runChildSummary(intent.params, ctx);
    case "customDraftMessage":
      return { success: true, message: buildDraftMessage(intent.params) };
    case "customHelp":
      return { success: true, message: buildHelpMessage(ctx) };
    case "customGreeting":
      return { success: true, message: buildGreetingMessage(ctx) };
    case "customThanks":
      return { success: true, message: buildThanksMessage() };
    case "customBirthday":
      return await runUpcomingBirthdays(intent.params, ctx);
    case "customWeekendPlan":
      return await runWeekendPlan(intent.params, ctx);
    case "customExpenseComparison":
      return await runExpenseComparison(intent.params, ctx);
    case "customSchoolInfo":
      return await runSchoolInfo(intent.params, ctx);
    case "customRecentNotes":
      return await runRecentNotes(intent.params, ctx);
    case "customOpenDecisions":
      return await runOpenDecisions(intent.params, ctx);
    case "customActiveAgreements":
      return await runActiveAgreements(intent.params, ctx);
    case "customTodayNext":
      return await runTodayNext(intent.params, ctx);
    case "customDayOverview":
      return await runDayOverview(intent.params, ctx);
    case "customProfessionalContact":
      return await runProfessionalContact(intent.params, ctx);
    case "customVaccinationRecord":
      return await runVaccinationRecord(intent.params, ctx);
    case "customDocuments":
      return await runDocuments(intent.params, ctx);
    case "customAddress":
      return await runAddress(intent.params, ctx);
    case "customCommemorativeDate":
      return await runCommemorativeDate(intent.params, ctx);
    default:
      return null;
  }
}
