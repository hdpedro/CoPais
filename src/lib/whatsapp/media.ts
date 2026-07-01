/* ------------------------------------------------------------------ */
/* WhatsApp Media Handler                                             */
/* Download media + OCR for receipt images                             */
/* ------------------------------------------------------------------ */

import { downloadMedia } from "./client";
import { routeVisionRequest, routeTextRequest } from "@/lib/ai/router";
import { compressImageForVision } from "@/lib/ai/image-utils";
import {
  PRESCRIPTION_OCR_SYSTEM,
  PRESCRIPTION_OCR_USER,
  CLINICAL_INFERENCE_SYSTEM,
  buildClinicalInferenceUser,
} from "@/lib/ai/prompts/prescription";
import { normalizeMedName, computeChildAge } from "@/lib/ai/prescription-utils";
import type { ParsedMedication, ClinicalInference } from "@/lib/ai/prescription-utils";

export interface ExtractedReceipt {
  description: string;
  amount: number;
  date?: string;
  category?: string;
}

/**
 * Process a receipt image: download, compress, OCR via vision AI.
 * Returns extracted expense data or null if extraction fails.
 */
export async function processReceiptImage(
  mediaId: string,
  mediaMimeType: string,
  caption?: string,
  /** Buffer já baixado (ex: o classificador por visão já baixou a mídia) —
   *  evita re-download da Meta. Ausente → baixa por mediaId. */
  preBuffer?: Buffer,
): Promise<ExtractedReceipt | null> {
  try {
    // Download image from Meta (ou reusa o buffer já baixado)
    const imageBuffer = preBuffer ?? (await downloadMedia(mediaId));

    // Compress for vision API
    const compressed = await compressImageForVision(imageBuffer);

    // Extract receipt info via vision AI
    const systemPrompt = `Voce e um assistente que extrai dados de recibos e notas fiscais.
Extraia as seguintes informacoes da imagem:
- description: descricao breve do que foi comprado/pago
- amount: valor total em reais (numero, ex: 150.00)
- date: data do recibo no formato YYYY-MM-DD (se visivel)
- category: categoria (education, health, food, clothing, leisure, transport, housing, other)

Responda APENAS com um JSON valido, sem markdown, sem explicacao.
Exemplo: {"description":"Farmacia Drogasil","amount":45.90,"date":"2026-04-07","category":"health"}

Se nao conseguir extrair, responda: {"error":"nao_legivel"}`;

    const userPrompt = caption
      ? `Analise este recibo. Contexto adicional: "${caption}"`
      : "Analise este recibo e extraia os dados.";

    const result = await routeVisionRequest(
      compressed.base64,
      compressed.mimeType,
      systemPrompt,
      userPrompt,
      { temperature: 0.1, maxTokens: 200, timeoutMs: 15000 }
    );

    // Parse the JSON response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.error) return null;

    if (!parsed.description || !parsed.amount || parsed.amount <= 0) {
      return null;
    }

    return {
      description: String(parsed.description).slice(0, 200),
      amount: Number(parsed.amount),
      date: parsed.date || undefined,
      category: parsed.category || "other",
    };
  } catch (error) {
    console.error("[WA-MEDIA] Receipt processing error:", error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Process prescription image from WhatsApp                            */
/* ------------------------------------------------------------------ */

export interface PrescriptionSummary {
  summary: string;
  inferenceId: string;
  medicationCount: number;
}

export async function processPrescriptionImage(
  mediaId: string,
  mediaMimeType: string,
  childId: string,
  childName: string,
  childBirthDate: string,
  groupId: string,
  userId: string,
): Promise<PrescriptionSummary | null> {
  try {
    const imageBuffer = await downloadMedia(mediaId);
    const compressed = await compressImageForVision(imageBuffer);

    // OCR
    const ocrResult = await routeVisionRequest(
      compressed.base64, compressed.mimeType,
      PRESCRIPTION_OCR_SYSTEM, PRESCRIPTION_OCR_USER,
      { temperature: 0.1, maxTokens: 4000 }
    );

    let cleaned = ocrResult.text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const parsed = JSON.parse(cleaned);

    const medications: ParsedMedication[] = (parsed.medications || [])
      .map((m: Record<string, unknown>) => ({
        name: String(m.name || ""),
        normalized_name: normalizeMedName(String(m.name || "")),
        dosage: String(m.dosage || ""),
        frequency: String(m.frequency || ""),
        duration: m.duration ? String(m.duration) : null,
        route: m.route ? String(m.route) : null,
        notes: m.notes ? String(m.notes) : null,
      }))
      .filter((m: ParsedMedication) => m.name.length > 0);

    if (medications.length === 0) return null;

    // Clinical inference
    let inferences: ClinicalInference[] = [];
    try {
      const childAge = childBirthDate ? computeChildAge(childBirthDate) : "idade desconhecida";
      const userPrompt = buildClinicalInferenceUser({
        childAge,
        medications: medications.map((m) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, duration: m.duration })),
        recentSymptoms: "",
        activeIllnesses: "",
        recentAntibiotics: "",
        allergies: "",
      });

      const infResult = await routeTextRequest(
        [
          { role: "system", content: CLINICAL_INFERENCE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.2, maxTokens: 3000 }
      );

      let infCleaned = infResult.text.trim();
      if (infCleaned.startsWith("```")) {
        infCleaned = infCleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      inferences = JSON.parse(infCleaned);
    } catch {
      // Inference failure is non-critical for WhatsApp
    }

    // Save to database
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: record } = await admin
      .from("clinical_context_inferences")
      .insert({
        group_id: groupId,
        child_id: childId,
        source_type: "whatsapp",
        prescription_data: {
          doctor_name: parsed.doctor_name || null,
          prescription_date: parsed.prescription_date || null,
        },
        medications_parsed: medications,
        clinical_inferences: inferences,
        ai_summary: null,
        processing_status: inferences.length > 0 ? "completed" : "partial",
        created_by: userId,
      })
      .select("id")
      .single();

    // Build WhatsApp-friendly summary
    const medLines = medications.map((m) => {
      let line = `- ${m.name}`;
      if (m.dosage) line += ` ${m.dosage}`;
      if (m.frequency) line += ` (${m.frequency})`;
      if (m.duration) line += ` por ${m.duration}`;
      return line;
    });

    let summary = `💊 *Receita de ${childName}*\n\n${medLines.join("\n")}`;

    if (inferences.length > 0) {
      const conditions = inferences.flatMap((i) => i.possible_conditions).slice(0, 4);
      if (conditions.length > 0) {
        summary += `\n\n🔍 *Possiveis indicacoes:* ${conditions.join(", ")}`;
      }
    }

    summary += "\n\n_Informacoes geradas por IA. Nao substitui orientacao medica._";
    summary += "\n\nAcesse o app para salvar os medicamentos no prontuario.";

    return {
      summary,
      inferenceId: record?.id || "",
      medicationCount: medications.length,
    };
  } catch (error) {
    console.error("[WA-MEDIA] Prescription processing error:", error);
    return null;
  }
}
