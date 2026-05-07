/* ------------------------------------------------------------------ */
/* assistant-shared.ts                                                 */
/* Shared logic between in-app AI assistant and WhatsApp assistant.    */
/* Extracted from src/app/api/ai/assistant/route.ts                    */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { ToolContext } from "./tools";

/* ------------------------------------------------------------------ */
/* Confirmation regex (shared between in-app and WhatsApp)             */
/* ------------------------------------------------------------------ */

export const CONFIRM_PREFIX = "\u23F3"; // ⏳
export const CONFIRM_WORDS = /^(sim|ok|confirma|pode|faz|manda|isso|exato|confirmo|yes|s|vai|bora)[\s!.]*$/i;
export const CANCEL_WORDS = /^(nao|n[ãa]o|cancela|nope|no|deixa|esquece)[\s!.]*$/i;

/* ------------------------------------------------------------------ */
/* Build family context for the AI system prompt                       */
/* ------------------------------------------------------------------ */

export interface AssistantContext {
  contextStr: string;
  toolCtx: ToolContext;
  custodyEnabled: boolean;
}

export async function buildAssistantContext(
  supabase: SupabaseClient,
  userId: string,
  groupId: string
): Promise<AssistantContext> {
  const [{ data: children }, { data: groupData }] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name, birth_date")
      .eq("group_id", groupId),
    supabase
      .from("coparenting_groups")
      .select("custody_enabled")
      .eq("id", groupId)
      .single(),
  ]);

  const custodyEnabled: boolean = groupData?.custody_enabled ?? true;

  const { data: membersRaw } = await supabase
    .from("group_members")
    .select("user_id, role, profiles(full_name)")
    .eq("group_id", groupId);

  // Locale do usuário atual (pt-BR | en | es | fr | de)
  const { data: profile } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", userId)
    .single();
  const locale = profile?.locale || "pt-BR";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = (membersRaw || []).map((m: any) => ({
    id: m.user_id,
    name: m.profiles?.full_name || "Membro",
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childrenList = (children || []).map((c: any) => {
    const age = c.birth_date
      ? Math.floor(
          (Date.now() - new Date(c.birth_date).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : null;
    return `${c.full_name}${age !== null ? ` (${age} anos)` : ""}`;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentUser = members.find((m: any) => m.id === userId);
  const membersList = members.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) => `${m.name}${m.id === userId ? " (voce)" : ""}`
  );

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const todayISO = now.toISOString().split("T")[0];
  const { data: custody } = await supabase
    .from("custody_events")
    .select("child_id, responsible_user_id, custody_type")
    .eq("group_id", groupId)
    .lte("start_date", todayISO)
    .gte("end_date", todayISO);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const custodyLines = (custody || []).map((e: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const child = (children || []).find((c: any) => c.id === e.child_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const member = members.find((m: any) => m.id === e.responsible_user_id);
    return `${child?.full_name?.split(" ")[0] || "?"} esta com ${member?.name?.split(" ")[0] || "?"}`;
  });

  const contextStr = [
    `Hoje: ${dateStr}`,
    `Usuario: ${currentUser?.name || "?"}`,
    `Criancas: ${childrenList.join(", ") || "nenhuma"}`,
    `Membros: ${membersList.join(", ")}`,
    custodyLines.length > 0 ? `Guarda hoje: ${custodyLines.join(". ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const toolCtx: ToolContext = {
    supabase,
    userId,
    groupId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children: (children || []).map((c: any) => ({
      id: c.id,
      name: c.full_name,
      birth_date: c.birth_date,
    })),
    members,
    locale,
  };

  return { contextStr, toolCtx, custodyEnabled };
}

/* ------------------------------------------------------------------ */
/* System prompt builder                                               */
/* ------------------------------------------------------------------ */

export function buildSystemPrompt(context: string, custodyEnabled: boolean): string {
  const intro = custodyEnabled
    ? `Voce e o Kindar, assistente inteligente de coparentalidade. Voce ajuda pais separados a gerenciar a vida dos filhos com eficiencia e harmonia.`
    : `Voce e o Kindar, assistente de organizacao familiar. Voce ajuda familias a gerenciar a rotina das criancas com eficiencia e harmonia.`;

  const capabilities = custodyEnabled
    ? `SUAS CAPACIDADES:
- Criar despesas, eventos, consultas, check-ins, notas e atividades usando tools
- Consultar agenda, gastos, saude e informacoes das criancas usando tools
- Ajudar a redigir mensagens respeitosas para o coparente
- Responder duvidas sobre coparentalidade`
    : `SUAS CAPACIDADES:
- Criar despesas, eventos, consultas, check-ins, notas e atividades usando tools
- Consultar agenda, gastos, saude e informacoes das criancas usando tools
- Ajudar a organizar a rotina familiar
- Responder duvidas sobre cuidados com as criancas`;

  const coparentingRules = custodyEnabled
    ? `9. Para mensagens ao coparente, sugira tom neutro e respeitoso
10. Se nao entender, peca para reformular — nao assuma
11. Seja empatico com situacoes dificeis de coparentalidade`
    : `9. Se nao entender, peca para reformular — nao assuma
10. Seja acolhedor e apoie a organizacao familiar`;

  return `${intro}

CONTEXTO DA FAMILIA:
${context}

${capabilities}

REGRAS OBRIGATORIAS:
1. Responda SEMPRE em portugues brasileiro, de forma calorosa e direta
2. Use os tools para executar acoes e consultar dados — NUNCA invente dados
3. Se faltar informacao essencial, pergunte de forma simpatica
4. Valores monetarios → R$ XX,XX (formato brasileiro)
5. Datas → DD/MM/YYYY (formato brasileiro)
6. Mantenha respostas concisas: max 2-3 frases para acoes, um pouco mais para consultas
7. ANTES de executar qualquer acao (criar despesa, evento, consulta, etc.), SEMPRE peca confirmacao ao usuario primeiro. Descreva o que sera feito e pergunte "Confirma?". So execute o tool DEPOIS que o usuario confirmar com "sim", "ok", "confirma" ou similar
8. Apos criar algo, confirme o que foi criado com emoji de sucesso
${coparentingRules}
12. Use emojis com moderacao para tornar a conversa mais amigavel
13. Tools de CONSULTA (get_*) podem ser executados diretamente, sem confirmacao`;
}

/* ------------------------------------------------------------------ */
/* Map local parser actions to tool calls                               */
/* ------------------------------------------------------------------ */

export function mapLocalActionToTool(
  intent: { action: string; params: Record<string, string>; confidence: number },
  _toolCtx: ToolContext // eslint-disable-line @typescript-eslint/no-unused-vars
): { toolName: string; toolParams: Record<string, unknown> } | null {
  const p = intent.params;

  switch (intent.action) {
    case "createExpense": {
      const amount = Number(p.amount) || 0;
      const description = p.description || "";
      if (!description.trim() || amount === 0) return null;
      return {
        toolName: "create_expense",
        toolParams: {
          description,
          amount: amount > 0 ? amount.toFixed(2) : "0",
          category: detectExpenseCategory(description),
          child_name: p.childName || "",
        },
      };
    }

    case "createAppointment":
      return {
        toolName: "create_appointment",
        toolParams: {
          child_name: p.childName || "",
          specialty: p.specialty || "consulta",
          date: p.date || "",
          time: p.time || "",
          appointment_type: p.appointmentType || "routine",
          doctor_name: p.doctorName || "",
        },
      };

    case "createHealthLog":
      return {
        toolName: "create_checkin",
        toolParams: {
          child_name: p.childName || "",
          category: "health",
          title:
            p.logType === "temperature"
              ? `Temperatura: ${p.value || "febre"}`
              : `Saude: ${p.value || "sintoma"}`,
          notes: p.notes || "",
        },
      };

    case "createCheckin":
      return {
        toolName: "create_checkin",
        toolParams: {
          child_name: p.childName || "",
          category: p.category || "other",
          title: p.text?.slice(0, 100) || "Check-in",
          notes: p.text || "",
        },
      };

    case "createEvent": {
      const title = p.title || "";
      if (!title.trim()) return null;
      return {
        toolName: "create_event",
        toolParams: { title, date: p.date || "", time: p.time || "" },
      };
    }

    case "createNote":
      return {
        toolName: "create_note",
        toolParams: {
          title: p.title || "Nota",
          content: p.content || p.title || "",
          category: p.category || "lembrete",
        },
      };

    case "createActivity":
      return {
        toolName: "create_activity",
        toolParams: {
          child_name: p.childName || "",
          name: p.title || "Atividade",
        },
      };

    case "createMedication":
      return {
        toolName: "create_checkin",
        toolParams: {
          child_name: p.childName || "",
          category: "health",
          title: `Medicamento: ${p.name || "remedio"}`,
          notes: p.name || "",
        },
      };

    case "createVaccine":
      return {
        toolName: "create_appointment",
        toolParams: {
          child_name: p.childName || "",
          specialty: "vacina",
          date: p.date || "",
          appointment_type: "vaccine",
        },
      };

    case "createSwapRequest": {
      const originalDate = p.date || "";
      if (!originalDate) return null;
      return {
        toolName: "create_swap_request",
        toolParams: {
          target_member_name: p.targetMember || "",
          original_date: originalDate,
          proposed_date: p.proposedDate || "",
          reason: p.reason || "",
          type: "swap",
        },
      };
    }

    case "createDecision": {
      const title = (p.title || "").trim();
      if (!title) return null;
      return {
        toolName: "create_decision",
        toolParams: {
          title,
          description: p.description || "",
          category: p.category || "outro",
        },
      };
    }

    /* -------- QUERIES (mapped to existing get_* tools, no confirmation) -- */

    case "queryCustody":
      return { toolName: "get_custody_info", toolParams: { date: p.date || "" } };

    case "queryUpcoming":
      return { toolName: "get_upcoming_events", toolParams: { days: Number(p.days) || 30 } };

    case "queryExpenses":
      return {
        toolName: "get_expenses_summary",
        toolParams: { period: p.period || "month", child_name: p.child_name || "" },
      };

    case "queryBalance":
      return { toolName: "get_balance", toolParams: {} };

    case "queryHealth":
      return { toolName: "get_health_summary", toolParams: { child_name: p.child_name || "" } };

    case "queryChildren":
      return { toolName: "get_children_info", toolParams: {} };

    case "queryStatus":
      return { toolName: "get_child_status", toolParams: { child_name: p.child_name || "" } };

    case "queryHistory":
      return {
        toolName: "get_child_history",
        toolParams: { child_name: p.child_name || "", days: Number(p.days) || 30 },
      };

    case "queryPending":
      return { toolName: "get_pending_approvals", toolParams: {} };

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function detectExpenseCategory(desc: string): string {
  const n = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/remedio|farmacia|medic|consulta|hospital|saude|vacina/.test(n)) return "health";
  if (/escola|colegio|material|livro|mochila|uniforme|mensalid/.test(n)) return "education";
  if (/comida|almoco|janta|lanche|mercado|supermercado|restaurante|ifood/.test(n)) return "food";
  if (/roupa|calcado|tenis|sapato|vestido/.test(n)) return "clothing";
  if (/parque|cinema|brinquedo|jogo|passeio|viagem|lazer/.test(n)) return "leisure";
  if (/uber|taxi|gasolina|onibus|transporte/.test(n)) return "transport";
  if (/aluguel|condominio|agua|luz|energia/.test(n)) return "housing";
  return "other";
}

/** Sanitize AI response — strip malformed function-call XML from 8B models */
export function sanitizeResponse(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/<function=[^>]*>[\s\S]*?<\/function>/gi, "").trim();
  cleaned = cleaned.replace(/<\/?function[^>]*>/gi, "").trim();
  cleaned = cleaned.replace(/```json\s*\{[^}]*"name"\s*:\s*"[^"]*"[^`]*```/gi, "").trim();
  return cleaned;
}
