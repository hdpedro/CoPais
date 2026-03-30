/* ------------------------------------------------------------------ */
/* /api/ai/assistant — LOCAL-FIRST AI with Router fallback             */
/* Uses AI Router (Groq→Together→Gemini) instead of direct Groq calls  */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AI_TOOLS, executeTool, ToolContext } from "@/lib/ai/tools";
import { aiRateLimiter } from "@/lib/ai/rate-limit";
import { parseIntent } from "@/lib/ai/local-parser";
import { routeToolsRequest, routeTextRequest } from "@/lib/ai/router";
import { logAIRequest } from "@/lib/ai/core/logger";
import { canUseAI } from "@/lib/ai/core/usage";
import { AIChatMessage, AIToolDefinition } from "@/lib/ai/core/types";

const MAX_TOOL_ROUNDS = 3;

export const maxDuration = 60;

/* ------------------------------------------------------------------ */
/* Build context                                                       */
/* ------------------------------------------------------------------ */

async function buildContext(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  groupId: string
): Promise<{ contextStr: string; toolCtx: ToolContext; custodyEnabled: boolean }> {
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
    supabase: supabase,
    userId,
    groupId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children: (children || []).map((c: any) => ({
      id: c.id,
      name: c.full_name,
      birth_date: c.birth_date,
    })),
    members,
  };

  return { contextStr, toolCtx, custodyEnabled };
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

