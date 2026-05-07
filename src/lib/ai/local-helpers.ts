/* ------------------------------------------------------------------ */
/* local-helpers.ts                                                    */
/* Utilitários determinísticos: distância, negação, stemming, feriados,*/
/* timezone BR. Sem deps externas, sem ML.                             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Levenshtein distance + similarity                                   */
/* ------------------------------------------------------------------ */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const al = a.length;
  const bl = b.length;
  const prev = new Array(bl + 1);
  const curr = new Array(bl + 1);

  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
    }
    for (let j = 0; j <= bl; j++) prev[j] = curr[j];
  }
  return prev[bl];
}

/** Similaridade 0..1 (1 = idêntico). */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/** Match aproximado: tolera até `maxDist` edits, normalizado pelo tamanho da palavra. */
export function fuzzyEq(a: string, b: string, maxDist?: number): boolean {
  const limit = maxDist ?? Math.max(1, Math.floor(Math.min(a.length, b.length) / 4));
  return levenshtein(a, b) <= limit;
}

/* ------------------------------------------------------------------ */
/* Stemming PT-BR (ligeiro, sem dep)                                   */
/* ------------------------------------------------------------------ */

/**
 * Reduz palavra à pseudo-raiz removendo sufixos verbais e nominais comuns.
 * Não é perfeito (não é RSLP), mas casa "gastei"/"gastando"/"gastou" com "gast".
 */
export function stemPT(word: string): string {
  if (word.length <= 3) return word;
  const sufixos = [
    "issemos", "esseis", "essem", "esses", "esse",
    "issemos", "isseis", "issem", "isses", "isse",
    "ariamos", "arieis", "ariam", "arias", "aria",
    "eriamos", "erieis", "eriam", "erias", "eria",
    "iriamos", "irieis", "iriam", "irias", "iria",
    "aremos", "areis", "arao", "ara",
    "eremos", "ereis", "erao", "era",
    "iremos", "ireis", "irao", "ira",
    "amento", "imento", "ucao", "encia", "ancia", "izade", "idade",
    "mente", "ndo", "vel", "oso", "osa", "ica", "ico",
    "ando", "endo", "indo",
    "ados", "idos", "ada", "ido", "ada",
    "ar", "er", "ir",
    "ou", "ei", "iu", "es", "as", "is", "os",
  ];
  for (const s of sufixos) {
    if (word.length > s.length + 2 && word.endsWith(s)) {
      return word.slice(0, -s.length);
    }
  }
  return word;
}

/* ------------------------------------------------------------------ */
/* Abreviações e gírias brasileiras de mensageria                      */
/* ------------------------------------------------------------------ */

/**
 * Expande abreviações típicas que pais/mães/avós usam em texto rápido.
 * "vc tá tendo q?" → "voce esta tendo que?"
 * Aplique ANTES de norm() pra preservar formas conhecidas.
 */
