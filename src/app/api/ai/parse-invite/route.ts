/* ------------------------------------------------------------------ */
/* POST /api/ai/parse-invite                                           */
/* Receives an image/PDF, runs OCR + LLM, returns structured event     */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getEventParser } from "@/lib/ai/parser";
import { parseInviteRateLimiter } from "@/lib/rate-limit";

export const maxDuration = 60; // Tesseract can be slow on large images

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

    const rl = parseInviteRateLimiter.check(user.id);
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

    // 3. Run parser
    const parser = getEventParser();
    const result = await parser.parse(file);

    // 4. Log to database
    await supabase.from("ai_event_logs").insert({
      user_id: user.id,
      group_id: activeGroup.groupId,
      raw_text: result.rawText?.substring(0, 5000) || null,
      parsed_json: result.data,
      success: result.success,
      parser_type: result.metadata.parserType,
      processing_time_ms: result.metadata.processingTimeMs,
      ocr_confidence: result.metadata.ocrConfidence ?? null,
    });

    // 5. Return result
    return NextResponse.json({
      success: result.success,
      data: result.data,
      error: result.error,
      metadata: {
        processingTimeMs: result.metadata.processingTimeMs,
        ocrConfidence: result.metadata.ocrConfidence,
      },
    });
  } catch (err) {
    console.error("[parse-invite] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno ao processar o convite. Tente novamente.",
      },
      { status: 500 }
    );
  }
}
