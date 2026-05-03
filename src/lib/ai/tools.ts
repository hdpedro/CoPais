/* ------------------------------------------------------------------ */
/* ai-tools.ts                                                         */
/* Groq function-calling tools — actions + queries for Kindar AI       */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  createSwapRequest as createSwapRequestService,
  respondToSwapRequest as respondToSwapRequestService,
  listPendingSwapsForUser,
} from "@/lib/services/swap";
import { createExpense as createExpenseService } from "@/lib/services/expenses";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  groupId: string;
  children: Array<{ id: string; name: string; birth_date?: string | null }>;
  members: Array<{ id: string; name: string }>;
}

export interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function resolveChild(
  name: string,
  children: ToolContext["children"]
): { id: string; name: string } | null {
  if (!name) return null;
  const n = norm(name);
  for (const c of children) {
    const first = norm(c.name.split(" ")[0]);
    if (n.includes(first) || first.includes(n)) return c;
  }
  return null;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function formatBRL(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

/* Parse monetary values from various formats: "R$ 45,00", "45.00", "45", "30 conto" */
function parseAmount(raw: unknown): number {
  const s = String(raw || "0");
  // Remove "R$", spaces, "reais", "conto", "pila"
  const cleaned = s
    .replace(/r\$\s*/gi, "")
    .replace(/\s*(reais|conto|contos|pila|pilas)\s*/gi, "")
    .trim();

  // Both dot AND comma → BR thousands format: "1.500,00" → "1500.00"
  if (cleaned.includes(",") && cleaned.includes(".")) {
    return Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }
  // Only comma → decimal separator: "45,00" → "45.00"
  if (cleaned.includes(",")) {
    return Number(cleaned.replace(",", ".")) || 0;
  }
  // Only dot: check if thousands separator (dot + exactly 3 digits) or decimal
  // "1.500" → thousands (1500), "53.9" / "53.90" → decimal (53.9)
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, "")) || 0;
  }
  // Otherwise dot is decimal: "53.9", "53.90", "120.50"
  return Number(cleaned) || 0;
}