export function expandAbbreviations(text: string): string {
  return text
    .replace(/\bvcs\b/gi, "voces")
    .replace(/\bvc\b/gi, "voce")
    .replace(/\btbm\b/gi, "tambem")
    .replace(/\btb\b/gi, "tambem")
    .replace(/\bobg\b/gi, "obrigado")
    .replace(/\bbrigad([oa])\b/gi, "obrigad$1")
    .replace(/\bvlw\b/gi, "valeu")
    .replace(/\bvalew\b/gi, "valeu")
    .replace(/\bblz\b/gi, "beleza")
    .replace(/\bagt\b/gi, "a gente")
    .replace(/\bmsm\b/gi, "mesmo")
    .replace(/\bpra\b/gi, "para")
    .replace(/\bpro\b/gi, "para o")
    .replace(/\bdnv\b/gi, "de novo")
    .replace(/\bqd\b/gi, "quando")
    .replace(/\bqdo\b/gi, "quando")
    .replace(/\bpq\b/gi, "porque")
    .replace(/\boq\b/gi, "o que")
    .replace(/\bqto\b/gi, "quanto")
    .replace(/\bqts\b/gi, "quantos")
    .replace(/\bq\b/gi, "que")
    .replace(/\beh\b/gi, "e")
    .replace(/\bhj\b/gi, "hoje")
    .replace(/\bamh\b/gi, "amanha")
    .replace(/(?<=^|\s)n(?=\s|$)/gi, "nao")
    .replace(/\bnd\b/gi, "nada")
    .replace(/\btmj\b/gi, "tamo junto")
    .replace(/\baki\b/gi, "aqui")
    .replace(/\baki\b/gi, "aqui")
    .replace(/\bqq\b/gi, "qualquer")
    .replace(/\btd\b/gi, "tudo")
    .replace(/\btds\b/gi, "todos")
    .replace(/\bbb\b/gi, "bebe")
    .replace(/\bdoc\b/gi, "documento")
    .replace(/\bnumzao\b/gi, "numero")
    .replace(/\btel\b/gi, "telefone")
    .replace(/\bpedi\b/gi, "pediatra")
    .replace(/\bdr\b\.?/gi, "doutor")
    .replace(/\bdra\b\.?/gi, "doutora");
}

/* ------------------------------------------------------------------ */
/* Negation detector                                                   */
/* ------------------------------------------------------------------ */

const NEGATION_RE = /\b(?:nao|n[ãa]o|nunca|jamais|nem|sem|nada|nenhum[ao]?)\b/;

/** Detecta negação no texto (já normalizado ou não). */
export function hasNegation(text: string): boolean {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return NEGATION_RE.test(n);
}

/** Retira a partícula de negação pra reusar o resto da frase. */
export function stripNegation(text: string): string {
  return text.replace(/\b(?:não|nao|nunca|jamais|nem|sem)\s+/gi, "").trim();
}

/* ------------------------------------------------------------------ */
/* Timezone BR (America/Sao_Paulo, UTC-3)                              */
/* ------------------------------------------------------------------ */

export const BR_TZ_OFFSET_MS = -3 * 60 * 60 * 1000;

/** Retorna a "hora atual em BR" como Date (epoch deslocado). */
export function nowBR(): Date {
  const now = new Date();
  return new Date(now.getTime() + BR_TZ_OFFSET_MS - now.getTimezoneOffset() * 60 * 1000);
}

/** ISO local no fuso BR (yyyy-mm-dd). */
export function todayISObr(): string {
  const d = nowBR();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Feriados brasileiros                                                */
/* ------------------------------------------------------------------ */

/**
 * Algoritmo de Gauss para Páscoa (válido pra qualquer ano gregoriano).
 * Retorna Date local (sem horário).
 */
export function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

interface Holiday { name: string; date: Date; }

/** Feriados nacionais BR pro ano. */
export function brHolidays(year: number): Holiday[] {
  const easter = easterDate(year);
  const carnaval = new Date(easter); carnaval.setDate(easter.getDate() - 47);
  const sextaSanta = new Date(easter); sextaSanta.setDate(easter.getDate() - 2);
  const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);

  return [
    { name: "Confraternização Universal", date: new Date(year, 0, 1) },
    { name: "Carnaval", date: carnaval },
    { name: "Sexta-feira Santa", date: sextaSanta },
    { name: "Páscoa", date: easter },
    { name: "Tiradentes", date: new Date(year, 3, 21) },
    { name: "Dia do Trabalho", date: new Date(year, 4, 1) },
    { name: "Corpus Christi", date: corpusChristi },
    { name: "Independência", date: new Date(year, 8, 7) },
    { name: "Nossa Senhora Aparecida", date: new Date(year, 9, 12) },
    { name: "Finados", date: new Date(year, 10, 2) },
    { name: "Proclamação da República", date: new Date(year, 10, 15) },
    { name: "Natal", date: new Date(year, 11, 25) },
  ];
}

