/* ------------------------------------------------------------------ */
/* plan-hash.ts — hash canônico do plano (confirmação blindada)         */
/*                                                                      */
/* O usuário confirma EXATAMENTE o plano que viu. O hash é calculado    */
/* sobre JSON canônico (chaves ordenadas deterministicamente) e INCLUI  */
/* playbook_version + policy_version — senão:                           */
/*   - dois payloads semanticamente iguais geram hashes diferentes, ou  */
/*   - uma regra nova confirma um plano antigo sem rastreio.            */
/*                                                                      */
/* Puro + determinístico (sem Date.now/random). Server-side (node).     */
/* ------------------------------------------------------------------ */

import { createHash } from "crypto";

/**
 * Serializa um valor em JSON canônico: objetos com chaves ordenadas
 * recursivamente, arrays preservados na ordem (ordem é semântica), e
 * `undefined` omitido (igual ao JSON.stringify). Determinístico.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue; // paridade com JSON.stringify
    out[key] = sortValue(v);
  }
  return out;
}

export interface PlanHashInput {
  plan: unknown;
  playbookVersion: number;
  policyVersion: number;
  schemaVersion?: number;
}

/**
 * Hash sha256 (hex) do plano + versões. É o `plan_hash` gravado em
 * brain_intakes e revalidado na confirmação (RPC claim_execution).
 */
export function computePlanHash(input: PlanHashInput): string {
  const canonical = canonicalize({
    plan: input.plan,
    playbookVersion: input.playbookVersion,
    policyVersion: input.policyVersion,
    schemaVersion: input.schemaVersion ?? 1,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
