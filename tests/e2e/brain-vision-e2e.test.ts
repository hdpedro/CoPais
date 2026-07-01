/* ------------------------------------------------------------------ */
/* E2E de VISÃO REAL — foto de calendário escolar → plano válido.       */
/*                                                                      */
/* Bate no provider de visão DE VERDADE (gpt-4o → fallbacks). Gated:    */
/* só roda com BRAIN_E2E=1 E uma chave de provider no ambiente — assim  */
/* NUNCA roda no `npm test`/CI sem intenção (custo + não-determinismo). */
/*                                                                      */
/* Rodar (onde houver chaves):                                          */
/*   BRAIN_E2E=1 OPENAI_API_KEY=sk-... \                                */
/*     node node_modules/vitest/vitest.mjs run tests/e2e/brain-vision-e2e.test.ts \
/*     --no-file-parallelism                                            */
/*                                                                      */
/* Prova: foto real → extração (vision) → playbook.parse → plan →       */
/* validate → payloads da RPC. O resto do encadeamento (execute_plan /  */
/* apply_undo / claim) já está validado em branch Supabase.             */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compressImageForVision } from "@/lib/ai/image-utils";
import { routeVisionRequest } from "@/lib/ai/router";
import { SCHOOL_CALENDAR_EXTRACTION } from "@/lib/ai/prompts/brain";
import { schoolCalendarPlaybook } from "@/lib/ai/brain/understanding/playbooks/school-calendar";
import { validatePlanForExecution } from "@/lib/ai/brain/validate-plan";
import { buildSchoolLogPayloads, buildOutboxPayloads } from "@/lib/ai/brain/materialize-payload";
import type { PlaybookContext } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";
const hasKey = !!(
  process.env.OPENAI_API_KEY ||
  process.env.GROQ_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.TOGETHER_API_KEY
);
const enabled = process.env.BRAIN_E2E === "1" && hasKey;

describe.skipIf(!enabled)("E2E: visão real → plano (gpt-4o)", () => {
  it("foto de calendário escolar vira um plano válido e materializável", async () => {
    const buf = readFileSync(resolve(process.cwd(), "tests/fixtures/school-calendar-sample.png"));
    const { base64, mimeType } = await compressImageForVision(buf);

    const vision = await routeVisionRequest(
      base64,
      mimeType,
      SCHOOL_CALENDAR_EXTRACTION.system,
      SCHOOL_CALENDAR_EXTRACTION.user,
      { temperature: 0.1, maxTokens: 4000 },
    );

    let cleaned = vision.text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const raw = JSON.parse(cleaned);

    const ctx: PlaybookContext = {
      groupId: "g1",
      userId: "u1",
      channel: "pwa",
      today: "2026-06-30",
      timezone: "America/Sao_Paulo",
      children: [{ id: CHILD, name: "Martim" }],
      resolvedChildId: CHILD,
      schoolYearAnchor: 2026,
    };

    const data = schoolCalendarPlaybook.parse(raw, ctx);
    expect(data, "playbook reconheceu como calendário escolar").not.toBeNull();

    const plan = schoolCalendarPlaybook.plan(data!, ctx);
    // O fixture tem 4 provas com data; espera ao menos 3 (margem p/ OCR).
    expect(plan.activities!.length).toBeGreaterThanOrEqual(3);

    const validation = validatePlanForExecution(plan, ctx.today);
    expect(validation.ok, JSON.stringify(validation.errors)).toBe(true);

    const logs = buildSchoolLogPayloads(plan);
    expect(logs.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.log_date))).toBe(true);
    expect(logs.every((l) => typeof l.payload_hash === "string" && l.payload_hash.length === 64)).toBe(true);

    const outbox = buildOutboxPayloads({
      intakeId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      recipientIds: ["22222222-2222-2222-2222-222222222222"],
      docType: plan.docType,
      childId: CHILD,
      createdCount: logs.length,
    });
    expect(outbox).toHaveLength(1);

    console.log(
      `[E2E] provider=${vision.provider} provas=${logs.length} →`,
      logs.map((l) => `${l.title}@${l.log_date}`).join(" | "),
    );
  }, 90_000);
});
