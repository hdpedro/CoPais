/* ------------------------------------------------------------------ */
/* WhatsApp phone-link service                                         */
/*                                                                     */
/* Regra 11 (paridade PWA ↔ Nativo ↔ WhatsApp): a lógica de vincular  */
/* um número de WhatsApp vive AQUI, uma única vez. Os callers finos:   */
/*   - src/actions/whatsapp.ts          (PWA — server actions)         */
/*   - src/app/api/native/whatsapp/route.ts  (Native — REST + Bearer)  */
/* só fazem auth + adaptação do retorno.                               */
/*                                                                     */
/* Bug 2026-07-01 (Família Coelho, tester): `whatsapp_phone_links` tem */
/* UNIQUE(phone_number) GLOBAL (migration 00043). O `unlink` faz       */
/* soft-delete (is_active=false) mas MANTÉM a linha com o phone_number.*/
/* O request antigo procurava a linha existente filtrando is_active=   */
/* true, então NÃO enxergava a linha soft-deleted (nem uma linha de    */
/* outro usuário). Caía no INSERT, que colidia no UNIQUE(phone_number) */
/* → erro 23505 — e o erro NUNCA era checado: o código seguia, mandava */
/* o OTP ("Código enviado!") e retornava sucesso. Nenhuma linha        */
/* pendente era persistida, então o verify retornava "Nenhuma          */
/* vinculação pendente encontrada". Conta ficava travada pra sempre.   */
/*                                                                     */
/* Fix: REUSAR a linha dona do phone_number (take-over + reativação)   */
/* em vez de inserir cega, e CHECAR todo write — nunca reportar        */
/* "sucesso" sem ter persistido a pendência. Só manda o OTP depois que */
/* a linha pendente está gravada. Correto tanto sob o UNIQUE global    */
/* antigo quanto sob o índice parcial WHERE is_active (migration       */
/* 00135) — independe da ordem de deploy.                              */
/* ------------------------------------------------------------------ */

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashPhone, normalizePhone } from "@/lib/whatsapp/signature";
import { sendAuthTemplate, sendTextMessage } from "@/lib/whatsapp/client";
import { reportServerError } from "@/lib/error-tracking/report-server";

const FILE = "src/lib/services/whatsapp-link.ts";

export type WaLinkErrorCode =
  | "invalid_phone"
  | "phone_taken"
  | "persist_failed"
  | "send_failed";

export type WaLinkResult =
  | { ok: true; phone: string }
  | { ok: false; code: WaLinkErrorCode; error: string };

export type WaVerifyErrorCode =
  | "invalid_otp_format"
  | "no_pending"
  | "wrong_code"
  | "expired"
  | "persist_failed";

export type WaVerifyResult =
  | { ok: true }
  | { ok: false; code: WaVerifyErrorCode; error: string };

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos

function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Passo 1: solicita a vinculação — grava a pendência e ENVIA o OTP.
 * O caller deve usar um admin client (service role). `userId` já vem
 * autenticado pelo caller.
 */