function buildSystemPrompt(context: string, custodyEnabled: boolean): string {
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
/* LOCAL-FIRST: Map local parser actions → tool calls                  */
/* ------------------------------------------------------------------ */

function mapLocalActionToTool(
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

    default:
      return null;
  }
}

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
/* POST Handler                                                        */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    // Rate limit check
    const rateCheck = aiRateLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Muitas mensagens. Aguarde um momento." },
        { status: 429 }
      );
    }

    // Usage limit check
    const usageCheck = await canUseAI(user.id, "assistant_chat");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: "Limite diario do assistente atingido." },
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

    const reversedMessages = [...messages].reverse();
    const lastUserMsg = reversedMessages.find((m) => m.role === "user");
    if (!lastUserMsg?.content?.trim()) {
      return NextResponse.json(
        { error: "Mensagem vazia não permitida." },
        { status: 400 }
      );
    }
    const userText = lastUserMsg.content;

    const { contextStr, toolCtx, custodyEnabled } = await buildContext(supabase, user.id, groupId);

    /* ================================================================ */
    /* STEP 0: Check confirmation of pending action                     */
    /* ================================================================ */

    const CONFIRM_PREFIX = "\u23F3"; // ⏳
    const CONFIRM_WORDS = /^(sim|ok|confirma|pode|faz|manda|isso|exato|confirmo|yes|s|vai|bora)[\s!.]*$/i;
    const CANCEL_WORDS = /^(nao|n[ãa]o|cancela|nope|no|deixa|esquece)[\s!.]*$/i;

    const childNames = toolCtx.children.map((c) => c.name);
    const memberNames = toolCtx.members.map((m) => m.name);

    const lastAssistantMsg = reversedMessages.find((m) => m.role === "assistant");
    const isPendingConfirmation = lastAssistantMsg?.content?.startsWith(CONFIRM_PREFIX);

    if (isPendingConfirmation && CANCEL_WORDS.test(userText.trim())) {
      return NextResponse.json({
        role: "assistant",
        content: "\u274C A\u00e7\u00e3o cancelada. Como posso ajudar?",
      });
    }

    if (isPendingConfirmation && CONFIRM_WORDS.test(userText.trim())) {
      const reversedMsgs = [...messages].reverse();
      let foundAssistant = false;
      let originalText = "";
      for (const m of reversedMsgs) {
        if (m.role === "assistant" && m.content?.startsWith(CONFIRM_PREFIX)) {
          foundAssistant = true;
          continue;
        }
        if (foundAssistant && m.role === "user") {
          originalText = m.content;
          break;
        }
      }

      if (originalText) {
        const originalIntent = parseIntent(originalText, childNames, memberNames, "pt");
        if (originalIntent && originalIntent.confidence >= 0.7) {
          const mapped = mapLocalActionToTool(originalIntent, toolCtx);
          if (mapped) {
            console.log(`[LOCAL] Confirmed: ${mapped.toolName}`);
            const result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);

            await logAIRequest({
              userId: user.id,
              groupId,
              provider: "local",
              feature: "assistant_tool",
              success: result.success,
              responseTimeMs: Date.now() - start,
            });

            return NextResponse.json({
              role: "assistant",
              content: result.success ? `\u2705 ${result.message}` : `\u26A0\uFE0F ${result.message}`,
            });
          }
        }
      }
    }

    /* ================================================================ */
    /* STEP 1: Try LOCAL parsing                                        */
    /* ================================================================ */

    const localIntent = parseIntent(userText, childNames, memberNames, "pt");

    if (localIntent && localIntent.confidence >= 0.7) {
      const isActionIntent = localIntent.action.startsWith("create");

      if (isActionIntent) {
        await logAIRequest({
          userId: user.id,
          groupId,
          provider: "local",
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });

        return NextResponse.json({
          role: "assistant",
          content: `${CONFIRM_PREFIX} ${localIntent.confirmation}`,
        });
      }

      const mapped = mapLocalActionToTool(localIntent, toolCtx);
      if (mapped) {
        const result = await executeTool(mapped.toolName, mapped.toolParams, toolCtx);

        await logAIRequest({
          userId: user.id,
          groupId,
          provider: "local",
          feature: "assistant_tool",
          success: result.success,
          responseTimeMs: Date.now() - start,
        });

        if (result.success) {
          return NextResponse.json({
            role: "assistant",
            content: `\u2705 ${result.message}`,
          });
        }
      }
    }

    /* ================================================================ */
    /* STEP 2: AI Router fallback (Groq → Together → Gemini)            */
    /* ================================================================ */

    console.log(`[AI-ROUTER] Processing request (${userText.length} chars)`);

    const systemMsg: AIChatMessage = {
      role: "system",
      content: buildSystemPrompt(contextStr, custodyEnabled),
    };

    const recentMessages = messages.slice(-20);
    const routerMessages: AIChatMessage[] = [
      systemMsg,
      ...recentMessages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ];

    const toolResultsSummary: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { response, provider } = await routeToolsRequest(
        routerMessages,
        AI_TOOLS as unknown as AIToolDefinition[],
        { temperature: 0.3, maxTokens: 1000, timeoutMs: 10000 }
      );

      if (!response.toolCalls || response.toolCalls.length === 0) {
        const content = sanitizeResponse(response.content || "");
        if (content.length < 5 && toolResultsSummary.length > 0) {
          await logAIRequest({
            userId: user.id,
            groupId,
            provider,
            feature: "assistant_chat",
            success: true,
            responseTimeMs: Date.now() - start,
          });
          return NextResponse.json({
            role: "assistant",
            content: toolResultsSummary.join("\n"),
          });
        }

        await logAIRequest({
          userId: user.id,
          groupId,
          provider,
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });

        return NextResponse.json({
          role: "assistant",
          content: content || "Nao entendi. Pode reformular?",
        });
      }

      // Execute tool calls
      routerMessages.push({
        role: "assistant",
        content: response.content || "",
        tool_calls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        console.log(`[AI-ROUTER] Tool: ${toolCall.function.name}`, args);
        const result = await executeTool(toolCall.function.name, args, toolCtx);

        if (result.message) {
          toolResultsSummary.push(
            result.success ? `\u2705 ${result.message}` : `\u26A0\uFE0F ${result.message}`
          );
        }

        routerMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Exhausted tool rounds — get final text response
    try {
      const { text: finalText, provider } = await routeTextRequest(
        routerMessages,
        { temperature: 0.4, maxTokens: 1000, timeoutMs: 10000 }
      );

      const finalContent = sanitizeResponse(finalText);
      if (finalContent && finalContent.length >= 5) {
        await logAIRequest({
          userId: user.id,
          groupId,
          provider,
          feature: "assistant_chat",
          success: true,
          responseTimeMs: Date.now() - start,
        });
        return NextResponse.json({ role: "assistant", content: finalContent });
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
      content: "Pronto! Acao realizada com sucesso. \u2705",
    });
  } catch (error: unknown) {
    console.error("AI Chat error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";

    const isRateLimit = /rate_limit|429|Limit|tokens|abort|TPD/i.test(msg);

    await logAIRequest({
      userId: "unknown",
      provider: "none",
      feature: "assistant_chat",
      success: false,
      responseTimeMs: Date.now() - start,
      errorMessage: msg,
    });

    if (isRateLimit) {
      return NextResponse.json(
        { role: "assistant", content: "O assistente atingiu o limite temporario. Tente em alguns minutos. \u23F3" },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { role: "assistant", content: "Desculpe, ocorreu um erro. Tente novamente. \uD83D\uDE4F" },
      { status: 500 }
    );
  }
}