const HOLIDAY_ALIASES: Record<string, string> = {
  carnaval: "Carnaval",
  pascoa: "Páscoa",
  "sexta santa": "Sexta-feira Santa",
  "sexta-feira santa": "Sexta-feira Santa",
  "corpus christi": "Corpus Christi",
  tiradentes: "Tiradentes",
  finados: "Finados",
  natal: "Natal",
  "ano novo": "Confraternização Universal",
  "reveillon": "Confraternização Universal",
  "dia do trabalho": "Dia do Trabalho",
  independencia: "Independência",
  aparecida: "Nossa Senhora Aparecida",
  republica: "Proclamação da República",
};

/** Acha próximo feriado a partir de hoje cujo nome bate. */
export function findNextHoliday(text: string, fromDate?: Date): Holiday | null {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let canonical: string | null = null;
  for (const [alias, name] of Object.entries(HOLIDAY_ALIASES)) {
    if (t.includes(alias)) { canonical = name; break; }
  }
  if (!canonical) return null;

  const today = fromDate || new Date();
  const thisYear = brHolidays(today.getFullYear());
  const nextYear = brHolidays(today.getFullYear() + 1);
  const all = [...thisYear, ...nextYear];

  return all.find((h) => h.name === canonical && h.date >= today) || null;
}

/* ------------------------------------------------------------------ */
/* "Daqui N dias/semanas/meses" — parser de offsets relativos          */
/* ------------------------------------------------------------------ */