/* Parse date from various formats: "DD/MM/YYYY", "YYYY-MM-DD", "DD-MM-YYYY" */
function parseDate(raw: unknown, fallback?: string): string {
  const s = String(raw || "").trim();
  if (!s) return fallback || todayISO();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY
  const brMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM (assume current year)
  const shortMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (shortMatch) {
    const [, d, m] = shortMatch;
    const y = new Date().getFullYear();
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return fallback || todayISO();
}

/* Parse time from various formats: "14h", "14:00", "14h30", "2pm" */
function parseTime(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;

  // Already HH:MM
  if (/^\d{2}:\d{2}$/.test(s)) return s;

  // "14h" or "14h30"
  const hMatch = s.match(/^(\d{1,2})h(\d{0,2})$/i);
  if (hMatch) {
    const h = hMatch[1].padStart(2, "0");
    const m = (hMatch[2] || "00").padStart(2, "0");
    return `${h}:${m}`;
  }

  // "14:3" → "14:30"
  const partialMatch = s.match(/^(\d{1,2}):(\d{1})$/);
  if (partialMatch) {
    return `${partialMatch[1].padStart(2, "0")}:${partialMatch[2]}0`;
  }

  // Just a number like "14" → "14:00"
  const numMatch = s.match(/^(\d{1,2})$/);
  if (numMatch) {
    return `${numMatch[1].padStart(2, "0")}:00`;
  }

  return s.length >= 5 ? s.slice(0, 5) : null;
}

const CAT_LABELS: Record<string, string> = {
  education: "Educacao", health: "Saude", food: "Alimentacao",
  clothing: "Vestuario", leisure: "Lazer", transport: "Transporte",
  housing: "Moradia", other: "Outros", sport: "Esporte",
  art: "Arte", music: "Musica", therapy: "Terapia",
  school: "Escola", course: "Curso",
};

/* ------------------------------------------------------------------ */
/* Groq Tool Schemas                                                   */
/* ------------------------------------------------------------------ */

export const AI_TOOLS = [
  /* ---------- ACTION TOOLS ---------- */
  {
    type: "function" as const,
    function: {
      name: "create_expense",
      description: "Registrar despesa compartilhada dos filhos. Usar quando o usuario mencionar gasto, compra, pagamento.",
      parameters: {
        type: "object" as const,
        properties: {
          description: { type: "string", description: "Descricao breve da despesa" },
          amount: { type: "string", description: "Valor em reais (BRL). Ex: 150.00" },
          category: {
            type: "string",
            enum: ["education", "health", "food", "clothing", "leisure", "transport", "housing", "other"],
            description: "Categoria da despesa",
          },
          child_name: { type: "string", description: "Nome da crianca (se especifico)" },
        },
        required: ["description", "amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_event",
      description: "Criar evento no calendario. Usar para festas, viagens, reunioes escolares, aniversarios.",
      parameters: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Titulo do evento" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD" },
          time: { type: "string", description: "Horario no formato HH:MM (opcional)" },
          description: { type: "string", description: "Descricao adicional (opcional)" },
          location: { type: "string", description: "Local do evento (opcional)" },
          child_name: { type: "string", description: "Nome da crianca relacionada (opcional)" },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_appointment",
      description: "Agendar consulta medica. Usar para pediatra, dentista, oftalmo, exames.",
      parameters: {
        type: "object" as const,
        properties: {
          child_name: { type: "string", description: "Nome da crianca" },
          specialty: { type: "string", description: "Especialidade (pediatra, dentista, etc)" },
          doctor_name: { type: "string", description: "Nome do medico (opcional)" },
          date: { type: "string", description: "Data YYYY-MM-DD" },
          time: { type: "string", description: "Horario HH:MM (opcional)" },
          appointment_type: {
            type: "string",
            enum: ["routine", "specialist", "emergency", "exam", "vaccine", "dental", "therapy", "other"],
          },
        },
        required: ["child_name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_checkin",
      description: "Registrar check-in diario sobre a crianca (sono, alimentacao, humor, tela).",
      parameters: {
        type: "object" as const,
        properties: {
          child_name: { type: "string", description: "Nome da crianca" },
          category: {
            type: "string",
            enum: ["sleep", "food", "mood", "screen_time", "health", "activity", "school", "other"],
          },
          title: { type: "string", description: "Titulo curto do check-in" },
          notes: { type: "string", description: "Detalhes do check-in" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_note",
      description: "Criar nota ou lembrete privado sobre os filhos ou coparentalidade.",
      parameters: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Titulo da nota" },
          content: { type: "string", description: "Conteudo da nota" },
          category: {
            type: "string",
            enum: ["lembrete", "observacao", "preparacao", "juridico", "outro"],
          },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_activity",
      description: "Registrar atividade recorrente da crianca (natacao, futebol, aula de musica, etc).",
      parameters: {
        type: "object" as const,
        properties: {
          child_name: { type: "string", description: "Nome da crianca" },
          name: { type: "string", description: "Nome da atividade" },
          category: {
            type: "string",
            enum: ["sport", "health", "school", "art", "music", "therapy", "course", "other"],
          },
          days_of_week: {
            type: "string",
            description: "Dias da semana separados por virgula: seg,ter,qua,qui,sex,sab,dom",
          },
          time_start: { type: "string", description: "Horario inicio HH:MM" },
          time_end: { type: "string", description: "Horario fim HH:MM" },
          location: { type: "string", description: "Local da atividade" },
        },
        required: ["name"],
      },
    },
  },

  /* ---------- QUERY TOOLS ---------- */
  {
    type: "function" as const,
    function: {
      name: "get_custody_info",
      description: "Consultar quem esta com a guarda das criancas em determinada data. Usar para 'quem esta com as criancas hoje?', 'de quem e a vez?'.",
      parameters: {
        type: "object" as const,
        properties: {
          date: { type: "string", description: "Data YYYY-MM-DD (default: hoje)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_expenses_summary",
      description: "Resumo de despesas compartilhadas. Usar para 'quanto gastamos?', 'total do mes?'.",
      parameters: {
        type: "object" as const,
        properties: {
          period: { type: "string", enum: ["week", "month", "year"], description: "Periodo (default: month)" },
          child_name: { type: "string", description: "Filtrar por crianca (opcional)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_upcoming_events",
      description: "Proximos eventos, consultas e atividades. Usar para 'o que tem essa semana?', 'proximos compromissos?'.",
      parameters: {
        type: "object" as const,
        properties: {
          days: { type: "string", description: "Quantos dias a frente (default: 7). Envie como string." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_children_info",
      description: "Informacoes das criancas (nomes, idades, escolas). Usar para 'quantos anos tem?', 'informacoes das criancas'.",
      parameters: {
        type: "object" as const,
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_health_summary",
      description: "Resumo de saude de uma crianca (consultas, vacinas, alergias, medicamentos). Usar para 'como esta a saude?', 'proxima vacina?'.",
      parameters: {
        type: "object" as const,
        properties: {
          child_name: { type: "string", description: "Nome da crianca" },
        },
        required: ["child_name"],
      },
    },
  },

  /* ---------- TWO-PARTY ACTION TOOLS (require approval) ---------- */
  {
    type: "function" as const,
    function: {
      name: "create_swap_request",
      description:
        "Solicitar troca de dia (ou pedir um dia em divida) com o coparente. Usar quando o usuario disser 'trocar dia X', 'quero o dia X', 'trocar X por Y'.",
      parameters: {
        type: "object" as const,
        properties: {
          target_member_name: {
            type: "string",
            description: "Nome do coparente que precisa aprovar a troca.",
          },
          original_date: {
            type: "string",
            description: "Data que o usuario quer pegar / trocar (YYYY-MM-DD).",
          },
          proposed_date: {
            type: "string",
            description:
              "Data que o usuario oferece em troca (YYYY-MM-DD). Omita para pedir o dia como divida.",
          },
          reason: {
            type: "string",
            description: "Motivo curto (opcional).",
          },
          type: {
            type: "string",
            enum: ["swap", "visit"],
            description: "swap = troca / divida; visit = visita pontual.",
          },
        },
        required: ["target_member_name", "original_date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "respond_swap_request",
      description:
        "Aprovar ou recusar uma solicitacao de troca pendente direcionada ao usuario.",
      parameters: {
        type: "object" as const,
        properties: {
          swap_id: { type: "string", description: "UUID da swap_request." },
          decision: {
            type: "string",
            enum: ["approved", "rejected"],
            description: "approved aceita; rejected recusa.",
          },
        },
        required: ["swap_id", "decision"],
      },
    },
  },

  /* ---------- INBOX QUERY ---------- */
  {
    type: "function" as const,
    function: {
      name: "get_pending_approvals",
      description:
        "Listar solicitacoes pendentes que aguardam aprovacao do usuario (trocas de dia, etc).",
      parameters: {
        type: "object" as const,
        properties: {},
      },
    },
  },

  /* ---------- COMMUNICATION TOOLS ---------- */
  {
    type: "function" as const,
    function: {
      name: "draft_message",
      description: "Ajudar a redigir mensagem respeitosa para enviar ao coparente sobre tema sensivel.",
      parameters: {
        type: "object" as const,
        properties: {
          topic: { type: "string", description: "Assunto da mensagem" },
          tone: { type: "string", enum: ["neutral", "friendly", "formal"], description: "Tom desejado" },
          key_points: { type: "string", description: "Pontos chave a incluir" },
        },
        required: ["topic"],
      },
    },
  },
];

/* ------------------------------------------------------------------ */
/* Tool Executor Dispatcher                                            */
/* ------------------------------------------------------------------ */

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    switch (name) {
      case "create_expense":       return await execCreateExpense(params, ctx);
      case "create_event":         return await execCreateEvent(params, ctx);
      case "create_appointment":   return await execCreateAppointment(params, ctx);
      case "create_checkin":       return await execCreateCheckin(params, ctx);
      case "create_note":          return await execCreateNote(params, ctx);
      case "create_activity":      return await execCreateActivity(params, ctx);
      case "get_custody_info":     return await execGetCustody(params, ctx);
      case "get_expenses_summary": return await execGetExpenses(params, ctx);
      case "get_upcoming_events":  return await execGetUpcoming(params, ctx);
      case "get_children_info":    return await execGetChildren(ctx);
      case "get_health_summary":   return await execGetHealth(params, ctx);
      case "create_swap_request":  return await execCreateSwapRequest(params, ctx);
      case "respond_swap_request": return await execRespondSwapRequest(params, ctx);
      case "get_pending_approvals":return await execGetPendingApprovals(ctx);
      case "draft_message":        return { success: true, message: "DRAFT_MESSAGE_HANDLED_BY_LLM" };
      default:
        return { success: false, message: `Ferramenta desconhecida: ${name}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error(`Tool ${name} error:`, err);
    return { success: false, message: `Erro ao executar ${name}: ${msg}` };
  }
}

/* ------------------------------------------------------------------ */
/* ACTION EXECUTORS                                                    */
/* ------------------------------------------------------------------ */

async function execCreateExpense(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const amount = parseAmount(p.amount);
  if (amount <= 0) {
    return { success: false, message: "Valor da despesa deve ser maior que zero." };
  }
  const desc = String(p.description || "Despesa");
  const child = resolveChild(String(p.child_name || ""), ctx.children);
  const date = parseDate(p.date, todayISO());

  const result = await createExpenseService(ctx.supabase, {
    groupId: ctx.groupId,
    paidBy: ctx.userId,
    description: desc,
    amount,
    category: String(p.category || "other"),
    expenseDate: date,
    childId: child?.id || null,
    splitRatio: null, // service builds default ratio from group members
    receiptUrl: (p.receipt_url as string) || null,
    origin: "whatsapp",
  });

  if (!result.ok) {
    return { success: false, message: result.error };
  }

  const childLabel = child ? ` (${child.name.split(" ")[0]})` : "";
  return {
    success: true,
    message: `Despesa registrada: ${formatBRL(amount)} — ${desc}${childLabel}`,
    data: { id: result.data.id, amount, description: desc, child: child?.name },
  };
}

async function execCreateEvent(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const title = String(p.title || "");
  const date = parseDate(p.date, todayISO());
  if (!title) return { success: false, message: "Titulo do evento e obrigatorio." };

  const time = parseTime(p.time);
  const insert: Record<string, unknown> = {
    group_id: ctx.groupId,
    title: title.slice(0, 200),
    event_date: date,
    all_day: !time,
    created_by: ctx.userId,
    status: "active",
  };
  if (time) insert.event_time = time;
  if (p.description) insert.description = String(p.description).slice(0, 500);
  if (p.location) insert.location = String(p.location).slice(0, 200);
  const child = resolveChild(String(p.child_name || ""), ctx.children);
  if (child) insert.child_id = child.id;

  console.log("[TOOL] create_event INSERT:", JSON.stringify(insert));

  const { error } = await ctx.supabase.from("events").insert(insert);

  if (error) {
    console.error("[TOOL] create_event ERROR:", error.code, error.message, error.details);
    return { success: false, message: `Erro: ${error.message}` };
  }

  console.log("[TOOL] create_event SUCCESS");

  const timeStr = time ? ` as ${time}` : "";
  return {
    success: true,
    message: `Evento criado: "${title}" em ${date.split("-").reverse().join("/")}${timeStr}`,
  };
}

async function execCreateAppointment(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const child = resolveChild(String(p.child_name || ""), ctx.children);
  if (!child) return { success: false, message: "Nao encontrei essa crianca. Qual o nome?" };

  const date = parseDate(p.date, todayISO());
  const time = parseTime(p.time) || "09:00";
  const specialty = String(p.specialty || "consulta");
  const title = p.doctor_name
    ? `${specialty} — Dr(a). ${p.doctor_name}`
    : specialty.charAt(0).toUpperCase() + specialty.slice(1);

  const appointmentDate = `${date}T${time}:00-03:00`;

  const insertAppt = {
    group_id: ctx.groupId,
    child_id: child.id,
    title: title.slice(0, 200),
    appointment_date: appointmentDate,
    appointment_type: p.appointment_type || "routine",
    location: p.location ? String(p.location).slice(0, 200) : null,
    notes: p.notes ? String(p.notes).slice(0, 2000) : null,
    status: "scheduled",
    created_by: ctx.userId,
  };

  console.log("[TOOL] create_appointment INSERT:", JSON.stringify(insertAppt));

  const { error } = await ctx.supabase.from("medical_appointments").insert(insertAppt);

  if (error) {
    console.error("[TOOL] create_appointment ERROR:", error.code, error.message, error.details);
    return { success: false, message: `Erro: ${error.message}` };
  }

  console.log("[TOOL] create_appointment SUCCESS");

  return {
    success: true,
    message: `Consulta agendada: ${title} — ${child.name.split(" ")[0]} em ${date.split("-").reverse().join("/")} as ${time}`,
  };
}

async function execCreateCheckin(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const child = resolveChild(String(p.child_name || ""), ctx.children);
  const title = String(p.title || "Check-in");
  const category = String(p.category || "other");

  const insertCheckin = {
    group_id: ctx.groupId,
    child_id: child?.id || (ctx.children[0]?.id ?? null),
    logged_by: ctx.userId,
    category,
    title: title.slice(0, 200),
    description: p.notes ? String(p.notes).slice(0, 2000) : null,
    checkin_date: todayISO(),
  };

  console.log("[TOOL] create_checkin INSERT:", JSON.stringify(insertCheckin));

  const { error } = await ctx.supabase.from("daily_checkins").insert(insertCheckin);

  if (error) {
    console.error("[TOOL] create_checkin ERROR:", error.code, error.message, error.details);
    return { success: false, message: `Erro: ${error.message}` };
  }

  console.log("[TOOL] create_checkin SUCCESS");

  const childLabel = child ? ` (${child.name.split(" ")[0]})` : "";
  return {
    success: true,
    message: `Check-in registrado${childLabel}: ${title}`,
  };
}

async function execCreateNote(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const title = String(p.title || "Nota");
  const content = String(p.content || "");

  const insertNote = {
    user_id: ctx.userId,
    group_id: ctx.groupId,
    title: title.slice(0, 200),
    content: content.slice(0, 5000),
    category: p.category || "lembrete",
  };

  console.log("[TOOL] create_note INSERT:", JSON.stringify(insertNote));

  const { error } = await ctx.supabase.from("private_notes").insert(insertNote);

  if (error) {
    console.error("[TOOL] create_note ERROR:", error.code, error.message, error.details);
    return { success: false, message: `Erro: ${error.message}` };
  }

  console.log("[TOOL] create_note SUCCESS");
  return { success: true, message: `Nota criada: "${title}"` };
}

/* Map Portuguese day abbreviations to standard DB format */
function parseDaysOfWeek(raw: string): string[] {
  if (!raw) return [];
  const map: Record<string, string> = {
    seg: "seg", segunda: "seg", "segunda-feira": "seg", mon: "seg", monday: "seg",
    ter: "ter", terca: "ter", "terca-feira": "ter", tue: "ter", tuesday: "ter",
    qua: "qua", quarta: "qua", "quarta-feira": "qua", wed: "qua", wednesday: "qua",
    qui: "qui", quinta: "qui", "quinta-feira": "qui", thu: "qui", thursday: "qui",
    sex: "sex", sexta: "sex", "sexta-feira": "sex", fri: "sex", friday: "sex",
    sab: "sab", sabado: "sab", sat: "sab", saturday: "sab",
    dom: "dom", domingo: "dom", sun: "dom", sunday: "dom",
  };
  return raw.split(",").map((d) => {
    const key = norm(d);
    return map[key] || key;
  }).filter(Boolean);
}

async function execCreateActivity(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const child = resolveChild(String(p.child_name || ""), ctx.children);
  const name = String(p.name || "");
  if (!name) return { success: false, message: "Nome da atividade e obrigatorio." };

  const days = parseDaysOfWeek(String(p.days_of_week || ""));

  const insert: Record<string, unknown> = {
    group_id: ctx.groupId,
    child_id: child?.id || null,
    name: name.slice(0, 200),
    category: p.category || "other",
    recurrence_type: days.length > 0 ? "weekly" : "never",
    start_date: todayISO(),
    is_active: true,
    created_by: ctx.userId,
  };
  if (days.length > 0) insert.days_of_week = days;
  const timeStart = parseTime(p.time_start);
  const timeEnd = parseTime(p.time_end);
  if (timeStart) insert.time_start = timeStart;
  if (timeEnd) insert.time_end = timeEnd;
  if (p.location) insert.location = String(p.location).slice(0, 200);

  console.log("[TOOL] create_activity INSERT:", JSON.stringify(insert));

  const { error } = await ctx.supabase.from("child_activities").insert(insert);

  if (error) {
    console.error("[TOOL] create_activity ERROR:", error.code, error.message, error.details);
    return { success: false, message: `Erro: ${error.message}` };
  }

  console.log("[TOOL] create_activity SUCCESS");

  const childLabel = child ? ` (${child.name.split(" ")[0]})` : "";
  return { success: true, message: `Atividade registrada: ${name}${childLabel}` };
}

/* ------------------------------------------------------------------ */
/* QUERY EXECUTORS                                                     */
/* ------------------------------------------------------------------ */

async function execGetCustody(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const date = parseDate(p.date, todayISO());

  const { data } = await ctx.supabase
    .from("custody_events")
    .select("child_id, responsible_user_id, custody_type, start_date, end_date, notes")
    .eq("group_id", ctx.groupId)
    .lte("start_date", date)
    .gte("end_date", date);

  if (!data || data.length === 0) {
    return { success: true, message: "Nenhum registro de guarda encontrado para essa data." };
  }

  const lines = data.map((e) => {
    const child = ctx.children.find((c) => c.id === e.child_id);
    const member = ctx.members.find((m) => m.id === e.responsible_user_id);
    const childName = child?.name.split(" ")[0] || "Crianca";
    const memberName = member?.name.split(" ")[0] || "Responsavel";
    return `${childName} esta com ${memberName} (${e.custody_type})`;
  });

  return { success: true, message: lines.join(". ") + ".", data: { events: data } };
}

async function execGetExpenses(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const period = String(p.period || "month");
  const now = new Date();
  let startDate: string;

  if (period === "week") {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    startDate = d.toISOString().split("T")[0];
  } else if (period === "year") {
    startDate = `${now.getFullYear()}-01-01`;
  } else {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }

  let query = ctx.supabase
    .from("expenses")
    .select("amount, category, description, expense_date, child_id, paid_by, status")
    .eq("group_id", ctx.groupId)
    .gte("expense_date", startDate);

  if (p.child_name) {
    const child = resolveChild(String(p.child_name), ctx.children);
    if (child) query = query.eq("child_id", child.id);
  }

  const { data, error } = await query;
  if (error) return { success: false, message: `Erro: ${error.message}` };
  if (!data || data.length === 0) {
    return { success: true, message: `Nenhuma despesa registrada neste periodo (${period}).` };
  }

  const total = data.reduce((s, e) => s + Number(e.amount), 0);
  const byCategory: Record<string, number> = {};
  const byPayer: Record<string, number> = {};

  for (const e of data) {
    const cat = e.category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount);
    const payer = ctx.members.find((m) => m.id === e.paid_by)?.name.split(" ")[0] || "?";
    byPayer[payer] = (byPayer[payer] || 0) + Number(e.amount);
  }

  const catLines = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, val]) => `${CAT_LABELS[cat] || cat}: ${formatBRL(val)}`)
    .join(", ");

  const payerLines = Object.entries(byPayer)
    .map(([name, val]) => `${name}: ${formatBRL(val)}`)
    .join(", ");

  return {
    success: true,
    message: `Total: ${formatBRL(total)} (${data.length} despesas). Por categoria: ${catLines}. Pago por: ${payerLines}.`,
    data: { total, count: data.length, byCategory, byPayer },
  };
}

async function execGetUpcoming(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const days = Number(p.days) || 7;
  const today = todayISO();
  const future = new Date();
  future.setDate(future.getDate() + days);
  const futureISO = future.toISOString().split("T")[0];

  // Events
  const { data: events } = await ctx.supabase
    .from("events")
    .select("title, event_date, event_time, location, status")
    .eq("group_id", ctx.groupId)
    .eq("status", "active")
    .gte("event_date", today)
    .lte("event_date", futureISO)
    .order("event_date")
    .limit(10);

  // Appointments
  const { data: appointments } = await ctx.supabase
    .from("medical_appointments")
    .select("title, appointment_date, child_id, location")
    .eq("group_id", ctx.groupId)
    .gte("appointment_date", `${today}T00:00:00`)
    .lte("appointment_date", `${futureISO}T23:59:59`)
    .order("appointment_date")
    .limit(10);

  const items: string[] = [];

  events?.forEach((e) => {
    const d = e.event_date.split("-").reverse().join("/");
    const t = e.event_time ? ` as ${e.event_time.slice(0, 5)}` : "";
    items.push(`${d}${t} — ${e.title}${e.location ? ` (${e.location})` : ""}`);
  });

  appointments?.forEach((a) => {
    const dt = new Date(a.appointment_date);
    const d = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const t = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    const child = ctx.children.find((c) => c.id === a.child_id);
    const childLabel = child ? ` (${child.name.split(" ")[0]})` : "";
    items.push(`${d} as ${t} — ${a.title}${childLabel}`);
  });

  if (items.length === 0) {
    return { success: true, message: `Nenhum compromisso nos proximos ${days} dias.` };
  }

  return {
    success: true,
    message: `Proximos ${days} dias:\n${items.join("\n")}`,
    data: { events: events?.length || 0, appointments: appointments?.length || 0 },
  };
}

async function execGetChildren(ctx: ToolContext): Promise<ToolResult> {
  const { data } = await ctx.supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", ctx.groupId);

  if (!data || data.length === 0) {
    return { success: true, message: "Nenhuma crianca registrada no grupo." };
  }

  // Fetch education info
  const childIds = data.map((c: { id: string }) => c.id);
  const { data: education } = await ctx.supabase
    .from("child_education")
    .select("child_id, school_name, grade")
    .in("child_id", childIds);

  const eduMap: Record<string, { child_id: string; school_name: string | null; grade: string | null }> = {};
  (education || []).forEach((e: { child_id: string; school_name: string | null; grade: string | null }) => { eduMap[e.child_id] = e; });

  const lines = data.map((c: { id: string; full_name: string; birth_date: string | null }) => {
    const age = c.birth_date
      ? Math.floor((Date.now() - new Date(c.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;
    const ageStr = age !== null ? ` (${age} anos)` : "";
    const edu = eduMap[c.id];
    const school = edu?.school_name ? ` — ${edu.school_name}` : "";
    const grade = edu?.grade ? ` (${edu.grade})` : "";
    return `${c.full_name}${ageStr}${school}${grade}`;
  });

  return { success: true, message: lines.join(". ") + "." };
}

async function execGetHealth(p: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const child = resolveChild(String(p.child_name || ""), ctx.children);
  if (!child) return { success: false, message: "Nao encontrei essa crianca. Qual o nome?" };

  // Recent health logs
  const { data: logs } = await ctx.supabase
    .from("health_logs")
    .select("log_type, value, notes, logged_at")
    .eq("child_id", child.id)
    .order("logged_at", { ascending: false })
    .limit(5);

  // Upcoming appointments
  const { data: appts } = await ctx.supabase
    .from("medical_appointments")
    .select("title, appointment_date, appointment_type")
    .eq("child_id", child.id)
    .gte("appointment_date", `${todayISO()}T00:00:00`)
    .order("appointment_date")
    .limit(3);

  // Allergies
  const { data: allergies } = await ctx.supabase
    .from("health_logs")
    .select("value, notes")
    .eq("child_id", child.id)
    .eq("log_type", "allergy");

  // Active medications
  const { data: meds } = await ctx.supabase
    .from("health_logs")
    .select("value, notes, logged_at")
    .eq("child_id", child.id)
    .eq("log_type", "medication")
    .order("logged_at", { ascending: false })
    .limit(3);

  const parts: string[] = [`Saude de ${child.name.split(" ")[0]}:`];

  if (allergies && allergies.length > 0) {
    parts.push(`Alergias: ${allergies.map((a) => a.value).join(", ")}`);
  }

  if (meds && meds.length > 0) {
    parts.push(`Medicamentos recentes: ${meds.map((m) => m.value).join(", ")}`);
  }

  if (logs && logs.length > 0) {
    const recent = logs.map((l) => `${l.log_type}: ${l.value}`).join("; ");
    parts.push(`Registros recentes: ${recent}`);
  }

  if (appts && appts.length > 0) {
    const next = appts.map((a) => {
      const dt = new Date(a.appointment_date);
      return `${a.title} em ${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
    });
    parts.push(`Proximas consultas: ${next.join(", ")}`);
  } else {
    parts.push("Sem consultas agendadas.");
  }

  return { success: true, message: parts.join("\n") };
}

/* ------------------------------------------------------------------ */
/* TWO-PARTY EXECUTORS (delegate to services for paridade PWA/Native)  */
/* ------------------------------------------------------------------ */

function resolveMember(
  name: string,
  members: ToolContext["members"],
  selfId: string,
): ToolContext["members"][number] | null {
  if (!name) return null;
  const n = norm(name);
  for (const m of members) {
    if (m.id === selfId) continue;
    const first = norm(m.name.split(" ")[0]);
    if (n.includes(first) || first.includes(n)) return m;
  }
  // Fallback: if only one other member exists, pick them.
  const others = members.filter((m) => m.id !== selfId);
  if (others.length === 1) return others[0];
  return null;
}

async function execCreateSwapRequest(
  p: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const targetName = String(p.target_member_name || "");
  const target = resolveMember(targetName, ctx.members, ctx.userId);
  if (!target) {
    return {
      success: false,
      message: "Nao identifiquei com qual coparente voce quer trocar. Diga o nome.",
    };
  }

  const originalDate = String(p.original_date || "");
  if (!originalDate) {
    return { success: false, message: "Qual data voce quer trocar?" };
  }

  const result = await createSwapRequestService(ctx.supabase, {
    groupId: ctx.groupId,
    requesterId: ctx.userId,
    targetUserId: target.id,
    originalDate,
    proposedDate: (p.proposed_date as string) || null,
    reason: (p.reason as string) || null,
    type: p.type === "visit" ? "visit" : "swap",
  });

  if (!result.ok) return { success: false, message: result.error };

  const dateBR = originalDate.split("-").reverse().join("/");
  const targetFirst = target.name.split(" ")[0];
  return {
    success: true,
    message: `Solicitacao de troca enviada para ${targetFirst} (${dateBR}). Voce sera avisado quando responder.`,
    data: { id: result.data.id, target_user_id: target.id },
  };
}

async function execRespondSwapRequest(
  p: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const swapId = String(p.swap_id || "");
  const decision = p.decision === "approved" ? "approved" : "rejected";

  const result = await respondToSwapRequestService(ctx.supabase, {
    swapId,
    responderId: ctx.userId,
    decision,
  });

  if (!result.ok) return { success: false, message: result.error };

  return {
    success: true,
    message:
      decision === "approved"
        ? "Troca aprovada. Calendario atualizado."
        : "Troca recusada.",
  };
}

async function execGetPendingApprovals(ctx: ToolContext): Promise<ToolResult> {
  const swaps = await listPendingSwapsForUser(ctx.supabase, ctx.userId, ctx.groupId);

  if (swaps.length === 0) {
    return { success: true, message: "Nenhuma aprovacao pendente. ✨" };
  }

  const lines = swaps.map((s) => {
    const d = s.original_date.split("-").reverse().join("/");
    const prop = s.proposed_date
      ? ` ↔ ${s.proposed_date.split("-").reverse().join("/")}`
      : " (divida)";
    return `• ${s.requester_name}: ${d}${prop}${s.reason ? ` — ${s.reason}` : ""}`;
  });

  return {
    success: true,
    message: `Voce tem ${swaps.length} aprovacao(oes) pendente(s):\n${lines.join("\n")}\n\nResponda com 'aprovar <numero>' ou 'recusar <numero>' (use os botoes quando aparecerem).`,
    data: { swaps },
  };
}
