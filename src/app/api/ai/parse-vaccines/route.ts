/* ------------------------------------------------------------------ */
/* POST /api/ai/parse-vaccines                                         */
/* Receives a vaccination card image, runs vision AI, returns          */
/* structured vaccine records                                          */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { getActiveGroup } from "@/lib/group-utils";
import { compressImageForVision } from "@/lib/ai/image-utils";
import { routeVisionRequest } from "@/lib/ai/router";
import { parseVaccinesRateLimiter } from "@/lib/rate-limit";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
];

interface ParsedVaccine {
  vaccine_name: string;
  dose_label: string | null;
  administered_date: string | null;
  batch_number: string | null;
  location: string | null;
  /** Confiança 0..1 no nome reconhecido (calibração explícita do modelo). */
  name_confidence: number;
  /** Confiança 0..1 na data lida (campo com maior taxa de erro em OCR). */
  date_confidence: number;
  /** Média ponderada (date pesa mais — é a fonte dominante de erro real).
   *  Persiste em vaccination_records.confidence_score via vaccines-bulk. */
  confidence_score: number;
}

const SYSTEM_PROMPT = `Você é um assistente especializado em ler carteirinhas de vacinação brasileiras.
Sua tarefa é extrair TODAS as vacinas visíveis na imagem da carteirinha de vacinação.
Retorne APENAS um JSON válido, sem markdown, sem explicações.
Seja CONSERVADOR em confidence: se a leitura não é nítida, atribua confiança baixa (≤ 0.5).`;

const USER_PROMPT = `Analise esta imagem de uma carteirinha de vacinação brasileira.

Extraia TODAS as vacinas visíveis e retorne um array JSON com os seguintes campos para cada vacina:
- "vaccine_name": nome da vacina (ex: BCG, Hepatite B, Pentavalente, VIP, VOP, Rotavírus, Pneumocócica 10, Meningocócica C, Febre Amarela, Tríplice Viral, Tríplice Bacteriana, Varicela, Hepatite A, HPV, dT, etc.)
- "dose_label": rótulo da dose (ex: "1ª dose", "2ª dose", "3ª dose", "Reforço", "Dose única", ou null se não identificável)
- "administered_date": data de aplicação no formato YYYY-MM-DD (ou null se não legível)
- "batch_number": número do lote (ou null se não legível)
- "location": local de aplicação / unidade de saúde (ou null se não legível)
- "name_confidence": número de 0 a 1 indicando confiança no nome lido. 1.0 = certeza visual. 0.5 = palpite razoável. 0.0 = chute.
- "date_confidence": número de 0 a 1 indicando confiança na data lida. ATENÇÃO: anos antigos (mais de 5 anos atrás) em vacinas anuais (Influenza, COVID-19) são SUSPEITOS — pode estar lendo um campo de outro registro. Nesses casos use confidence baixa (0.3-0.5) e avise pelo valor.

Regras:
- Se um campo não for legível, use null
- Datas devem estar no formato YYYY-MM-DD
- Inclua TODAS as vacinas que conseguir identificar, mesmo com dados parciais
- Se a imagem não for uma carteirinha de vacinação, retorne um array vazio []
- Retorne APENAS o array JSON, sem texto adicional
- Calibração de confidence: seja conservador. É melhor 0.6 conservador do que 0.95 enganoso. A UI usa esses valores pra alertar o usuário e pedir revisão.

Exemplo de resposta:
[{"vaccine_name":"BCG","dose_label":"Dose única","administered_date":"2023-01-15","batch_number":"ABC123","location":"UBS Centro","name_confidence":0.95,"date_confidence":0.9},{"vaccine_name":"Hepatite B","dose_label":"1ª dose","administered_date":"2023-01-15","batch_number":null,"location":null,"name_confidence":0.9,"date_confidence":0.7}]`;

/**
 * Sanitiza confidence reportada pela AI: clamp em [0, 1], default 0.5
 * quando ausente/inválido (decisão neutra — UI não destaca, nem confia cega).
 */
