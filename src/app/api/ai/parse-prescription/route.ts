/* ------------------------------------------------------------------ */
/* POST /api/ai/parse-prescription                                     */
/* Receives a prescription image, runs vision OCR + clinical inference, */
/* cross-references child history, returns enriched clinical context    */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveGroup } from "@/lib/group-utils";
import { getUserSubscription } from "@/lib/subscription";
import { canAccess } from "@/lib/feature-gate";
import { compressImageForVision } from "@/lib/ai/image-utils";
import { routeVisionRequest, routeTextRequest } from "@/lib/ai/router";
import { logAIRequest } from "@/lib/ai/core/logger";
import { parsePrescriptionRateLimiter } from "@/lib/rate-limit";
import {
  PRESCRIPTION_OCR_SYSTEM,
  PRESCRIPTION_OCR_USER,
  CLINICAL_INFERENCE_SYSTEM,
  buildClinicalInferenceUser,
} from "@/lib/ai/prompts/prescription";
import {
  normalizeMedName,
  isAntibiotic,
  computeChildAge,
  type ParsedMedication,
  type ClinicalInference,
  type HistoryContext,
  type ClinicalAlert,
} from "@/lib/ai/prescription-utils";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp",
  "image/heic", "image/heif", "image/gif",
  "application/pdf",
];

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const rl = parsePrescriptionRateLimiter.check(user.id);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Muitas solicitacoes. Aguarde um momento." }, { status: 429 });
    }

    const activeGroup = await getActiveGroup(supabase, user.id);
    if (!activeGroup) {
      return NextResponse.json({ error: "Sem grupo ativo" }, { status: 403 });
    }

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const childId = formData.get("childId") as string;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }
    if (!childId) {
      return NextResponse.json({ error: "Crianca nao informada" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande. Maximo 10MB." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de arquivo nao suportado." }, { status: 400 });
    }

    // 3. Validate child belongs to group
    const { data: child } = await supabase
      .from("children")
      .select("id, full_name, birth_date")
      .eq("id", childId)
      .eq("group_id", activeGroup.groupId)
      .single();

    if (!child) {
      return NextResponse.json({ error: "Crianca nao encontrada no grupo." }, { status: 400 });
    }

    // 4. Check subscription tier for feature gating
    const subscription = await getUserSubscription(supabase, user.id);
    const includeClinical = canAccess("health_full", subscription.tier);
    const includeAlerts = canAccess("prescription_alerts", subscription.tier);

    // 5. Compress image
    const buffer = Buffer.from(await file.arrayBuffer());
    const { base64, mimeType } = await compressImageForVision(buffer);

    // 6. Upload original image to storage
    let sourceImageUrl: string | null = null;
    try {
      const fileName = `prescriptions/${activeGroup.groupId}/${childId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadErr } = await supabase.storage.from("documents").upload(fileName, buffer);
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);
        sourceImageUrl = urlData.publicUrl;
      }
    } catch {
      // Upload failure is non-critical
    }

    // 7. Create initial record
    const adminClient = createAdminClient();
    const { data: record } = await adminClient
      .from("clinical_context_inferences")
      .insert({
        group_id: activeGroup.groupId,
        child_id: childId,
        source_type: "photo",
        source_image_url: sourceImageUrl,
        processing_status: "processing",
        created_by: user.id,
      })
      .select("id")
      .single();

    const inferenceId = record?.id;

    // 8. AI Call 1 — Vision OCR
    let prescriptionData: Record<string, unknown> = {};
    let medicationsParsed: ParsedMedication[] = [];
    let ocrProvider = "unknown";

    try {
      const ocrResult = await routeVisionRequest(
        base64, mimeType,
        PRESCRIPTION_OCR_SYSTEM,
        PRESCRIPTION_OCR_USER,
        { temperature: 0.1, maxTokens: 4000 }
      );
      ocrProvider = ocrResult.provider;

      // Parse OCR response
      let cleaned = ocrResult.text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(cleaned);

      prescriptionData = {
        doctor_name: parsed.doctor_name || null,
        crm: parsed.crm || null,
        clinic: parsed.clinic || null,
        prescription_date: parsed.prescription_date || null,
      };

      if (Array.isArray(parsed.medications)) {
        medicationsParsed = parsed.medications
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
      }

      await logAIRequest({
        userId: user.id,
        groupId: activeGroup.groupId,
        provider: ocrProvider,
        feature: "prescription_ocr",
        success: medicationsParsed.length > 0,
        responseTimeMs: Date.now() - startTime,
      });
    } catch (err) {
      console.error("[parse-prescription] OCR error:", err);

      if (inferenceId) {
        await adminClient
          .from("clinical_context_inferences")
          .update({ processing_status: "failed", prescription_data: prescriptionData })
          .eq("id", inferenceId);
      }

      await logAIRequest({
        userId: user.id,
        groupId: activeGroup.groupId,
        provider: ocrProvider,
        feature: "prescription_ocr",
        success: false,
        responseTimeMs: Date.now() - startTime,
        errorMessage: err instanceof Error ? err.message : "OCR failed",
      });

      return NextResponse.json({
        success: false,
        error: "Nao foi possivel ler a receita. Tente com uma foto mais nitida.",
      });
    }

    if (medicationsParsed.length === 0) {
      if (inferenceId) {
        await adminClient
          .from("clinical_context_inferences")
          .update({ processing_status: "failed", prescription_data: prescriptionData })
          .eq("id", inferenceId);
      }
      return NextResponse.json({
        success: false,
        error: "Nenhum medicamento encontrado na receita. Verifique se a foto esta nitida.",
      });
    }

    // 9. Query child history in parallel
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const oneEightyDaysAgo = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [
      { data: recentMeds },
      { data: recentEpisodes },
      { data: recentSymptoms },
      { data: allergies },
    ] = await Promise.all([
      supabase
        .from("active_medications")
        .select("name, start_date, status")
        .eq("child_id", childId)
        .gte("start_date", thirtyDaysAgo)
        .order("start_date", { ascending: false })
        .limit(20),
      supabase
        .from("illness_episodes")
        .select("title, symptoms, start_date, status, severity")
        .eq("child_id", childId)
        .gte("start_date", oneEightyDaysAgo)
        .order("start_date", { ascending: false })
        .limit(20),
      supabase
        .from("symptom_entries")
        .select("symptom_type, recorded_at, intensity")
        .eq("child_id", childId)
        .gte("recorded_at", sevenDaysAgo)
        .order("recorded_at", { ascending: false })
        .limit(20),
      supabase
        .from("child_allergies")
        .select("name, allergy_type, severity")
        .eq("child_id", childId),
    ]);

    // Build history context
    const recentAntibiotics = (recentMeds || [])
      .filter((m) => isAntibiotic(m.name))
      .map((m) => ({ name: m.name, date: m.start_date }));

    // Detect recurrence patterns (same condition title within 180 days)
    const conditionCounts: Record<string, { count: number; last_date: string }> = {};
    for (const ep of recentEpisodes || []) {
      const key = normalizeMedName(ep.title);
      if (!conditionCounts[key]) {
        conditionCounts[key] = { count: 0, last_date: ep.start_date };
      }
      conditionCounts[key].count++;
    }
    const recurrencePatterns = Object.entries(conditionCounts)
      .filter(([, v]) => v.count >= 2)
      .map(([condition, v]) => ({ condition, count: v.count, last_date: v.last_date }));

    const relatedSymptoms = (recentSymptoms || []).map((s) => ({
      type: s.symptom_type,
      date: s.recorded_at,
      intensity: s.intensity,
    }));

    // Check allergy conflicts
    const allergyConflicts: HistoryContext["allergy_conflicts"] = [];
    if (allergies && allergies.length > 0) {
      for (const med of medicationsParsed) {
        for (const allergy of allergies) {
          const medNorm = normalizeMedName(med.name);
          const allergyNorm = normalizeMedName(allergy.name);
          if (medNorm.includes(allergyNorm) || allergyNorm.includes(medNorm)) {
            allergyConflicts.push({
              medication: med.name,
              allergy_name: allergy.name,
              severity: allergy.severity,
            });
          }
        }
      }
    }

    const historyContext: HistoryContext = {
      recent_antibiotics: recentAntibiotics,
      recurrence_patterns: recurrencePatterns,
      related_symptoms: relatedSymptoms,
      allergy_conflicts: allergyConflicts,
    };

    // 10. AI Call 2 — Clinical Inference (premium+ only)
    const clinicalInferences: ClinicalInference[] = [];
    let aiSummary: string | null = null;
    let inferenceConfidence: number | null = null;
    let inferenceProvider = "skipped";

    if (includeClinical && medicationsParsed.length > 0) {
      // Cache check: look for recent inferences with same normalized names
      const normalizedNames = medicationsParsed.map((m) => m.normalized_name);
      const { data: cached } = await supabase
        .from("clinical_context_inferences")
        .select("clinical_inferences")
        .eq("child_id", childId)
        .eq("processing_status", "completed")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .limit(5);

      const cachedInferences = new Map<string, ClinicalInference>();
      if (cached) {
        for (const row of cached) {
          const infs = row.clinical_inferences as ClinicalInference[];
          if (Array.isArray(infs)) {
            for (const inf of infs) {
              if (normalizedNames.includes(inf.medication_normalized_name)) {
                cachedInferences.set(inf.medication_normalized_name, inf);
              }
            }
          }
        }
      }

      // Separate cached vs uncached medications
      const uncachedMeds = medicationsParsed.filter(
        (m) => !cachedInferences.has(m.normalized_name)
      );

      // Use cached inferences
      for (const med of medicationsParsed) {
        const cached = cachedInferences.get(med.normalized_name);
        if (cached) clinicalInferences.push(cached);
      }

      // Call AI only for uncached medications
      if (uncachedMeds.length > 0) {
        try {
          const inferenceStart = Date.now();
          const childAge = child.birth_date ? computeChildAge(child.birth_date) : "idade desconhecida";

          const userPrompt = buildClinicalInferenceUser({
            childAge,
            medications: uncachedMeds.map((m) => ({
              name: m.name,
              dosage: m.dosage,
              frequency: m.frequency,
              duration: m.duration,
            })),
            recentSymptoms: relatedSymptoms.map((s) => `${s.type} (${s.intensity || "?"})`).join(", "),
            activeIllnesses: (recentEpisodes || []).filter((e) => e.status === "active").map((e) => e.title).join(", "),
            recentAntibiotics: recentAntibiotics.map((a) => `${a.name} (${a.date})`).join(", "),
            allergies: (allergies || []).map((a) => `${a.name} (${a.severity})`).join(", "),
          });

          const result = await routeTextRequest(
            [
              { role: "system", content: CLINICAL_INFERENCE_SYSTEM },
              { role: "user", content: userPrompt },
            ],
            { temperature: 0.2, maxTokens: 3000 }
          );
          inferenceProvider = result.provider;

          let cleaned = result.text.trim();
          if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
          }
          const parsedInferences = JSON.parse(cleaned);

          if (Array.isArray(parsedInferences)) {
            for (const inf of parsedInferences) {
              clinicalInferences.push({
                medication_normalized_name: String(inf.medication_normalized_name || ""),
                possible_conditions: Array.isArray(inf.possible_conditions) ? inf.possible_conditions.map(String) : [],
                category: String(inf.category || "outro"),
                severity_level: inf.severity_level || "leve",
                confidence: typeof inf.confidence === "number" ? inf.confidence : 0.5,
                common_usage_note: String(inf.common_usage_note || ""),
              });
            }
          }

          // Compute overall confidence
          if (clinicalInferences.length > 0) {
            inferenceConfidence = clinicalInferences.reduce((sum, i) => sum + i.confidence, 0) / clinicalInferences.length;
          }

          // Build AI summary
          const conditions = clinicalInferences.flatMap((i) => i.possible_conditions).slice(0, 5);
          if (conditions.length > 0) {
            aiSummary = `Medicamentos possivelmente relacionados a: ${conditions.join(", ")}. Consulte sempre o medico da crianca.`;
          }

          await logAIRequest({
            userId: user.id,
            groupId: activeGroup.groupId,
            provider: inferenceProvider,
            feature: "clinical_inference",
            success: true,
            responseTimeMs: Date.now() - inferenceStart,
          });
        } catch (err) {
          console.error("[parse-prescription] Inference error:", err);
          await logAIRequest({
            userId: user.id,
            groupId: activeGroup.groupId,
            provider: inferenceProvider,
            feature: "clinical_inference",
            success: false,
            responseTimeMs: Date.now() - startTime,
            errorMessage: err instanceof Error ? err.message : "Inference failed",
          });
          // Partial success: OCR worked but inference failed
        }
      }
    }

    // 11. Build alerts programmatically
    const alerts: ClinicalAlert[] = [];

    if (includeAlerts || includeClinical) {
      // Allergy conflict alerts (always for premium+)
      for (const conflict of allergyConflicts) {
        alerts.push({
          type: "allergy_conflict",
          message: `"${conflict.medication}" pode ter relacao com alergia registrada "${conflict.allergy_name}" (${conflict.severity}). Revise com atencao.`,
          severity: "critical",
        });
      }
    }

    if (includeAlerts) {
      // Antibiotic frequency
      if (recentAntibiotics.length > 0 && medicationsParsed.some((m) => isAntibiotic(m.name))) {
        alerts.push({
          type: "antibiotic_frequency",
          message: `Uso recente de antibiotico identificado nos ultimos 30 dias (${recentAntibiotics[0].name}). Informe ao pediatra.`,
          severity: "warning",
        });
      }

      // Recurrence pattern
      for (const pattern of recurrencePatterns) {
        alerts.push({
          type: "recurrence",
          message: `Possivel padrao recorrente: "${pattern.condition}" registrado ${pattern.count} vezes nos ultimos 6 meses.`,
          severity: "warning",
        });
      }

      // High severity
      for (const inf of clinicalInferences) {
        if (inf.severity_level === "grave") {
          alerts.push({
            type: "high_severity",
            message: `Medicamento "${inf.medication_normalized_name}" pode estar associado a quadro de maior complexidade. Acompanhe com o pediatra.`,
            severity: "warning",
          });
        }
      }
    }

    // 12. Update record
    const processingStatus = clinicalInferences.length > 0 ? "completed" :
      (medicationsParsed.length > 0 && includeClinical ? "partial" : "completed");

    if (inferenceId) {
      await adminClient
        .from("clinical_context_inferences")
        .update({
          prescription_data: prescriptionData,
          medications_parsed: medicationsParsed,
          clinical_inferences: clinicalInferences,
          history_context: historyContext,
          ai_summary: aiSummary,
          alerts,
          inference_confidence: inferenceConfidence,
          model_version: `${ocrProvider}+${inferenceProvider}`,
          processing_status: processingStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inferenceId);
    }

    // 13. Log to ai_event_logs
    await adminClient.from("ai_event_logs").insert({
      user_id: user.id,
      group_id: activeGroup.groupId,
      raw_text: JSON.stringify(prescriptionData).substring(0, 5000),
      parsed_json: medicationsParsed,
      success: medicationsParsed.length > 0,
      parser_type: "prescription-vision",
      processing_time_ms: Date.now() - startTime,
      ocr_confidence: inferenceConfidence,
    });

    // 14. Return
    return NextResponse.json({
      success: true,
      inference: {
        id: inferenceId,
        prescription_data: prescriptionData,
        medications_parsed: medicationsParsed,
        clinical_inferences: includeClinical ? clinicalInferences : [],
        history_context: includeClinical ? historyContext : {},
        ai_summary: includeClinical ? aiSummary : null,
        alerts: includeAlerts ? alerts : (includeClinical ? alerts.filter((a) => a.type === "allergy_conflict") : []),
        inference_confidence: inferenceConfidence,
        processing_status: processingStatus,
        source_image_url: sourceImageUrl,
      },
      provider: ocrProvider,
      tier: subscription.tier,
    });
  } catch (err) {
    console.error("[parse-prescription] Error:", err);
    reportServerError(err, { filePath: "src/app/api/ai/parse-prescription/route.ts" });
    return NextResponse.json(
      { success: false, error: "Erro interno ao processar a receita. Tente novamente." },
      { status: 500 }
    );
  }
}