export function parseRelativeOffset(text: string): Date | null {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // "daqui 3 dias", "em 5 dias", "daqui a 2 semanas", "em 1 mes"
  const m = n.match(/(?:daqui(?:\s+a)?|em|dentro\s+de)\s+(\d+)\s+(dia[s]?|semana[s]?|mes(?:es)?|m[eê]s)/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const unit = m[2];
  const d = new Date();
  if (unit.startsWith("dia")) d.setDate(d.getDate() + num);
  else if (unit.startsWith("semana")) d.setDate(d.getDate() + 7 * num);
  else if (unit.startsWith("mes") || unit.startsWith("mês") || unit.startsWith("mes")) d.setMonth(d.getMonth() + num);
  return d;
}

/* ------------------------------------------------------------------ */
/* "Primeiro/último/próximo X de Y"                                    */
/* ------------------------------------------------------------------ */

const ORD: Record<string, number> = {
  primeir: 0, segund: 1, terceir: 2, quart: 3, quint: 4,
  ultim: -1, penultim: -2,
};

const PT_MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

const WEEKDAY: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

/**
 * "primeiro fim de semana de junho" → primeiro sábado de junho do ano atual ou próximo.
 * "último domingo de maio" → último domingo de maio.
 */
export function parseOrdinalDayInMonth(text: string, fromDate?: Date): Date | null {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const today = fromDate || new Date();

  // "primeiro fim de semana de junho"
  const fdsMatch = t.match(/(primeir|segund|terceir|quart|quint|ultim|penultim)[oa]?\s+(?:fim\s+de\s+semana|finde|fds)\s+(?:de|do)\s+(\w+)/);
  if (fdsMatch) {
    const ord = ORD[fdsMatch[1]];
    const monthName = fdsMatch[2];
    const month = PT_MONTHS[monthName];
    if (month === undefined) return null;
    let year = today.getFullYear();
    if (month < today.getMonth()) year++;

    // Primeiro sábado do mês
    const firstDay = new Date(year, month, 1);
    const firstSat = (6 - firstDay.getDay() + 7) % 7;
    const sat = new Date(year, month, 1 + firstSat);
    if (ord >= 0) {
      sat.setDate(sat.getDate() + ord * 7);
    } else {
      // último: começa do fim
      const lastDay = new Date(year, month + 1, 0);
      const offset = (lastDay.getDay() - 6 + 7) % 7;
      sat.setTime(new Date(year, month, lastDay.getDate() - offset).getTime());
      sat.setDate(sat.getDate() + (ord + 1) * 7);
    }
    return sat.getMonth() === month ? sat : null;
  }

  // "primeira/última segunda/sábado de junho"
  const dowMatch = t.match(/(primeir|segund|terceir|quart|quint|ultim|penultim)[oa]?\s+(domingo|segunda|terca|quarta|quinta|sexta|sabado)\s+(?:de|do)\s+(\w+)/);
  if (dowMatch) {
    const ord = ORD[dowMatch[1]];
    const dow = WEEKDAY[dowMatch[2]];
    const month = PT_MONTHS[dowMatch[3]];
    if (dow === undefined || month === undefined) return null;
    let year = today.getFullYear();
    if (month < today.getMonth()) year++;
    if (ord >= 0) {
      const firstDay = new Date(year, month, 1);
      const firstDow = (dow - firstDay.getDay() + 7) % 7;
      const target = new Date(year, month, 1 + firstDow + ord * 7);
      return target.getMonth() === month ? target : null;
    } else {
      const lastDay = new Date(year, month + 1, 0);
      const lastDow = (lastDay.getDay() - dow + 7) % 7;
      const target = new Date(year, month, lastDay.getDate() - lastDow + (ord + 1) * 7);
      return target.getMonth() === month ? target : null;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Multi-intent splitter                                               */
/* ------------------------------------------------------------------ */

/**
 * Divide mensagem em sub-perguntas em "e", "+", ";" — ignora "e" dentro de palavras.
 * "quanto gastei e quem tá com o Bê?" → ["quanto gastei", "quem tá com o Bê?"]
 */
export function splitMultiIntent(text: string): string[] {
  if (!text) return [];
  const parts = text.split(/\s+e\s+|\s*\+\s*|\s*;\s+|\s+e\s+tambem\s+|\s+também\s+/i);
  return parts.map((p) => p.trim()).filter((p) => p.length >= 3);
}

/* ------------------------------------------------------------------ */
/* Off-topic detector — escopo do Kindar é APENAS criança/coparentalidade */
/* ------------------------------------------------------------------ */

export type OffTopicCategory =
  | "weather"
  | "marketplace"
  | "politics"
  | "sports"
  | "medical_advice"
  | "legal_advice"
  | "finance_adult"
  | "fitness_adult"
  | "general_chitchat"
  | null;

interface OffTopicRule {
  category: NonNullable<OffTopicCategory>;
  patterns: RegExp[];
  reply: string;
}

const OFF_TOPIC_RULES: OffTopicRule[] = [
  {
    category: "weather",
    patterns: [
      /\b(?:vai\s+chover|vai\s+fazer\s+(?:sol|frio|calor)|previsao\s+do\s+tempo|temperatura\s+(?:hoje|amanha|ontem)|tempo\s+(?:hoje|amanha)|chuva|chovendo|temporal|nublado|ensolarado|umidade)\b/,
    ],
    reply: "Não acompanho clima — pra previsão use o app de tempo do seu celular. Posso ajudar com agenda, saúde ou guarda dos filhos? 🌤️",
  },
  {
    category: "marketplace",
    patterns: [
      /\b(?:indica[r]?(?:cao)?|recomenda[r]?(?:cao)?|qual\s+(?:o|a)\s+melhor|onde\s+(?:acho|encontro|tem)\s+um[a]?|melhor\s+(?:lugar|loja|restaurante|escola|pediatra)\b)|review\s+de|avaliacao\s+de\b/,
    ],
    reply: "Não faço indicações de serviços ou produtos. Pra escolher pediatra/escola/etc, conversa com pessoas próximas ou usa apps especializados. Posso te ajudar a registrar quando achar. 🤝",
  },
  {
    category: "politics",
    patterns: [
      /\b(?:eleic|presidente|deputado|senador|prefeito|governador|governo|partido|esquerda|direita|votar\s+em|em\s+quem\s+votar|candidato|stf|congresso|impeachment)\b/,
    ],
    reply: "Não converso sobre política. Foco aqui é organizar a vida dos filhos. 🌱",
  },
  {
    category: "sports",
    patterns: [
      /\b(?:jogo\s+do|placar|campeonato|libertadores|mundial|seleção|seleçao|copa\s+do\s+mundo|brasileirao|premiere\s+league|champions|nba|nfl|formula\s*1|f1)\b/,
    ],
    reply: "Esporte não é meu negócio aqui. Pra falar de filhos, sou eu. ⚽",
  },
  {
    category: "medical_advice",
    patterns: [
      /\b(?:posso\s+dar\s+(?:dipirona|paracetamol|ibuprofeno|amoxicilina)|que\s+dose\s+de|qual\s+remedio\s+(?:eu\s+)?(?:posso|devo)|e\s+normal\s+(?:vomitar|chorar\s+tanto)|deveria\s+ir\s+(?:no\s+pronto|ao\s+ps))\b/,
    ],
    reply: "Não dou conselho médico. Isso é com o pediatra — chama ele ou vai ao pronto-socorro se for grave. Posso te ajudar a registrar o sintoma e marcar consulta? 🏥",
  },
  {
    category: "legal_advice",
    patterns: [
      /\b(?:posso\s+processar|vou\s+processar|advogad[oa]|juiz|juiza|liminar|pensao\s+alimenticia|guarda\s+(?:compartilhada\s+e|unilateral|legal\s+)|direito\s+(?:dos\s+)?(?:pais?|maes?|filhos?)|custodia\s+(?:legal|judicial))\b/,
    ],
    reply: "Não dou orientação jurídica. Pra dúvidas legais sobre guarda, pensão ou direitos, fala com um(a) advogado(a) de família. Posso te ajudar a organizar registros que talvez sejam úteis. ⚖️",
  },
  {
    category: "finance_adult",
    patterns: [
      /\b(?:investir|investiment|acoes\s+(?:da|de)|renda\s+fixa|renda\s+variavel|cdb|tesouro\s+direto|crypto|bitcoin|bolsa\s+de\s+valores|trading)\b/,
    ],
    reply: "Finanças pessoais não é meu escopo. Aqui eu cuido só das despesas dos filhos. 💸",
  },
  {
    category: "fitness_adult",
    patterns: [
      /\b(?:minha\s+(?:dieta|academia|treino)|musculacao|emagrecer|perder\s+peso|crossfit|pilates\s+pra\s+mim|nutricao\s+(?:adulta|para\s+mim))\b/,
    ],
    reply: "Sou focado nos filhos, não em rotina de adulto. Pra isso, app de fitness/nutrição. 💪",
  },
  {
    category: "general_chitchat",
    patterns: [
      /\b(?:me\s+conta\s+uma\s+piada|faz\s+um\s+poema|escreve\s+(?:uma\s+)?historia|me\s+diverte|conta\s+algo|que\s+(?:cor|filme|livro|musica)\s+(?:e\s+)?(?:o\s+)?(?:seu|melhor)|qual\s+(?:o\s+)?seu\s+(?:nome|favorito|signo))\b/,
    ],
    reply: "Sou direto: assistente do Kindar pra coparentalidade. Pra papo solto tem outras IAs. 😉",
  },
];

export function detectOffTopic(text: string): { category: OffTopicCategory; reply: string | null } {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const rule of OFF_TOPIC_RULES) {
    for (const re of rule.patterns) {
      if (re.test(n)) return { category: rule.category, reply: rule.reply };
    }
  }
  return { category: null, reply: null };
}

/* ------------------------------------------------------------------ */
/* Pronoun resolution                                                  */
/* ------------------------------------------------------------------ */

const PRONOUN_RE = /\b(ele|ela|dele|dela|deles|delas|seu|sua|seus|suas)\b/;

export function hasPronoun(text: string): boolean {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return PRONOUN_RE.test(n);
}