function sanitizeConfidence(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth — accepts Bearer (native) or cookie (PWA) via the shared helper
    const auth = await resolveAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    // Admin client for server-trusted operations (logs, group lookup).
    // Bypassing RLS is safe here because we just authenticated the user.
    const supabase = createAdminClient();

    const rl = parseVaccinesRateLimiter.check(auth.id);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const activeGroup = await getActiveGroup(supabase, auth.id);
    if (!activeGroup) {
      return NextResponse.json({ error: "Sem grupo ativo" }, { status: 403 });
    }

    // 2. Parse multipart form
    const formData = (await request.formData()) as unknown as globalThis.FormData;
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Máximo 10MB." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Tipo de arquivo não suportado. Envie uma imagem (JPG, PNG, WebP) ou PDF.",
        },
        { status: 400 }
      );
    }

    // 3. Compress image and call vision AI
    const buffer = Buffer.from(await file.arrayBuffer());
    const { base64, mimeType } = await compressImageForVision(buffer);

    const startTime = Date.now();
    const result = await routeVisionRequest(
      base64,
      mimeType,
      SYSTEM_PROMPT,
      USER_PROMPT,
      { temperature: 0.1, maxTokens: 4000 }
    );
    const processingTimeMs = Date.now() - startTime;

    // 4. Parse AI response
    let vaccines: ParsedVaccine[] = [];
    try {
      // Clean response — remove markdown fences if present
      let cleaned = result.text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        vaccines = parsed.map((v: Record<string, unknown>) => {
          const name_confidence = sanitizeConfidence(v.name_confidence);
          const date_confidence = sanitizeConfidence(v.date_confidence);
          // Date weight=0.6 porque date errado é o erro mais frequente do OCR
          // (ano lido de outro campo, etc.) e o que mais impacta o motor de
          // saúde preventiva (vacinas anuais com data antiga = "future").
          const confidence_score = Number(
            (name_confidence * 0.4 + date_confidence * 0.6).toFixed(2),
          );
          return {
            vaccine_name: String(v.vaccine_name || ""),
            dose_label: v.dose_label ? String(v.dose_label) : null,
            administered_date: v.administered_date ? String(v.administered_date) : null,
            batch_number: v.batch_number ? String(v.batch_number) : null,
            location: v.location ? String(v.location) : null,
            name_confidence,
            date_confidence,
            confidence_score,
          };
        }).filter((v) => v.vaccine_name.length > 0);
      }
    } catch (parseErr) {
      console.error("[parse-vaccines] JSON parse error:", parseErr, "Raw:", result.text);
      return NextResponse.json({
        success: false,
        vaccines: [],
        provider: result.provider,
        error: "Não foi possível interpretar os dados da carteirinha. Tente com uma foto mais nítida.",
      });
    }

    // 5. Log to database — ocr_confidence agora reflete a média real das
    // confidences dos campos quando há vacinas; null quando nenhuma extraída.
    const avgConfidence = vaccines.length > 0
      ? Number((
          vaccines.reduce((acc, v) => acc + v.confidence_score, 0) / vaccines.length
        ).toFixed(2))
      : null;
    await supabase.from("ai_event_logs").insert({
      user_id: auth.id,
      group_id: activeGroup.groupId,
      raw_text: result.text.substring(0, 5000),
      parsed_json: vaccines,
      success: vaccines.length > 0,
      parser_type: "vaccine-card-vision",
      processing_time_ms: processingTimeMs,
      ocr_confidence: avgConfidence,
    });

    // 6. Return result
    return NextResponse.json({
      success: vaccines.length > 0,
      vaccines,
      provider: result.provider,
      error: vaccines.length === 0
        ? "Nenhuma vacina encontrada na imagem. Verifique se a foto está nítida e mostra a carteirinha de vacinação."
        : undefined,
    });
  } catch (err) {
    console.error("[parse-vaccines] Error:", err);
    reportServerError(err, { filePath: "src/app/api/ai/parse-vaccines/route.ts" });
    return NextResponse.json(
      {
        success: false,
        vaccines: [],
        error: "Erro interno ao processar a carteirinha. Tente novamente.",
      },
      { status: 500 }
    );
  }
}
