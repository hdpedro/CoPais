/* ------------------------------------------------------------------ */
/* /api/ai/assistant — LOCAL-FIRST AI with Groq fallback              */
/* Tries to resolve intent locally before calling Groq to save calls  */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@/lib/supabase/server";
import { AI_TOOLS, executeTool, ToolContext } from "@/lib/ai-tools";
import { aiRateLimiter } from "@/lib/ai-rate-limit";
import { parseIntent, parseAmount, parseRelativeDate, parseTime } from "@/lib/ai-local-parser";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL_PRIMARY = "llama-3.3-70b-versatile";
const MODEL_FALLBACK = "llama-3.1-8b-instant";
const MAX_TOOL_ROUNDS = 3;
const GROQ_TIMEOUT_MS = 8000;

export const maxDuration = 60;

/* ------------------------------------------------------------------ */
/* Build context                                                       */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildContext(
  supabase: any,
  userId: string,
  groupId: string
): Promise<{ contextStr: string; toolCtx: ToolContext }> {
  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", groupId);

  const { data: membersRaw } = await supabase
    .from("group_members")
    .select("user_id, role, profiles(full_name)")
    .eq("group_id", groupId);

  const members = (membersRaw || []).map((m: any) => ({
    id: m.user_id,
    name: m.profiles?.full_name || "Membro",
  }));

  const childrenList = (children || []).map((c: any) => {
    const age = c.birth_date
      ? Math.floor(
          (Date.now() - new Date(c.birth_date).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : null;
    return `${c.full_name}${age !== null ? ` (${age} anos)` : ""}`;
  });

  const currentUser = members.find((m: any) => m.id === userId);
  const membersList = members.map(
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

  const custodyLines = (custody || []).map((e: any) => {
    const child = (children || []).find((c: any) => c.id === e.child_id);
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
    supabase: supabase,
    userId,
    groupId,
    children: (children || []).map((c: any) => ({
      id: c.id,
      name: c.full_name,
      birth_date: c.birth_date,
    })),
    members,
  };

  return { contextStr, toolCtx };
}

/* ------------------------------------------------------------------ */
/* Sanitize response — strip malformed function-call XML from 8B      */
/* ------------------------------------------------------------------ */

function sanitizeResponse(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/<function=[^>]*>[\s\S]*?<\/function>/gi, "").trim();
  cleaned = cleaned.replace(/<\/?function[^>]*>/gi, "").trim();
  cleaned = cleaned.replace(/```json\s*\{[^}]*"name"\s*:\s*"[^"]*"[^`]*```/gi, "").trim();
  return cleaned;
}

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(context: string): string {
  return `Voce e o Kindar, assistente inteligente de coparentalidade. Voce ajuda pais separados a gerenciar a vida dos filhos com eficiencia e harmonia.

CONTEXTO DA FAMILIA:
${context}

SUAS CAPACIDADES:
- Criar despesas, eventos, consultas, check-ins, notas e atividades usando tools
- Consultar agenda, gastos, saude e informacoes das criancas usando tools
- Ajudar a redigir mensagens respeitosas para o coparente
- Responder duvidas sobre coparentalidade

REGRAS OBRIGATORIAS:
1. Responda SEMPRE em portugues brasileiro, de forma calorosa e direta
2. Use os tools para executar acoes e consultar dados — NUNCA invente dados
3. Se faltar informacao essencial, pergunte de forma simpatica
4. Valores monetarios → R$ XX,XX (formato brasileiro)
5. Datas → DD/MM/YYYY (formato brasileiro)
6. Mantenha respostas concisas: max 2-3 frases para acoes, um pouco mais para consultas
7. Apos criar algo, confirme o que foi criado com emoji de sucesso
8. Para mensagens ao coparente, sugira tom neutro e respeitoso
9. Se nao entender, peca para reformular — nao assuma
10. Seja empatico com situacoes dificeis de coparentalidade
11. Use emojis com moderacao para tornar a conversa mais amigavel`;
}

/* ------------------------------------------------------------------ */
/* LOCAL-FIRST: Map local parser actions → tool calls                  */
/* ------------------------------------------------------------------ */

/** Map parseIntent action names to AI tool names & build tool params */
function mapLocalActionToTool(
  intent: { action: string; params: Record<string, string>; confidence: number },
  toolCtx: ToolContext
): { toolName: string; toolParams: Record<string, unknown> } | null {
  const p = intent.params;
  const childNames = toolCtx.children.map((c) => c.name);

  switch (intent.action) {
    case "createExpense": {
      const amount = parseAmount(p.amount || p.description || "");
      return {
        toolName: "create_expense",
        toolParams: {
          description: p.description || "Despesa",
          amount: String(amount || p.amount || "0"),
          category: detectExpenseCategory(p.description || ""),
          child_name: p.childName || "",
        },
      };
    }

    case "createAppointment": {
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
    }

    case "createHealthLog": {
      // Map health log to check-in (health category)
      return {
        toolName: "create_checkin",
        toolParams: {
          child_name: p.childName || "",
          category: "health",
          title: p.logType === "temperature"
            ? `Temperatura: ${p.value || "febre"}`
            : `Saude: ${p.value || "sintoma"}`,
          notes: p.notes || "",
        },
      };
    }

    case "createCheckin": {
      return {
        toolName: "create_checkin",
        toolParams: {
          child_name: p.childName || "",
          category: p.category || "other",
          title: p.text?.slice(0, 100) || "Check-in",
          notes: p.text || "",
        },
      };
    }

    case "createEvent": {
      return {
        toolName: "create_event",
        toolParams: {
          title: p.title || "Evento",
          date: p.date || "",
          time: p.time || "",
        },
      };
    }

    case "createNote": {
      return {
        toolName: "create_note",
        toolParams: {
          title: p.title || "Nota",
          content: p.content || p.title || "",
          category: "reminder",
        },
      };
    }

    case "createActivity": {
      return {
        toolName: "create_activity",
        toolParams: {
          child_name: p.childName || "",
          name: p.title || "Atividade",
        },
      };
    }

    case "createMedication": {
      // Map to check-in with health category
      return {
        toolName: "create_checkin",
        toolParams: {
          child_name: p.childName || "",
          category: "health",
          title: `Medicamento: ${p.name || "remedio"}`,
          notes: p.name || "",
        },
      };
    }

    case "createVaccine": {
      return {
        toolName: "create_appointment",
        toolParams: {
          child_name: p.childName || "",
          specialty: "vacina",
          date: p.date || "",
          appointment_type: "vaccine",
        },
      };
    }

    default:
      return null;
  }
}

/** Detect expense category from description */
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

/* ------------------------------------------------------------------ */
/* Groq call with automatic model fallback                             */
/* ------------------------------------------------------------------ */

function groqWithTimeout(params: any) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  return groq.chat.completions
    .create(params, { signal: controller.signal as any })
    .finally(() => clearTimeout(timer));
}

async function callGroqWithFallback(
  messages: any[],
  toolChoice: "auto" | "none" = "auto"
) {
  try {
    return await groqWithTimeout({
      model: MODEL_PRIMARY,
      messages,
      tools: AI_TOOLS as any,
      tool_choice: toolChoice,
      temperature: 0.3,
      max_tokens: 1000,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    const isRateLimit =
      msg.includes("rate_limit") ||
      msg.includes("429") ||
      msg.includes("Limit") ||
      msg.includes("tokens") ||
      msg.includes("TPD") ||
      msg.includes("abort");

    if (!isRateLimit) throw err;
  }

  console.log(`Groq 70B rate limited, falling back to ${MODEL_FALLBACK}`);
  try {
    return await groqWithTimeout({
      model: MODEL_FALLBACK,
      messages,
      tools: AI_TOOLS as any,
      tool_choice: toolChoice,
      temperature: 0.3,
      max_tokens: 1000,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    const isToolUseFailed = msg.includes("tool_use_failed") || msg.includes("tool call validation");

    if (!isToolUseFailed) throw err;

    console.log("8B tool_use_failed, retrying without tools for text response");
    const textOnlyMessages = messages.filter(
      (m: any) => m.role === "system" || m.role === "user" || (m.role === "assistant" && !m.tool_calls)
    );
    return await groqWithTimeout({
      model: MODEL_FALLBACK,
      messages: textOnlyMessages,
      temperature: 0.4,
      max_tokens: 1000,
    });
  }
}

/* ------------------------------------------------------------------ */
/* POST Handler                                                        */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const rateCheck = aiRateLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Muitas mensagens. Aguarde um momento." },
        { status: 429 }
      );
    }

    const { messages, groupId } = (await req.json()) as {
      messages: ChatMessage[];
      groupId: string;
    };

    if (!messages?.length || !groupId) {
      return NextResponse.json(
        { error: "messages e groupId obrigatorios" },
        { status: 400 }
      );
    }

    // Build context (needed for both local and Groq paths)
    const { contextStr, toolCtx } = await buildContext(
      supabase,
      user.id,
      groupId
    );

    // Get the last user message for local parsing
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUserMsg?.content || "";

    /* ================================================================ */
    /* STEP 1: Try LOCAL parsing first — no Groq call needed            */
    /* ================================================================ */

    const childNames = toolCtx.children.map((c) => c.name);
    const memberNames = toolCtx.members.map((m) => m.name);

    const localIntent = parseIntent(userText, childNames, memberNames, "pt");

    if (localIntent && localIntent.confidence >= 0.7) {
      console.log(`[LOCAL] Intent: ${localIntent.action}, confidence: ${localIntent.confidence}, params:`, localIntent.params);

      const mapped = mapLocalActionToTool(localIntent, toolCtx);

      if (mapped) {
        console.log(`[LOCAL] Executing tool: ${mapped.toolName}`, mapped.toolParams);

        const result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);

        console.log(`[LOCAL] Tool result: success=${result.success}, message=${result.message}`);

        if (result.success) {
          return NextResponse.json({
            role: "assistant",
            content: `✅ ${result.message}`,
          });
        } else {
          // Tool failed — maybe missing required params, fall through to Groq
          console.log(`[LOCAL] Tool failed, falling back to Groq: ${result.message}`);
        }
      }
    } else if (localIntent) {
      console.log(`[LOCAL] Low confidence (${localIntent.confidence}), falling back to Groq`);
    }

    /* ================================================================ */
    /* STEP 2: Groq fallback — for complex / ambiguous requests         */
    /* ================================================================ */

    console.log(`[GROQ] Calling Groq for: "${userText.slice(0, 80)}..."`);

    const systemMsg = {
      role: "system" as const,
      content: buildSystemPrompt(contextStr),
    };

    const recentMessages = messages.slice(-20);
    let groqMessages: any[] = [systemMsg, ...recentMessages];
    const toolResultsSummary: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await callGroqWithFallback(groqMessages, "auto");

      const choice = completion.choices[0];
      if (!choice) {
        return NextResponse.json({
          role: "assistant",
          content: "Desculpe, nao consegui processar. Tente novamente.",
        });
      }

      const assistantMsg = choice.message;

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const content = sanitizeResponse(assistantMsg.content || "");
        if (content.length < 5 && toolResultsSummary.length > 0) {
          return NextResponse.json({
            role: "assistant",
            content: toolResultsSummary.join("\n"),
          });
        }
        return NextResponse.json({
          role: "assistant",
          content: content || "Nao entendi. Pode reformular?",
        });
      }

      // Execute tool calls from Groq
      groqMessages.push(assistantMsg);

      for (const toolCall of assistantMsg.tool_calls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        console.log(`[GROQ] Executing tool: ${toolCall.function.name}`, args);

        const result = await executeTool(
          toolCall.function.name,
          args,
          toolCtx
        );

        console.log(`[GROQ] Tool result: success=${result.success}, message=${result.message}`);

        if (result.message) {
          toolResultsSummary.push(
            result.success ? `✅ ${result.message}` : `⚠️ ${result.message}`
          );
        }

        groqMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Exhausted tool rounds
    try {
      const finalCompletion = await callGroqWithFallback(groqMessages, "none");
      const finalContent = sanitizeResponse(finalCompletion.choices[0]?.message?.content || "");
      if (finalContent && finalContent.length >= 5) {
        return NextResponse.json({
          role: "assistant",
          content: finalContent,
        });
      }
    } catch {
      // Fall through to default
    }

    if (toolResultsSummary.length > 0) {
      return NextResponse.json({
        role: "assistant",
        content: toolResultsSummary.join("\n"),
      });
    }

    return NextResponse.json({
      role: "assistant",
      content: "Pronto! Acao realizada com sucesso. ✅",
    });
  } catch (error: unknown) {
    console.error("AI Chat error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";

    const isRateLimit = msg.includes("rate_limit") || msg.includes("429") || msg.includes("Limit") || msg.includes("tokens") || msg.includes("abort") || msg.includes("Abort") || msg.includes("TPD");
    const isToolError = msg.includes("tool_use_failed") || msg.includes("tool call validation");

    let friendlyMsg: string;
    let statusCode: number;
    if (isRateLimit) {
      friendlyMsg = "O assistente atingiu o limite temporario de uso. Tente novamente em alguns minutos. ⏳";
      statusCode = 429;
    } else if (isToolError) {
      friendlyMsg = "Nao consegui processar essa acao agora. Tente reformular o pedido de forma mais simples. 🔄";
      statusCode = 200;
    } else {
      friendlyMsg = "Desculpe, ocorreu um erro. Tente novamente. 🙏";
      statusCode = 500;
    }

    return NextResponse.json(
      { role: "assistant", content: friendlyMsg },
      { status: statusCode }
    );
  }
}
