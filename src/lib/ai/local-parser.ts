/* ------------------------------------------------------------------ */
/* ai-local-parser.ts                                                  */
/* Local intent parser — resolves ~80% of commands without Groq API.   */
/* Only falls back to Groq when confidence < 0.7 or no pattern match.  */
/* ------------------------------------------------------------------ */

export interface ParsedIntent {
  action: string;
  params: Record<string, string>;
  confirmation: string;
  confidence: number; // 0-1, only call Groq if < 0.7
}

/* ------------------------------------------------------------------ */
/* Normalisation helper                                                */
/* ------------------------------------------------------------------ */

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ------------------------------------------------------------------ */
/* Informal language pre-processing                                    */
/* ------------------------------------------------------------------ */

function preprocessInformal(text: string): string {
  return text
    .replace(/\bmano,?\s*/gi, "")
    .replace(/\btipo\s+(?:uns?\s+)?/gi, "")
    .replace(/\buns?\s+/gi, "")
    .replace(/\bconto[s]?\b/gi, "reais")
    .replace(/\bpila[s]?\b/gi, "reais")
    .replace(/\bpro\b/gi, "para o")
    .replace(/\bpra\b/gi, "para")
    .replace(/\bfinde\b/gi, "fim de semana")
    .replace(/\btá\b/gi, "esta")
    .replace(/\bta\b/gi, "esta")
    .replace(/\bbota[r]?\b/gi, "marca");
}

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

const PT_MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

const WEEKDAY_MAP: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3,
  quinta: 4, sexta: 5, sabado: 6,
};

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Validate that a day is valid for the given month/year */
function isValidDate(year: number, month: number, day: number): boolean {
  if (day < 1 || day > 31 || month < 0 || month > 11) return false;
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
}