export async function requestWhatsAppLinkService(
  admin: SupabaseClient,
  userId: string,
  rawPhone: string,
): Promise<WaLinkResult> {
  const trimmed = (rawPhone || "").trim();
  if (!trimmed) {
    return { ok: false, code: "invalid_phone", error: "Numero de telefone obrigatorio" };
  }

  const phone = normalizePhone(trimmed);
  const hash = hashPhone(phone);

  // E.164: + seguido de 10-15 dígitos.
  if (!/^\+\d{10,15}$/.test(phone)) {
    return { ok: false, code: "invalid_phone", error: "Formato invalido. Use +55DDNNNNNNNNN" };
  }

  // Procura QUALQUER linha dona deste número — inclusive soft-deleted
  // (is_active=false). `phone_number` é único (global hoje; parcial WHERE
  // is_active após 00135), então há no máximo uma linha ATIVA; ativa primeiro,
  // mais recente primeiro.
  const { data: rows, error: lookupErr } = await admin
    .from("whatsapp_phone_links")
    .select("id, user_id, verified_at, is_active")
    .eq("phone_hash", hash)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (lookupErr) {
    reportServerError(lookupErr, { filePath: FILE });
    return { ok: false, code: "persist_failed", error: "Nao foi possivel iniciar a vinculacao. Tente novamente." };
  }

  const existing = rows?.[0] ?? null;

  // Rejeita SÓ quando um vínculo ATIVO e VERIFICADO pertence a outra conta.
  if (existing && existing.is_active && existing.verified_at && existing.user_id !== userId) {
    return { ok: false, code: "phone_taken", error: "Este numero ja esta vinculado a outra conta" };
  }

  const otp = genOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  // Limpa OUTRAS pendências deste usuário (números diferentes) pra o verify
  // sempre achar exatamente uma linha pendente. Não toca na linha deste número.
  const { error: cleanupErr } = await admin
    .from("whatsapp_phone_links")
    .delete()
    .eq("user_id", userId)
    .is("verified_at", null)
    .neq("phone_hash", hash);
  if (cleanupErr) {
    // Non-fatal pro fix da colisão, mas registra.
    reportServerError(cleanupErr, { filePath: FILE });
  }

  if (existing) {
    // Reusa a linha dona do número: take-over + reativação. Funciona quer ela
    // estivesse inativa (unlink anterior) quer fosse um vínculo não verificado.
    const { error: updErr } = await admin
      .from("whatsapp_phone_links")
      .update({
        user_id: userId,
        is_active: true,
        active_group_id: null,
        verification_code: otp,
        verification_expires_at: expiresAt,
        verified_at: null,
        lgpd_consent_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updErr) {
      reportServerError(updErr, { filePath: FILE });
      return { ok: false, code: "persist_failed", error: "Nao foi possivel iniciar a vinculacao. Tente novamente." };
    }
  } else {
    const { error: insErr } = await admin
      .from("whatsapp_phone_links")
      .insert({
        user_id: userId,
        phone_number: phone,
        phone_hash: hash,
        verification_code: otp,
        verification_expires_at: expiresAt,
        is_active: true,
        lgpd_consent_at: new Date().toISOString(),
      });
    if (insErr) {
      reportServerError(insErr, { filePath: FILE });
      // 23505 = corrida por este número (alguém vinculou entre o lookup e aqui).
      const taken = (insErr as { code?: string })?.code === "23505";
      return taken
        ? { ok: false, code: "phone_taken", error: "Este numero ja esta vinculado a outra conta" }
        : { ok: false, code: "persist_failed", error: "Nao foi possivel iniciar a vinculacao. Tente novamente." };
    }
  }

  // Só AGORA que a pendência está gravada é que o OTP é enviado. Se o envio
  // falhar, a linha pendente já existe — o usuário pode reenviar sem travar.
  const phoneWithout = phone.replace("+", "");
  const otpTemplate = process.env.WHATSAPP_OTP_TEMPLATE;
  const otpTemplateLang = process.env.WHATSAPP_OTP_TEMPLATE_LANG || "pt_BR";
  try {
    if (otpTemplate) {
      await sendAuthTemplate(phoneWithout, otpTemplate, otpTemplateLang, otp);
    } else {
      await sendTextMessage(
        phoneWithout,
        `Kindar - Codigo de verificacao: *${otp}*\n\nDigite este codigo no app para vincular seu WhatsApp.\n\nExpira em 10 minutos.`,
      );
    }
  } catch (err) {
    console.error("[WA-LINK] Failed to send OTP:", err);
    reportServerError(err, { filePath: FILE });
    return {
      ok: false,
      code: "send_failed",
      error: "Nao foi possivel enviar o codigo. Verifique se o numero esta correto e tem WhatsApp.",
    };
  }

  return { ok: true, phone };
}

/**
 * Passo 2: verifica o OTP e conclui a vinculação.
 */
export async function verifyWhatsAppLinkService(
  admin: SupabaseClient,
  userId: string,
  rawOtp: string,
): Promise<WaVerifyResult> {
  const otp = (rawOtp || "").trim();
  if (!otp || otp.length !== 6) {
    return { ok: false, code: "invalid_otp_format", error: "Codigo deve ter 6 digitos" };
  }

  const { data: link, error: lookupErr } = await admin
    .from("whatsapp_phone_links")
    .select("id, verification_code, verification_expires_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    reportServerError(lookupErr, { filePath: FILE });
    return { ok: false, code: "persist_failed", error: "Nao foi possivel verificar o codigo. Tente novamente." };
  }
  if (!link) {
    return { ok: false, code: "no_pending", error: "Nenhuma vinculacao pendente encontrada" };
  }
  if (link.verification_code !== otp) {
    return { ok: false, code: "wrong_code", error: "Codigo incorreto" };
  }
  if (!link.verification_expires_at || new Date(link.verification_expires_at) < new Date()) {
    return { ok: false, code: "expired", error: "Codigo expirado. Solicite um novo." };
  }

  const { error: updErr } = await admin
    .from("whatsapp_phone_links")
    .update({
      verified_at: new Date().toISOString(),
      verification_code: null,
      verification_expires_at: null,
    })
    .eq("id", link.id);
  if (updErr) {
    reportServerError(updErr, { filePath: FILE });
    return { ok: false, code: "persist_failed", error: "Nao foi possivel concluir a vinculacao. Tente novamente." };
  }

  return { ok: true };
}
