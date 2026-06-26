/* ------------------------------------------------------------------ */
/* /api/ai/assistant — App adapter over the shared assistant core       */
/* Auth + rate/cap + stateless confirmation, then runAssistantTurn.     */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { executeTool } from "@/lib/ai/tools";
import { aiRateLimiter } from "@/lib/ai/rate-limit";
import { parseIntent } from "@/lib/ai/local-parser";
import { logAIRequest } from "@/lib/ai/core/logger";
import { canUseAI } from "@/lib/ai/core/usage";
import { AIChatMessage } from "@/lib/ai/core/types";
import {
  CONFIRM_PREFIX,
  CONFIRM_WORDS,
  CANCEL_WORDS,
  buildAssistantContext,
  mapLocalActionToTool,
} from "@/lib/ai/assistant-shared";
import { runAssistantTurn } from "@/lib/ai/assistant-core";

export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    // Auth — Bearer (native) or cookie (PWA) via shared helper.
    const auth = await resolveAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }
    const user = { id: auth.id };
    const supabase = createAdminClient();

    const rateCheck = aiRateLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Muitas mensagens. Aguarde um momento." }, { status: 429 });
    }

    const usageCheck = await canUseAI(user.id, "assistant_chat");
    if (!usageCheck.allowed) {
      return NextResponse.json({ error: "Limite diario do assistente atingido." }, { status: 429 });
    }

    const { messages, groupId } = (await req.json()) as { messages: ChatMessage[]; groupId: string };

    if (!messages?.length || !groupId) {
      return NextResponse.json({ error: "messages e groupId obrigatorios" }, { status: 400 });
    }

    const reversedMessages = [...messages].reverse();
    const lastUserMsg = reversedMessages.find((m) => m.role === "user");
    if (!lastUserMsg?.content?.trim()) {
      return NextResponse.json({ error: "Mensagem vazia não permitida." }, { status: 400 });
    }
    const userText = lastUserMsg.content;

    // Quest step: first AI assistant interaction. Fire-and-forget.
    import("@/actions/onboarding-quest")
      .then(({ markQuestStep }) => markQuestStep("ai_agreement", { channel: "assistant" }))
      .catch((err) => console.error("[assistant] quest track failed:", err));

    const { contextStr, toolCtx, custodyEnabled } = await buildAssistantContext(supabase, user.id, groupId);

    const childNames = toolCtx.children.map((c) => c.name);
    const memberNames = toolCtx.members.map((m) => m.name);

    /* ---- Pending-confirmation handling (stateless: re-parse from the
     *      client message array; WhatsApp does this with DB session). ---- */
    const lastAssistantMsg = reversedMessages.find((m) => m.role === "assistant");
    const isPendingConfirmation = lastAssistantMsg?.content?.startsWith(CONFIRM_PREFIX);

    if (isPendingConfirmation && CANCEL_WORDS.test(userText.trim())) {
      return NextResponse.json({ role: "assistant", content: "❌ Ação cancelada. Como posso ajudar?" });
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
              content: result.success ? `✅ ${result.message}` : `⚠️ ${result.message}`,
            });
          }
        }
      }
    }

    /* ---- Shared orchestration ---- */
    const recentMessages = messages.slice(-20);
    const history: AIChatMessage[] = recentMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const result = await runAssistantTurn({
      userText,
      history,
      contextStr,
      toolCtx,
      custodyEnabled,
      userId: user.id,
      groupId,
      startMs: start,
    });

    if (result.kind === "confirm") {
      return NextResponse.json({ role: "assistant", content: `${CONFIRM_PREFIX} ${result.confirmation}` });
    }
    return NextResponse.json({ role: "assistant", content: result.text });
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
        { error: "O assistente atingiu o limite temporario. Tente em alguns minutos. ⏳" },
        { status: 429 },
      );
    }

    reportServerError(error, { filePath: "src/app/api/ai/assistant/route.ts" });
    return NextResponse.json(
      { error: "Desculpe, ocorreu um erro. Tente novamente. 🙏" },
      { status: 500 },
    );
  }
}