export function parseRelativeDate(text: string): string {
  const n = norm(text);
  const today = new Date();

  // "semana que vem" — next Monday
  if (/semana\s+que\s+vem/.test(n)) {
    const d = new Date(today);
    const currentDay = d.getDay();
    let diff = 1 - currentDay; // Monday = 1
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return formatDate(d);
  }

  // "depois de amanha" must come before "amanha"
  if (n.includes("depois de amanha")) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return formatDate(d);
  }
  if (n.includes("amanha")) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }
  if (n.includes("hoje")) {
    return formatDate(today);
  }

  // "dia 15 de abril de 2026" — with explicit year
  const dayMonthYear = n.match(
    /dia\s+(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})/
  );
  if (dayMonthYear) {
    const day = parseInt(dayMonthYear[1], 10);
    const monthName = dayMonthYear[2];
    const year = parseInt(dayMonthYear[3], 10);
    const monthIdx = PT_MONTHS[monthName];
    if (monthIdx !== undefined && isValidDate(year, monthIdx, day)) {
      return formatDate(new Date(year, monthIdx, day));
    }
  }

  // "dia 5 a 10 de abril" — range: extract the month before matching bare "dia N"
  const dayRangeMonth = n.match(
    /dia\s+(\d{1,2})\s+a\s+\d{1,2}\s+(?:de\s+)?(\w+)/
  );
  if (dayRangeMonth) {
    const day = parseInt(dayRangeMonth[1], 10);
    const monthName = dayRangeMonth[2];
    const monthIdx = PT_MONTHS[monthName];
    if (monthIdx !== undefined) {
      const year =
        monthIdx < today.getMonth() ||
        (monthIdx === today.getMonth() && day < today.getDate())
          ? today.getFullYear() + 1
          : today.getFullYear();
      if (isValidDate(year, monthIdx, day)) {
        return formatDate(new Date(year, monthIdx, day));
      }
    }
  }

  // "dia 15 de marco", "dia 15/04", "dia 15"
  const dayMonthName = n.match(
    /dia\s+(\d{1,2})\s+(?:de\s+)?(\w+)/
  );
  if (dayMonthName) {
    const day = parseInt(dayMonthName[1], 10);
    const monthName = dayMonthName[2];
    const monthIdx = PT_MONTHS[monthName];
    if (monthIdx !== undefined) {
      const year =
        monthIdx < today.getMonth() ||
        (monthIdx === today.getMonth() && day < today.getDate())
          ? today.getFullYear() + 1
          : today.getFullYear();
      if (isValidDate(year, monthIdx, day)) {
        return formatDate(new Date(year, monthIdx, day));
      }
    }
  }

  const daySlash = n.match(/dia\s+(\d{1,2})(?:\s*\/\s*(\d{1,2}))?/);
  if (daySlash) {
    const day = parseInt(daySlash[1], 10);
    if (daySlash[2]) {
      const month = parseInt(daySlash[2], 10) - 1;
      const year =
        month < today.getMonth() ||
        (month === today.getMonth() && day < today.getDate())
          ? today.getFullYear() + 1
          : today.getFullYear();
      if (isValidDate(year, month, day)) {
        return formatDate(new Date(year, month, day));
      }
      return ""; // invalid date like "dia 32"
    }
    // Only day number — assume current or next month
    if (day >= 1 && day <= 31) {
      const candidate = new Date(today.getFullYear(), today.getMonth(), day);
      if (candidate.getDate() !== day) {
        // Day overflowed the month (e.g., day 31 in a 30-day month)
        return "";
      }
      if (candidate < today) {
        candidate.setMonth(candidate.getMonth() + 1);
        if (candidate.getDate() !== day) return ""; // overflow in next month too
      }
      return formatDate(candidate);
    }
    return "";
  }

  // Bare "15 de abril de 2026" without "dia" prefix — with explicit year
  const bareMonthYear = n.match(/(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})/);
  if (bareMonthYear) {
    const day = parseInt(bareMonthYear[1], 10);
    const monthName = bareMonthYear[2];
    const year = parseInt(bareMonthYear[3], 10);
    const monthIdx = PT_MONTHS[monthName];
    if (monthIdx !== undefined && isValidDate(year, monthIdx, day)) {
      return formatDate(new Date(year, monthIdx, day));
    }
  }

  // Bare "15 de marco" without "dia" prefix
  const bareMonthName = n.match(/(\d{1,2})\s+de\s+(\w+)/);
  if (bareMonthName) {
    const day = parseInt(bareMonthName[1], 10);
    const monthName = bareMonthName[2];
    const monthIdx = PT_MONTHS[monthName];
    if (monthIdx !== undefined) {
      const year =
        monthIdx < today.getMonth() ||
        (monthIdx === today.getMonth() && day < today.getDate())
          ? today.getFullYear() + 1
          : today.getFullYear();
      if (isValidDate(year, monthIdx, day)) {
        return formatDate(new Date(year, monthIdx, day));
      }
    }
  }

  // "proxima terca", "na segunda", "na quarta"
  for (const [name, dayNum] of Object.entries(WEEKDAY_MAP)) {
    if (n.includes(name)) {
      const d = new Date(today);
      const currentDay = d.getDay();
      let diff = dayNum - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return formatDate(d);
    }
  }

  // ISO-style date already in text: "2026-03-25"
  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // BR-style date: "25/03/2026" or "25/03"
  const brMatch = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = brMatch[3]
      ? parseInt(brMatch[3], 10)
      : today.getFullYear();
    return formatDate(new Date(year, month, day));
  }

  return "";
}

/* ------------------------------------------------------------------ */
/* Time parsing                                                        */
/* ------------------------------------------------------------------ */

export function parseTime(text: string): string {
  const n = text.toLowerCase();
  // "14h", "14h30", "14:30", "as 14h", "14 horas"
  const match = n.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (match) {
    const h = match[1].padStart(2, "0");
    const m = match[2] || "00";
    return `${h}:${m}`;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Amount parsing                                                      */
/* ------------------------------------------------------------------ */

/** Map of Portuguese number words to their numeric values */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14,
  quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, trezentos: 300,
  quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900,
  mil: 1000,
};

function parseWordNumber(text: string): number {
  const n = norm(text);
  // Try to match word-based amounts: "cem reais", "duzentos reais", "cinquenta e cinco reais"
  const wordAmountMatch = n.match(
    /(?:de\s+)?(\w+(?:\s+e\s+\w+)*)\s*(?:reais|real|conto[s]?|pila[s]?)/
  );
  if (!wordAmountMatch) return 0;

  const words = wordAmountMatch[1].split(/\s+e\s+/);
  let total = 0;
  for (const word of words) {
    const trimmed = word.trim();
    const val = NUMBER_WORDS[trimmed];
    if (val !== undefined) {
      total += val;
    } else {
      return 0; // unknown word, bail out
    }
  }
  return total;
}

export function parseAmount(text: string): number {
  // Brazilian format with thousands separator: "R$ 1.500,00"
  const brFormat = text.match(
    /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{1,2})\s*(?:reais|real)?/i
  );
  if (brFormat) {
    return parseFloat(brFormat[1].replace(/\./g, "").replace(",", "."));
  }

  // "R$ 120,50", "50 reais", "R$35.90", "150"
  const match = text.match(
    /(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)?/i
  );
  if (match) {
    const val = parseFloat(match[1].replace(",", "."));
    if (val > 0) return val;
  }

  // Word-based numbers: "cem reais", "duzentos reais"
  const wordVal = parseWordNumber(text);
  if (wordVal > 0) return wordVal;

  return 0;
}

