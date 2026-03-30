/* ------------------------------------------------------------------ */
/* POST /api/ai/parse-vaccines                                         */
/* Receives a vaccination card image, runs vision AI, returns          */
/* structured vaccine records                                          */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
}

const SYSTEM_PROMPT = `Você é um assistente especializado em ler carteirinhas de vacinação brasileiras.
Sua tarefa é extrair TODAS as vacinas visíveis na imagem da carteirinha de vacinação.
Retorne APENAS um JSON válido, sem markdown, sem explicações.`;

const USER_PROMPT = `Analise esta imagem de uma carteirinha de vacinação brasileira.

Extraia TODAS as vacinas visíveis e retorne um array JSON com os seguintes campos para cada vacina:
- "vaccine_name": nome da vacina (ex: BCG, Hepatite B, Pentavalente, VIP, VOP, Rotavírus, Pneumocócica 10, Meningocócica C, Febre Amarela, Tríplice Viral, Tríplice Bacteriana, Varicela, Hepatite A, HPV, dT, etc.)
- "dose_label": rótulo da dose (ex: "1ª dose", "2ª dose", "3ª dose", "Reforço", "Dose única", ou null se não identificável)
- "administered_date": data de aplicação no formato YYYY-MM-DD (ou null se não legível)
- "batch_number": número do lote (ou null se não legível)
- "location": local de aplicação / unidade de saúde (ou null se não legível)

Regras:
- Se um campo não for legível, use null
- Datas devem estar no formato YYYY-MM-DD
- Inclua TODAS as vacinas que conseguir identificar, mesmo com dados parciais
- Se a imagem não for uma carteirinha de vacinação, retorne um array vazio []
- Retorne APENAS o array JSON, sem texto adicional

Exemplo de resposta:
[{"vaccine_name":"BCG","dose_label":"Dose única","administered_date":"2023-01-15","batch_number":"ABC123","location":"UBS Centro"},{"vaccine_name":"Hepatite B","dose_label":"1ª dose","administered_date":"2023-01-15","batch_number":null,"location":null}]`;

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const rl = parseVaccinesRateLimiter.check(user.id);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const activeGroup = await getActiveGroup(supabase, user.id);
    if (!activeGroup) {
      return NextResponse.json({ error: "Sem grupo ativo" }, { status: 403 });
    }

    // 2. Parse multipart form
    const formData = await request.formData();
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
        vaccines = parsed.map((v: Record<string, unknown>) => ({
          vaccine_name: String(v.vaccine_name || ""),
          dose_label: v.dose_label ? String(v.dose_label) : null,
          administered_date: v.administered_date ? String(v.administered_date) : null,
          batch_number: v.batch_number ? String(v.batch_number) : null,
          location: v.location ? String(v.location) : null,
        })).filter((v) => v.vaccine_name.length > 0);
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

    // 5. Log to database
    await supabase.from("ai_event_logs").insert({
      user_id: user.id,
      group_id: activeGroup.groupId,
      raw_text: result.text.substring(0, 5000),
      parsed_json: vaccines,
      success: vaccines.length > 0,
      parser_type: "vaccine-card-vision",
      processing_time_ms: processingTimeMs,
      ocr_confidence: null,
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
