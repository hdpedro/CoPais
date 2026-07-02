/* ------------------------------------------------------------------ */
/* intake-dedupe.ts — idempotência por CONTEÚDO na porta de entrada     */
/*                                                                      */
/* Prioridade do produto: o MESMO arquivo/foto/texto enviado de novo —  */
/* pela mesma pessoa, pelo coparente, ou por retry de conexão — não     */
/* pode virar segundo registro. Camadas:                                */
/*                                                                      */
/*  L1 (aqui): hash do conteúdo (source_sha256, por GRUPO) ANTES de     */
/*      criar intake/rodar IA. Zero custo de IA; pega reenvio exato.    */
/*      - intake em voo (uploaded/analyzing fresco) → "já processando"  */
/*      - aguardando confirmação → REUSA a MESMA prévia (idempotente:   */
/*        o coparente recebe os mesmos botões de confirmar)             */
/*      - executado → "já registrado", aponta pro existente             */
/*      A corrida (2 envios simultâneos) fecha no banco: índice UNIQUE  */
/*      parcial em (group_id, source_sha256) p/ status em voo — o 2º    */
/*      INSERT colide (23505) e vira "já processando".                  */
/*                                                                      */
/*  L2 (health-dedupe/partitionAgainstExisting): plano extraído vs      */
/*      histórico — pega o MESMO fato em outra foto/fraseado.           */
/*                                                                      */
/* PURO: decisão injetável (nowMs), sem I/O — o serviço faz a query.    */
/* ------------------------------------------------------------------ */

import { createHash } from "crypto";

/** Hash canônico do conteúdo de um intake (foto = bytes; texto = string).
 *  Centraliza o critério que o serviço grava em brain_intakes.source_sha256. */
export function computeSourceSha256(input: Buffer | string): string {
  const hash = createHash("sha256");
  if (typeof input === "string") hash.update(input, "utf8");
  else hash.update(input);
  return hash.digest("hex");
}

/** Um intake em voo mais velho que isto é considerado MORTO (análise que
 *  travou) — não bloqueia um reenvio legítimo. Espelha o espírito do
 *  timeout do receipt_step (bordas conversacionais nunca prendem o usuário). */
export const IN_FLIGHT_STALE_MS = 3 * 60 * 1000;

/** Linha mínima do intake anterior com o MESMO conteúdo (query do serviço). */
export interface PriorIntakeRow {
  id: string;
  status: string;
  created_at: string;
  confirmation_expires_at: string | null;
  plan: unknown | null;
  plan_hash: string | null;
  confirmation_token: string | null;
  doc_type: string | null;
  impacts: unknown | null;
}

export type PriorIntakeAction =
  /** Conteúdo já executado → responder "já registrado" (sem IA, sem intake novo). */
  | { action: "duplicate"; prior: PriorIntakeRow }
  /** Prévia ainda válida → devolver a MESMA prévia/botões (reenvio idempotente). */
  | { action: "reuse_preview"; prior: PriorIntakeRow }
  /** Análise em voo fresca (duplo toque/retry/coparente simultâneo) → "já processando". */
  | { action: "in_flight"; prior: PriorIntakeRow }
  /** Sem anterior relevante (inexistente, expirado, desfeito, falho ou voo morto) → seguir. */
  | { action: "proceed" };

/**
 * Decide o que fazer com um reenvio do MESMO conteúdo. Conservador:
 * qualquer dado faltando pro reuso seguro (plano/token/validade) → proceed
 * (reanalisar nunca é clinicamente errado; duplicar registro é).
 */
export function resolvePriorIntakeAction(prior: PriorIntakeRow | null, nowMs: number): PriorIntakeAction {
  if (!prior) return { action: "proceed" };

  if (prior.status === "executed") return { action: "duplicate", prior };

  if (prior.status === "awaiting_confirmation") {
    const validUntil = prior.confirmation_expires_at ? Date.parse(prior.confirmation_expires_at) : NaN;
    const reusable =
      Number.isFinite(validUntil) &&
      validUntil > nowMs &&
      prior.plan != null &&
      typeof prior.plan_hash === "string" &&
      prior.plan_hash.length > 0 &&
      typeof prior.confirmation_token === "string" &&
      prior.confirmation_token.length > 0;
    return reusable ? { action: "reuse_preview", prior } : { action: "proceed" };
  }

  if (prior.status === "uploaded" || prior.status === "analyzing") {
    const createdMs = Date.parse(prior.created_at);
    const fresh = Number.isFinite(createdMs) && nowMs - createdMs < IN_FLIGHT_STALE_MS;
    return fresh ? { action: "in_flight", prior } : { action: "proceed" };
  }

  // failed / undone / expired (ou status desconhecido) → reenvio legítimo.
  return { action: "proceed" };
}

/** O INSERT colidiu no índice UNIQUE parcial (corrida de envios simultâneos)? */
export function isUniqueViolation(err: { code?: string | null } | null | undefined): boolean {
  return !!err && err.code === "23505";
}