/* ------------------------------------------------------------------ */
/* Child / member name resolver                                        */
/* ------------------------------------------------------------------ */

function resolveChildName(text: string, children: string[]): string {
  const n = norm(text);
  for (const child of children) {
    const firstName = norm(child.split(" ")[0]);
    if (!firstName) continue;
    // Use word boundary check to avoid "Martinho" matching "Martim"
    const regex = new RegExp(`\\b${firstName}\\b`);
    if (regex.test(n)) return child;
  }
  return "";
}

function resolveMemberName(text: string, members: string[]): string {
  const n = norm(text);
  for (const member of members) {
    const firstName = norm(member.split(" ")[0]);
    if (!firstName) continue;
    const regex = new RegExp(`\\b${firstName}\\b`);
    if (regex.test(n)) return member;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Extract expense description                                         */
/* ------------------------------------------------------------------ */

function extractExpenseDescription(text: string): string {
  return text
    .replace(/(?:registr[ao]|gastei|gasto\s+de|paguei|comprei|despesa\s+de)\s*/i, "")
    .replace(
      /(?:R\$\s*)?\d+(?:[.,]\d{1,2})?\s*(?:reais|real|conto[s]?|pila[s]?|em|de|com)?\s*/i,
      ""
    )
    .replace(/^\s*(?:com|de|em|no|na|do|da)\s+/i, "")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Main parser                                                         */
/* ------------------------------------------------------------------ */

export function parseIntent(
  text: string,
  children: string[],
  members: string[],
  _locale: string // eslint-disable-line @typescript-eslint/no-unused-vars
): ParsedIntent | null {
  if (!text || !text.trim()) return null;

  // Pre-process informal language before anything else
  const processed = preprocessInformal(text);
  const n = norm(processed);

  // ---- PATTERN 1: Expense ----
  // FIX: Added "gasto" (without 'i'), "registra gasto", "custo"
  if (/gast[eo]i|gasto\b|despesa|paguei|comprei|custo[u]?\b/.test(n)) {
    const amount = parseAmount(processed);
    const description = extractExpenseDescription(processed) || "Despesa";
    if (amount > 0) {
      return {
        action: "createExpense",
        params: { amount: String(amount), description },
        confirmation: `Registrar despesa: R$ ${amount.toFixed(2)} - ${description}?`,
        confidence: 0.9,
      };
    }
    // Amount is 0 but the user clearly wants an expense — return with lower confidence
    if (/gast[eo]i|paguei|comprei/.test(n)) {
      const description2 = extractExpenseDescription(processed) || "Despesa";
      return {
        action: "createExpense",
        params: { amount: "0", description: description2 },
        confirmation: `Registrar despesa: ${description2}? (valor nao informado)`,
        confidence: 0.5,
      };
    }
  }

  // ---- PATTERN 2: Appointment ----
  // FIX: "marca" (without 'r') also triggers, plus "bota consulta" after preprocessing
  // Guard: if strong health symptoms are present (febre, vomit, etc.), skip appointment
  // so health pattern can handle it instead
  const hasStrongHealthKeyword = /febre|vomit|diarreia|temperatura|doente/.test(n);
  if (
    !hasStrongHealthKeyword &&
    ((/consult[a]|agendar?|marc[ao]r?/.test(n) &&
      /medic|pediatr|dentist|consult|oftalm|dermat|ortop/.test(n)) ||
    /consult[a]\s/.test(n) ||
    /marc[ao]r?\s+consult/.test(n) ||
    /consult[a]\b/.test(n))
  ) {
    const child = resolveChildName(processed, children);
    const date = parseRelativeDate(processed);
    const time = parseTime(processed);
    const childLabel = child ? child.split(" ")[0] : "";
    return {
      action: "createAppointment",
      params: { childName: child, date, time },
      confirmation: `Marcar consulta${childLabel ? " do " + childLabel : ""}${date ? " dia " + formatDateBR(date) : ""}${time ? " as " + time : ""}?`,
      confidence: child && date ? 0.9 : child || date ? 0.75 : 0.6,
    };
  }

  // ---- PATTERN 3: Health log ----
  // FIX: "alergia" only matches health when accompanied by symptoms context,
  // not when the sentence is about buying/noting allergy meds.
  // Also added "esta mal" / "esta doente" / "passou mal"
  if (
    /febre|temperatura|doente|vomit|diarreia|tosse|gripe|resfri|dor\s+de|mal\s*estar|passou\s+mal|esta\s+mal/.test(n) ||
    (/alergia|alergic/.test(n) && !/comprar|anota|lembr|remedio/.test(n))
  ) {
    const child = resolveChildName(processed, children);
    const tempMatch = processed.match(/(\d{2}[.,]\d)\s*(?:graus|°|celsius)?/);
    const value = tempMatch ? tempMatch[1].replace(",", ".") : "";

    // Detect symptom type more accurately
    let logType = "symptom";
    if (value || /febre|temperatura/.test(n)) logType = "temperature";
    else if (/vomit/.test(n)) logType = "vomiting";
    else if (/diarreia/.test(n)) logType = "diarrhea";
    else if (/tosse/.test(n)) logType = "cough";
    else if (/alergia|alergic/.test(n)) logType = "allergy";

    const childLabel = child ? child.split(" ")[0] : "";
    return {
      action: "createHealthLog",
      params: {
        childName: child,
        logType,
        value: value || n.match(/febre|vomit|diarreia|tosse|gripe|resfri|alergia|doente|mal/)?.[0] || "sintoma",
        notes: text,
      },
      confirmation: `Registrar saude${childLabel ? " - " + childLabel : ""}: ${value ? value + " graus C" : text.slice(0, 50)}?`,
      confidence: child ? 0.85 : 0.5,
    };
  }

  // ---- PATTERN 4: Check-in ----
  // Guard: skip if "acordo"/"regra"/"limite" present (those belong to Agreement)
  if (/dormiu|comeu|almo[cç]|jant|tela|screen|humor/.test(n) && !/acordo|regra\b|limit[ae]/.test(n)) {
    const child = resolveChildName(processed, children);
    let category = "mood";
    if (/dormiu|sono|noite/.test(n)) category = "sleep";
    if (/comeu|almo|jant|cafe/.test(n)) category = "food";
    if (/tela|screen|celular|tablet|tv/.test(n)) category = "screen";
    const childLabel = child ? child.split(" ")[0] : "";
    return {
      action: "createCheckin",
      params: { childName: child, category, text },
      confirmation: `Check-in${childLabel ? " - " + childLabel : ""}: "${text.slice(0, 60)}"?`,
      confidence: 0.85,
    };
  }

  // ---- PATTERN 5: Event / Calendar ----
  if (
    /viagem|evento|festa|aniversario|reuniao|compromisso/.test(n)
  ) {
    const date = parseRelativeDate(processed);
    const time = parseTime(processed);
    const title = processed
      .replace(/(?:cria[r]?|agendar?|marca[r]?)\s*/i, "")
      .trim();
    return {
      action: "createEvent",
      params: { title: title.slice(0, 100), date, time },
      confirmation: `Criar evento: "${title.slice(0, 50)}"${date ? " dia " + formatDateBR(date) : ""}?`,
      confidence: date ? 0.8 : 0.5,
    };
  }

  // ---- PATTERN 6: Decision ----
  if (/decis[aã]o|decidir|votar|precisamos\s+decidir/.test(n)) {
    const title = text
      .replace(/(?:cria[r]?|nova)\s*decis[aã]o\s*/i, "")
      .replace(/(?:sobre|para)\s*/i, "")
      .trim();
    return {
      action: "createDecision",
      params: { title },
      confirmation: `Criar decisao: "${title.slice(0, 60)}"?`,
      confidence: 0.8,
    };
  }

  // ---- PATTERN 7: Note / Reminder ----
  if (
    /anot[ae]|nota\b|lembr[ae]|preciso\s+(?:lembrar|comprar|fazer)|lembrete/.test(
      n
    )
  ) {
    const content = text
      .replace(
        /(?:anota[r]?|cria[r]?\s*nota|lembrete?)\s*(?:que\s*)?/i,
        ""
      )
      .trim();
    return {
      action: "createNote",
      params: { title: content.slice(0, 50), content },
      confirmation: `Criar nota: "${content.slice(0, 60)}"?`,
      confidence: 0.85,
    };
  }

  // ---- PATTERN 8: Agreement ----
  if (/acordo|regra|combin[ae]|limit[ae]/.test(n)) {
    const title = text
      .replace(/(?:cria[r]?|novo)\s*acordo\s*/i, "")
      .trim();
    return {
      action: "createAgreement",
      params: { title, description: text },
      confirmation: `Criar acordo: "${title.slice(0, 60)}"?`,
      confidence: 0.75,
    };
  }

  // ---- PATTERN 9: Medication ----
  if (
    /medicamento|remedio|remedinho|med(?:ica[cç][aã]o)|dar\s+(?:o\s+)?remedio|tomar\s+remedio/.test(
      n
    )
  ) {
    const child = resolveChildName(processed, children);
    const childLabel = child ? child.split(" ")[0] : "";
    const medName = text
      .replace(
        /(?:registrar|novo|dar|tomar)\s*(?:o\s*)?(?:medicamento|remedio|remedinho|medicacao)\s*/i,
        ""
      )
      .trim();
    return {
      action: "createMedication",
      params: { childName: child, name: medName },
      confirmation: `Registrar medicamento${childLabel ? " - " + childLabel : ""}: "${medName.slice(0, 40)}"?`,
      confidence: child ? 0.8 : 0.6,
    };
  }

  // ---- PATTERN 10: Vaccine ----
  if (/vacina/.test(n)) {
    const child = resolveChildName(processed, children);
    const childLabel = child ? child.split(" ")[0] : "";
    const date = parseRelativeDate(processed);
    return {
      action: "createVaccine",
      params: { childName: child, date },
      confirmation: `Registrar vacina${childLabel ? " - " + childLabel : ""}${date ? " dia " + formatDateBR(date) : ""}?`,
      confidence: child ? 0.8 : 0.55,
    };
  }

  // ---- PATTERN 11: Activity ----
  // FIX: Added "futsal", "tenis", "basquete", "ginastica", "danca", "teatro", "piano"
  if (
    /atividade|aula\s+de|natacao|futebol|futsal|ballet|musica|ingles|judo|karate|tenis|basquete|ginastica|danca|teatro|piano/.test(
      n
    )
  ) {
    const child = resolveChildName(processed, children);
    const childLabel = child ? child.split(" ")[0] : "";
    const title = processed
      .replace(/(?:cria[r]?|nova|registrar)\s*(?:atividade)?\s*/i, "")
      .trim();
    return {
      action: "createActivity",
      params: { childName: child, title: title.slice(0, 80) },
      confirmation: `Registrar atividade${childLabel ? " - " + childLabel : ""}: "${title.slice(0, 50)}"?`,
      confidence: child ? 0.8 : 0.6,
    };
  }

  // ---- PATTERN 12: Swap request ----
  // FIX: Handle "trocar o dia", "quero trocar", "trocar dia"
  if (/troc(?:ar?|o)\s+(?:o\s+)?dia|troc(?:ar?|o)\s+(?:o\s+)?fim|swap|troca\s+de\s+(?:dia|guarda)|quero\s+trocar/.test(n)) {
    const member = resolveMemberName(processed, members);
    const date = parseRelativeDate(processed);
    return {
      action: "createSwapRequest",
      params: { targetMember: member, date },
      confirmation: `Solicitar troca de dia${member ? " com " + member.split(" ")[0] : ""}${date ? " dia " + formatDateBR(date) : ""}?`,
      confidence: date ? 0.8 : 0.5,
    };
  }

  // No match
  return null;
}
