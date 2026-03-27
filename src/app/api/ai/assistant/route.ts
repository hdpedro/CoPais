import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@/lib/supabase/server";
import { getActionsForPromptCompact } from "@/lib/ai-actions";
import { buildGroupContext } from "@/lib/ai-context";
import { aiCache } from "@/lib/ai-cache";
import { aiRateLimiter } from "@/lib/ai-rate-limit";

const ALLOWED_EMAILS = [
  "henrique.pedros@hotmail.com",
  "angelino@beevale.com.br",
  "amanda",
];

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/** Retry a Groq call with exponential backoff on rate-limit errors */
async function callGroqWithRetry(
  systemPrompt: string,
  userText: string,
  maxRetries = 2
): Promise<{
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      });
      return {
        content:
          completion.choices[0]?.message?.content ||
          '{"action":"unknown","params":{},"confirmation":"Erro interno"}',
        usage: completion.usage
          ? {
              prompt_tokens: completion.usage.prompt_tokens,
              completion_tokens: completion.usage.completion_tokens,
              total_tokens: completion.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error: unknown) {
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes("rate_limit") ||
          ("status" in error && (error as { status: number }).status === 429));

      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  // Unreachable but satisfies TypeScript
  throw new Error("Max retries exceeded");
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Whitelist check
    const email = user.email || "";
    const isAllowed = ALLOWED_EMAILS.some((e) =>
      email.toLowerCase().includes(e.toLowerCase())
    );
    if (!isAllowed) {
      return NextResponse.json(
        { error: "Assistente não disponível para sua conta" },
        { status: 403 }
      );
    }

    // Rate limiting
    const rateCheck = aiRateLimiter.check(user.id);
    if (!rateCheck.allowed) {
      const retryAfterSec = Math.ceil(rateCheck.retryAfterMs / 1000);
      return NextResponse.json(
        {
          error: `Muitas requisições. Tente novamente em ${retryAfterSec}s.`,
          retryAfterMs: rateCheck.retryAfterMs,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        }
      );
    }

    const { text, groupId, locale } = await req.json();

    if (!text || !groupId) {
      return NextResponse.json(
        { error: "Texto e groupId são obrigatórios" },
        { status: 400 }
      );
    }

    // Check cache first
    const cached = aiCache.get(text, groupId);
    if (cached) {
      return NextResponse.json({ ...cached, _cached: true });
    }

    // Build context
    const context = await buildGroupContext(user.id, groupId);
    const actions = getActionsForPromptCompact();

    const systemPrompt = `Assistente Kindar (app coparentalidade). Interprete o comando e retorne JSON.

CONTEXTO:
${context}

AÇÕES:
${actions}

FORMATO: {"action":"nomeAcao","params":{...},"confirmation":"msg curta em ${locale || "pt"}"}
Se não entender: {"action":"unknown","params":{},"confirmation":"Não entendi. Pode reformular?"}

REGRAS:
- Datas relativas → calcule data real (hoje = data atual do contexto)
- Resolva nomes de crianças pelo contexto
- Valores monetários → números (50 reais → 50)
- Não invente dados não mencionados`;

    const result = await callGroqWithRetry(systemPrompt, text);

    let parsed;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      parsed = {
        action: "unknown",
        params: {},
        confirmation: "Não entendi. Tente novamente.",
      };
    }

    // Cache the response
    aiCache.set(text, groupId, parsed);

    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro interno";
    console.error("AI Assistant error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
