"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPhone, normalizePhone } from "@/lib/whatsapp/signature";
import { sendAuthTemplate, sendTextMessage } from "@/lib/whatsapp/client";
import { revalidatePath } from "next/cache";
import { reportServerError } from "@/lib/error-tracking/report-server";

/**
 * Step 1: Request WhatsApp linking — sends OTP via WhatsApp
 */
export async function requestWhatsAppLink(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const rawPhone = (formData.get("phone") as string)?.trim();
  if (!rawPhone) return { error: "Numero de telefone obrigatorio" };

  const phone = normalizePhone(rawPhone);
  const hash = hashPhone(phone);

  // Validate phone format (E.164: + followed by 10-15 digits)
  if (!/^\+\d{10,15}$/.test(phone)) {
    return { error: "Formato invalido. Use +55DDNNNNNNNNN" };
  }

  const admin = createAdminClient();

  // Check if phone is already linked to another user
  const { data: existing } = await admin
    .from("whatsapp_phone_links")
    .select("id, user_id, verified_at")
    .eq("phone_hash", hash)
    .eq("is_active", true)
    .single();

  if (existing && existing.user_id !== user.id && existing.verified_at) {
    return { error: "Este numero ja esta vinculado a outra conta" };
  }

  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  if (existing && existing.user_id === user.id) {
    // Update existing record
    await admin
      .from("whatsapp_phone_links")
      .update({
        verification_code: otp,
        verification_expires_at: expiresAt,
        verified_at: null,
      })
      .eq("id", existing.id);
  } else {
    // Delete any old unverified records for this user
    await admin
      .from("whatsapp_phone_links")
      .delete()
      .eq("user_id", user.id)
      .is("verified_at", null);

    // Create new record
    await admin
      .from("whatsapp_phone_links")
      .insert({
        user_id: user.id,
        phone_number: phone,
        phone_hash: hash,
        verification_code: otp,
        verification_expires_at: expiresAt,
        is_active: true,
        lgpd_consent_at: new Date().toISOString(),
      });
  }

  // Envio do OTP. Se `WHATSAPP_OTP_TEMPLATE` estiver setado, usa um template de
  // AUTENTICACAO aprovado (entrega FORA da janela de 24h — fix do codigo que nao
  // chegava pra quem nunca falou com o bot). Senao, cai no texto livre (so
  // entrega dentro da janela). Inerte ate a env existir + template aprovado.
  const phoneWithout = phone.replace("+", "");
  const otpTemplate = process.env.WHATSAPP_OTP_TEMPLATE;
  const otpTemplateLang = process.env.WHATSAPP_OTP_TEMPLATE_LANG || "pt_BR";
  try {
    if (otpTemplate) {
      await sendAuthTemplate(phoneWithout, otpTemplate, otpTemplateLang, otp);
    } else {
      await sendTextMessage(
        phoneWithout,
        `Kindar - Codigo de verificacao: *${otp}*\n\nDigite este codigo no app para vincular seu WhatsApp.\n\nExpira em 10 minutos.`
      );
    }
  } catch (err) {
    console.error("[WA-LINK] Failed to send OTP:", err);
    reportServerError(err, { filePath: "src/actions/whatsapp.ts" });
    return { error: "Nao foi possivel enviar o codigo. Verifique se o numero esta correto e tem WhatsApp." };
  }

  revalidatePath("/perfil");
  return { success: true, phone };
}

/**
 * Step 2: Verify OTP and complete linking
 */
export async function verifyWhatsAppOTP(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const otp = (formData.get("otp") as string)?.trim();
  if (!otp || otp.length !== 6) return { error: "Codigo deve ter 6 digitos" };

  const admin = createAdminClient();

  const { data: link } = await admin
    .from("whatsapp_phone_links")
    .select("id, verification_code, verification_expires_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .is("verified_at", null)
    .single();

  if (!link) return { error: "Nenhuma vinculacao pendente encontrada" };

  if (link.verification_code !== otp) {
    return { error: "Codigo incorreto" };
  }

  if (new Date(link.verification_expires_at) < new Date()) {
    return { error: "Codigo expirado. Solicite um novo." };
  }

  // Mark as verified
  await admin
    .from("whatsapp_phone_links")
    .update({
      verified_at: new Date().toISOString(),
      verification_code: null,
      verification_expires_at: null,
    })
    .eq("id", link.id);

  revalidatePath("/perfil");
  return { success: true };
}

/**
 * Unlink WhatsApp from account
 */
export async function unlinkWhatsApp() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const admin = createAdminClient();

  // Soft-delete: deactivate instead of delete
  await admin
    .from("whatsapp_phone_links")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);

  // Clean up session
  await admin
    .from("whatsapp_sessions")
    .delete()
    .eq("user_id", user.id);

  revalidatePath("/perfil");
  return { success: true };
}

/**
 * Get current WhatsApp link status for the user
 */
export async function getWhatsAppLinkStatus() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: link } = await supabase
    .from("whatsapp_phone_links")
    .select("id, phone_number, verified_at, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!link) return { status: "unlinked" as const };

  if (!link.verified_at) {
    return { status: "pending" as const, phone: link.phone_number };
  }

  return { status: "linked" as const, phone: link.phone_number };
}
