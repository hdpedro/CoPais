/* ------------------------------------------------------------------ */
/* /api/ai/assistant — Conversational AI with tool calling             */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@/lib/supabase/server";
import { AI_TOOLS, executeTool, ToolContext } from "@/lib/ai-tools";
import { aiRateLimiter } from "@/lib/ai-rate-limit";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL_PRIMARY = "llama-3.3-70b-versatile";
const MODEL_FALLBACK = "llama-3.1-8b-instant";
const MAX_TOOL_ROUNDS = 3;

/* ------------------------------------------------------------------ */
/* Build context                                                       */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildContext(
  supabase: any,
  userId: string,
  groupId: string
): Promise<{ contextStr: string; toolCtx: ToolContext }> {
  // Children
  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", groupId);

  // Members
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

  // Today's custody
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
/* Groq call with automatic model fallback                             */
/* ------------------------------------------------------------------ */

async function callGroqWithFallback(
  messages: any[],
  toolChoice: "auto" | "none" = "auto"
) {
  // Try primary model first
  let useFallback = false;
  try {
    return await groq.chat.completions.create({
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
      msg.includes("TPD");

    if (!isRateLimit) throw err;
    useFallback = true;
  }

  // Fallback to smaller model (8B)
  console.log(`Groq 70B rate limited, falling back to ${MODEL_FALLBACK}`);
  try {
    return await groq.chat.completions.create({
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

    // 8B model generated malformed tool call — retry without tools for a text-only response
    console.log("8B tool_use_failed, retrying without tools for text response");
    // Filter messages: keep only system + user + assistant text messages (remove tool messages)
    const textOnlyMessages = messages.filter(
      (m: any) => m.role === "system" || m.role === "user" || (m.role === "assistant" && !m.tool_calls)
    );
    return await groq.chat.completions.create({
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

    // Rate limiting
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

    // Build context
    const { contextStr, toolCtx } = await buildContext(
      supabase,
      user.id,
      groupId
    );

    // Build full message array with system prompt
    const systemMsg = {
      role: "system" as const,
      content: buildSystemPrompt(contextStr),
    };

    // Keep only last 20 messages to avoid token limits
    const recentMessages = messages.slice(-20);

    // Call Groq with tools (auto-fallback to 8B if 70B rate limited)
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

      // No tool calls — return the response directly
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const content = assistantMsg.content || "";
        // Quality check: if response is too short (just emoji or single word), improve it
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

      // Execute tool calls
      groqMessages.push(assistantMsg);

      for (const toolCall of assistantMsg.tool_calls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        const result = await executeTool(
          toolCall.function.name,
          args,
          toolCtx
        );

        // Collect tool results for fallback summary
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

      // Continue loop to let Groq generate final response with tool results
    }

    // Exhausted tool rounds — do one final call with tool_choice "none" to force a text response
    try {
      const finalCompletion = await callGroqWithFallback(groqMessages, "none");
      const finalContent = finalCompletion.choices[0]?.message?.content;
      // Quality check: if final response is too short, use tool results summary
      if (finalContent && finalContent.length >= 5) {
        return NextResponse.json({
          role: "assistant",
          content: finalContent,
        });
      }
    } catch {
      // Fall through to default
    }

    // Use collected tool results as a human-readable response
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

    // User-friendly error messages
    const isRateLimit = msg.includes("rate_limit") || msg.includes("429") || msg.includes("Limit") || msg.includes("tokens");
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
